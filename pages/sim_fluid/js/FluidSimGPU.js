/**
 * GPU-accelerated 2-D Navier-Stokes fluid solver using WebGPU.
 *
 * Architecture
 * ────────────
 * All hot-path passes run as WebGPU compute shaders on an N×N interior grid
 * (total buffer stride = N+2 to keep boundary padding compatible with the
 * CPU fallback).
 *
 * Linear solve (diffusion & pressure projection) uses Red-Black SOR instead
 * of Gauss-Seidel so even and odd checkerboard cells can be updated fully in
 * parallel with no write-after-read hazards.
 *
 * Data layout
 * ───────────
 * All six float fields (u, v, u0, v0, dens, dens0) live in a single
 * GPUBuffer (FIELD_COUNT × stride floats) accessed via byte offset.
 * A separate uniforms buffer carries scalar parameters changed per-frame.
 *
 * Boundary conditions are still applied on the CPU (they touch only the
 * four 1-cell-wide border strips — negligible cost) after a readback at
 * the end of each solver pass that needs them.  To avoid stalling the GPU
 * pipeline we use a double-buffered staging approach.
 *
 * Render
 * ──────
 * A render pass executes a full-screen fragment shader that samples the
 * density buffer and outputs colour directly to a canvas texture, so no
 * pixel-loop on the CPU is needed.
 */

// ── Field slot indices (in multiples of STRIDE floats) ─────────────────────
const F_U     = 0;
const F_V     = 1;
const F_U0    = 2;
const F_V0    = 3;
const F_DENS  = 4;
const F_DENS0 = 5;
const F_P     = 6;   // pressure scratch
const F_DIV   = 7;   // divergence scratch
const FIELD_COUNT = 8;

// Workgroup tile size (must match @workgroup_size in shaders)
const WG = 8;

// ── WGSL helpers shared across shaders ─────────────────────────────────────
const WGSL_COMMON = /* wgsl */`
struct Uniforms {
    N        : u32,
    stride   : u32,  // N+2
    iter     : u32,
    _pad     : u32,
    dt       : f32,
    diff     : f32,
    visc     : f32,
    a_diff   : f32,  // dt*diff*N*N
    c_diff   : f32,  // 1 + 4*a_diff
    a_visc   : f32,
    c_visc   : f32,
    a_proj   : f32,  // = 1  (for pressure solve)
    gravStr  : f32,
    _pad2    : f32,
    _pad3    : f32,
    _pad4    : f32,
}

@group(0) @binding(0) var<uniform>            uni    : Uniforms;
@group(0) @binding(1) var<storage, read_write> field : array<f32>;

fn IX(i: u32, j: u32) -> u32 {
    return i + uni.stride * j;
}
fn slot(f: u32, i: u32, j: u32) -> u32 {
    return f * uni.stride * uni.stride + IX(i, j);
}
`;

// ── Compute shaders ─────────────────────────────────────────────────────────

/** addSrc: field[x] += dt * field[src] for all interior cells */
const CS_ADD_SRC = WGSL_COMMON + /* wgsl */`
// push-constants via extra uniform words:
//   b0 = destination slot index, b1 = source slot index
struct AddSrcPush { dst: u32, src: u32 }
var<push_constant> push: AddSrcPush;

@compute @workgroup_size(${WG}, ${WG})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x + 1u;
    let j = gid.y + 1u;
    if (i > uni.N || j > uni.N) { return; }
    field[slot(push.dst, i, j)] += uni.dt * field[slot(push.src, i, j)];
}
`;

/**
 * Red-Black SOR iteration (one pass = one colour).
 * parity == 0 → update cells where (i+j) is even
 * parity == 1 → update cells where (i+j) is odd
 */
const CS_LINSOLVE = WGSL_COMMON + /* wgsl */`
struct LinSolvePush { xSlot: u32, x0Slot: u32, parity: u32, useVisc: u32 }
var<push_constant> push: LinSolvePush;

@compute @workgroup_size(${WG}, ${WG})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x + 1u;
    let j = gid.y + 1u;
    if (i > uni.N || j > uni.N) { return; }
    if ((i + j) % 2u != push.parity) { return; }

    let a   = select(uni.a_diff, uni.a_visc, push.useVisc != 0u);
    let c   = select(uni.c_diff, uni.c_visc, push.useVisc != 0u);
    let x0  = push.x0Slot;
    let x   = push.xSlot;

    let val = (field[slot(x0, i, j)] + a * (
        field[slot(x, i-1u, j)] + field[slot(x, i+1u, j)] +
        field[slot(x, i, j-1u)] + field[slot(x, i, j+1u)]
    )) / c;
    field[slot(x, i, j)] = val;
}
`;

/** advect: semi-Lagrangian back-trace */
const CS_ADVECT = WGSL_COMMON + /* wgsl */`
struct AdvectPush { dSlot: u32, d0Slot: u32, uSlot: u32, vSlot: u32 }
var<push_constant> push: AdvectPush;

@compute @workgroup_size(${WG}, ${WG})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x + 1u;
    let j = gid.y + 1u;
    if (i > uni.N || j > uni.N) { return; }

    let dt0 = uni.dt * f32(uni.N);
    var x   = f32(i) - dt0 * field[slot(push.uSlot, i, j)];
    var y   = f32(j) - dt0 * field[slot(push.vSlot, i, j)];

    x = clamp(x, 0.5, f32(uni.N) + 0.5);
    y = clamp(y, 0.5, f32(uni.N) + 0.5);

    let i0 = u32(x);  let i1 = i0 + 1u;
    let j0 = u32(y);  let j1 = j0 + 1u;
    let s1 = x - f32(i0);  let s0 = 1.0 - s1;
    let t1 = y - f32(j0);  let t0 = 1.0 - t1;

    field[slot(push.dSlot, i, j)] =
        s0 * (t0 * field[slot(push.d0Slot, i0, j0)] + t1 * field[slot(push.d0Slot, i0, j1)]) +
        s1 * (t0 * field[slot(push.d0Slot, i1, j0)] + t1 * field[slot(push.d0Slot, i1, j1)]);
}
`;

/** project step 1: compute divergence and zero pressure */
const CS_PROJECT_DIV = WGSL_COMMON + /* wgsl */`
@compute @workgroup_size(${WG}, ${WG})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x + 1u;
    let j = gid.y + 1u;
    if (i > uni.N || j > uni.N) { return; }
    let h = 1.0 / f32(uni.N);
    field[slot(${F_DIV}, i, j)] = -0.5 * h * (
        field[slot(${F_U}, i+1u, j)] - field[slot(${F_U}, i-1u, j)] +
        field[slot(${F_V}, i, j+1u)] - field[slot(${F_V}, i, j-1u)]
    );
    field[slot(${F_P}, i, j)] = 0.0;
}
`;

/** project step 2: pressure correction (Red-Black SOR, reuses CS_LINSOLVE) */

/** project step 3: subtract pressure gradient from velocity */
const CS_PROJECT_GRAD = WGSL_COMMON + /* wgsl */`
@compute @workgroup_size(${WG}, ${WG})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x + 1u;
    let j = gid.y + 1u;
    if (i > uni.N || j > uni.N) { return; }
    let invH = 0.5 * f32(uni.N);
    field[slot(${F_U}, i, j)] -= invH * (field[slot(${F_P}, i+1u, j)] - field[slot(${F_P}, i-1u, j)]);
    field[slot(${F_V}, i, j)] -= invH * (field[slot(${F_P}, i, j+1u)] - field[slot(${F_P}, i, j-1u)]);
}
`;

/** gravity: add downward force proportional to local density */
const CS_GRAVITY = WGSL_COMMON + /* wgsl */`
@compute @workgroup_size(${WG}, ${WG})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x + 1u;
    let j = gid.y + 1u;
    if (i > uni.N || j > uni.N) { return; }
    let d = field[slot(${F_DENS}, i, j)];
    if (d > 0.005) {
        field[slot(${F_V0}, i, j)] += uni.gravStr * uni.dt * min(d, 1.5);
    }
}
`;

/** render: density → RGBA using colour theme */
// Theme index: 0=water 1=fire 2=plasma 3=neon 4=lava
const CS_RENDER = /* wgsl */`
struct Uniforms {
    N       : u32,
    stride  : u32,
    theme   : u32,
    _pad    : u32,
}
@group(0) @binding(0) var<uniform>            uni    : Uniforms;
@group(0) @binding(1) var<storage, read>       field  : array<f32>;
@group(0) @binding(2) var                      outTex : texture_storage_2d<rgba8unorm, write>;

fn IX(i: u32, j: u32) -> u32 { return i + uni.stride * j; }
fn densSlot(i: u32, j: u32) -> u32 {
    return ${F_DENS}u * uni.stride * uni.stride + IX(i, j);
}

fn water(d: f32) -> vec3<f32> {
    let t = min(d, 2.0) * 0.5;
    return vec3(t*t*0.118, t*0.471, 0.235 + t*0.765);
}
fn fire(d: f32) -> vec3<f32> {
    let t = min(d*0.8, 1.0);
    let r = min(1.0, t*2.0);
    let g = max(0.0, t*2.0 - 1.0);
    let b = max(0.0, t*4.0 - 3.0);
    return vec3(r, g, b);
}
fn plasma(d: f32) -> vec3<f32> {
    let t = min(d, 2.0) * 0.5;
    return vec3(0.314 + t*0.686, t*0.118, 0.627 + t*0.353);
}
fn neon(d: f32) -> vec3<f32> {
    let t = min(d, 2.0) * 0.5;
    return vec3(t*0.078, t, t*0.471);
}
fn lava(d: f32) -> vec3<f32> {
    let t = min(d, 2.0) * 0.5;
    return vec3(0.706 + t*0.294, t*0.314, 0.0);
}

@compute @workgroup_size(${WG}, ${WG})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x + 1u;
    let j = gid.y + 1u;
    if (i > uni.N || j > uni.N) { return; }
    let d = field[densSlot(i, j)];
    var rgb: vec3<f32>;
    switch uni.theme {
        case 1u: { rgb = fire(d);   }
        case 2u: { rgb = plasma(d); }
        case 3u: { rgb = neon(d);   }
        case 4u: { rgb = lava(d);   }
        default: { rgb = water(d);  }
    }
    textureStore(outTex, vec2<i32>(i32(i)-1, i32(j)-1), vec4(rgb, 1.0));
}
`;

// ── Main class ──────────────────────────────────────────────────────────────
export class FluidSimGPU {
    constructor(N, iter = 20) {
        this.N      = N;
        this.iter   = iter;
        this.stride = N + 2;
        this.ready  = false;
        // Exposed typed-array views (mapped from GPU → CPU on clear/faucet/drain ops)
        this._cpuField = null;
    }

    // ── Async initialisation ───────────────────────────────────────────────
    async init() {
        if (!navigator.gpu) throw new Error('WebGPU not supported');
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (!adapter) throw new Error('No WebGPU adapter');
        // Request push_constants feature if available (optional — we fall back to uniform)
        const features = [];
        const hasPushConst = adapter.features.has('chromium-experimental-push-constants');
        // NOTE: push constants are experimental; we use a small uniform buffer for
        // per-dispatch variant parameters instead (universally supported).
        const device = await adapter.requestDevice();
        this.device  = device;

        const S     = this.stride;
        const total = FIELD_COUNT * S * S; // total floats

        // Main storage buffer — COPY_SRC so we can readback boundary strips
        this.fieldBuf = device.createBuffer({
            size:  total * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });

        // Staging buffer for CPU-side boundary writes
        this.stageBuf = device.createBuffer({
            size:  total * 4,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });

        // Upload buffer for injecting faucet/drain/brush data
        this.uploadBuf = device.createBuffer({
            size:  total * 4,
            usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.MAP_WRITE,
        });

        // Uniforms — sim params  (64 bytes, 16 f32/u32)
        this.uniformBuf = device.createBuffer({
            size:  64,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Variant buffer — per-dispatch small struct (≤16 bytes)
        this.variantBuf = device.createBuffer({
            size:  16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Render uniforms (separate, smaller)
        this.renderUniBuf = device.createBuffer({
            size:  16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Output texture (N×N rgba8unorm) written by render compute shader
        this.outTex = device.createTexture({
            size:   { width: N, height: N },
            format: 'rgba8unorm',
            usage:  GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC |
                    GPUTextureUsage.TEXTURE_BINDING,
        });

        // Staging buffer for reading the texture back to display on a 2D canvas
        this.texStageBuf = device.createBuffer({
            size:  N * N * 4,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });

        // ── Bind group layout: uniform + storage ──────────────────────────
        const simBGL = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
            ],
        });

        const renderBGL = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE,
                  storageTexture: { access: 'write-only', format: 'rgba8unorm', viewDimension: '2d' } },
            ],
        });

        // Variant bind group layout (for per-dispatch params)
        const varBGL = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
            ],
        });

        const mkPipeline = (code, bgl = simBGL) => {
            const mod = device.createShaderModule({ code });
            return device.createComputePipeline({
                layout: device.createPipelineLayout({ bindGroupLayouts: [bgl] }),
                compute: { module: mod, entryPoint: 'main' },
            });
        };

        // Build variant-aware shaders by injecting variant uniform at binding 2
        const wrapVariant = (baseCode) => {
            // Inject variant struct + binding into the WGSL code
            const variantBlock = /* wgsl */`
struct Variant { a: u32, b: u32, c: u32, d: u32 }
@group(0) @binding(2) var<uniform> variant: Variant;
`;
            return baseCode.replace(
                '@compute',
                variantBlock + '\n@compute'
            );
        };

        // Rewrite CS_LINSOLVE to use variant binding instead of push_constant
        const csLinSolve = WGSL_COMMON + /* wgsl */`
struct Variant { xSlot: u32, x0Slot: u32, parity: u32, useVisc: u32 }
@group(0) @binding(2) var<uniform> variant: Variant;

@compute @workgroup_size(${WG}, ${WG})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x + 1u;
    let j = gid.y + 1u;
    if (i > uni.N || j > uni.N) { return; }
    if ((i + j) % 2u != variant.parity) { return; }

    let a   = select(uni.a_diff, uni.a_visc, variant.useVisc != 0u);
    let c   = select(uni.c_diff, uni.c_visc, variant.useVisc != 0u);
    let x0  = variant.x0Slot;
    let xs  = variant.xSlot;

    let val = (field[slot(x0, i, j)] + a * (
        field[slot(xs, i-1u, j)] + field[slot(xs, i+1u, j)] +
        field[slot(xs, i, j-1u)] + field[slot(xs, i, j+1u)]
    )) / c;
    field[slot(xs, i, j)] = val;
}
`;

        const csAdvect = WGSL_COMMON + /* wgsl */`
struct Variant { dSlot: u32, d0Slot: u32, uSlot: u32, vSlot: u32 }
@group(0) @binding(2) var<uniform> variant: Variant;

@compute @workgroup_size(${WG}, ${WG})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x + 1u;
    let j = gid.y + 1u;
    if (i > uni.N || j > uni.N) { return; }

    let dt0 = uni.dt * f32(uni.N);
    var x   = f32(i) - dt0 * field[slot(variant.uSlot, i, j)];
    var y   = f32(j) - dt0 * field[slot(variant.vSlot, i, j)];

    x = clamp(x, 0.5, f32(uni.N) + 0.5);
    y = clamp(y, 0.5, f32(uni.N) + 0.5);

    let i0 = u32(x);  let i1 = i0 + 1u;
    let j0 = u32(y);  let j1 = j0 + 1u;
    let s1 = x - f32(i0);  let s0 = 1.0 - s1;
    let t1 = y - f32(j0);  let t0 = 1.0 - t1;

    field[slot(variant.dSlot, i, j)] =
        s0 * (t0 * field[slot(variant.d0Slot, i0, j0)] + t1 * field[slot(variant.d0Slot, i0, j1)]) +
        s1 * (t0 * field[slot(variant.d0Slot, i1, j0)] + t1 * field[slot(variant.d0Slot, i1, j1)]);
}
`;

        const csAddSrc = WGSL_COMMON + /* wgsl */`
struct Variant { dst: u32, src: u32, _a: u32, _b: u32 }
@group(0) @binding(2) var<uniform> variant: Variant;

@compute @workgroup_size(${WG}, ${WG})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x + 1u;
    let j = gid.y + 1u;
    if (i > uni.N || j > uni.N) { return; }
    field[slot(variant.dst, i, j)] += uni.dt * field[slot(variant.src, i, j)];
}
`;

        this._pipelines = {
            addSrc:     mkPipeline(csAddSrc,         varBGL),
            linSolve:   mkPipeline(csLinSolve,        varBGL),
            advect:     mkPipeline(csAdvect,          varBGL),
            projectDiv: mkPipeline(CS_PROJECT_DIV,    simBGL),
            projectGrad:mkPipeline(CS_PROJECT_GRAD,   simBGL),
            gravity:    mkPipeline(CS_GRAVITY,        simBGL),
            render:     mkPipeline(CS_RENDER,         renderBGL),
        };

        // ── Bind groups ───────────────────────────────────────────────────
        this._simBG = device.createBindGroup({
            layout: simBGL,
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuf } },
                { binding: 1, resource: { buffer: this.fieldBuf   } },
            ],
        });

        this._varBG = device.createBindGroup({
            layout: varBGL,
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuf } },
                { binding: 1, resource: { buffer: this.fieldBuf   } },
                { binding: 2, resource: { buffer: this.variantBuf } },
            ],
        });

        this._renderBG = device.createBindGroup({
            layout: renderBGL,
            entries: [
                { binding: 0, resource: { buffer: this.renderUniBuf } },
                { binding: 1, resource: { buffer: this.fieldBuf     } },
                { binding: 2, resource: this.outTex.createView()      },
            ],
        });

        // CPU-side scratch for boundary and injection
        this._cpuField = new Float32Array(total);

        this.ready = true;
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    IX(i, j)               { return i + this.stride * j; }
    slot(f, i, j)          { return f * this.stride * this.stride + this.IX(i, j); }

    get N2()               { return this.stride * this.stride; }

    _writeVariant(a, b, c = 0, d = 0) {
        this.device.queue.writeBuffer(
            this.variantBuf, 0,
            new Uint32Array([a, b, c, d])
        );
    }

    _dispatch(enc, pipeline, bg, n) {
        const wg = Math.ceil(n / WG);
        const pass = enc.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bg);
        pass.dispatchWorkgroups(wg, wg);
        pass.end();
    }

    /** Write sim uniforms to GPU.  Called once per step. */
    _writeUniforms(dt, diff, visc, gravStr) {
        const N  = this.N;
        const aDiff = dt * diff * N * N;
        const aVisc = dt * visc * N * N;
        const data  = new ArrayBuffer(64);
        const u32   = new Uint32Array(data);
        const f32   = new Float32Array(data);
        u32[0]  = N;
        u32[1]  = this.stride;
        u32[2]  = this.iter;
        u32[3]  = 0;
        f32[4]  = dt;
        f32[5]  = diff;
        f32[6]  = visc;
        f32[7]  = aDiff;
        f32[8]  = 1 + 4 * aDiff;
        f32[9]  = aVisc;
        f32[10] = 1 + 4 * aVisc;
        f32[11] = 1;           // a_proj
        f32[12] = gravStr;
        f32[13] = 0; f32[14] = 0; f32[15] = 0;
        this.device.queue.writeBuffer(this.uniformBuf, 0, data);
    }

    // ── Boundary conditions applied on CPU via mapped readback ────────────
    // Only the four 1-cell borders need touching — we copy just those rows
    // from GPU, fix them in JS, and re-upload the corrected values.
    async _applyBndCPU(fieldSlot, bType) {
        // We use a synchronous approach: read the full field slice,
        // modify, re-upload.  This is a brief GPU stall but boundary ops
        // are cheap and happen only ~4× per step.
        const S    = this.stride;
        const N    = this.N;
        const base = fieldSlot * S * S * 4; // byte offset in fieldBuf

        // ── async readback of just this field's slice ──────────────────
        const tmp = this.device.createBuffer({
            size:  S * S * 4,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });
        const enc = this.device.createCommandEncoder();
        enc.copyBufferToBuffer(this.fieldBuf, base, tmp, 0, S * S * 4);
        this.device.queue.submit([enc.finish()]);

        await tmp.mapAsync(GPUMapMode.READ);
        const arr = new Float32Array(tmp.getMappedRange().slice(0));
        tmp.unmap();
        tmp.destroy();

        const IX = (i, j) => i + S * j;
        // Left / right
        for (let i = 1; i <= N; i++) {
            arr[IX(0,   i)] = bType === 1 ? -arr[IX(1, i)] : arr[IX(1, i)];
            arr[IX(N+1, i)] = bType === 1 ? -arr[IX(N, i)] : arr[IX(N, i)];
            arr[IX(i,   0)] = bType === 2 ? -arr[IX(i, 1)] : arr[IX(i, 1)];
            arr[IX(i, N+1)] = bType === 2 ? -arr[IX(i, N)] : arr[IX(i, N)];
        }
        arr[IX(0,   0  )] = 0.5*(arr[IX(1,0  )]+arr[IX(0,1  )]);
        arr[IX(0,   N+1)] = 0.5*(arr[IX(1,N+1)]+arr[IX(0,N  )]);
        arr[IX(N+1, 0  )] = 0.5*(arr[IX(N,0  )]+arr[IX(N+1,1)]);
        arr[IX(N+1, N+1)] = 0.5*(arr[IX(N,N+1)]+arr[IX(N+1,N)]);

        this.device.queue.writeBuffer(this.fieldBuf, base, arr);
    }

    // ── Red-Black SOR linear solve (iter full iterations on GPU) ──────────
    // Boundary is applied on CPU every `bndEvery` sweeps.
    async _linSolve(xSlot, x0Slot, useVisc, bType) {
        const BND_EVERY = 4; // apply CPU boundary every N red-black pairs
        for (let k = 0; k < this.iter; k++) {
            // Red pass (parity=0)
            this._writeVariant(xSlot, x0Slot, 0, useVisc ? 1 : 0);
            const encR = this.device.createCommandEncoder();
            this._dispatch(encR, this._pipelines.linSolve, this._varBG, this.N);
            this.device.queue.submit([encR.finish()]);
            // Black pass (parity=1)
            this._writeVariant(xSlot, x0Slot, 1, useVisc ? 1 : 0);
            const encB = this.device.createCommandEncoder();
            this._dispatch(encB, this._pipelines.linSolve, this._varBG, this.N);
            this.device.queue.submit([encB.finish()]);

            if ((k + 1) % BND_EVERY === 0 || k === this.iter - 1) {
                await this._applyBndCPU(xSlot, bType);
            }
        }
    }

    // ── Swap two field slots by swapping GPU regions ───────────────────────
    async _swapFields(a, b) {
        const S      = this.stride;
        const bytes  = S * S * 4;
        const base_a = a * bytes;
        const base_b = b * bytes;
        const scratch = this.device.createBuffer({
            size:  bytes,
            usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });
        const enc = this.device.createCommandEncoder();
        enc.copyBufferToBuffer(this.fieldBuf, base_a, scratch,      0,      bytes);
        enc.copyBufferToBuffer(this.fieldBuf, base_b, this.fieldBuf, base_a, bytes);
        enc.copyBufferToBuffer(scratch,       0,      this.fieldBuf, base_b, bytes);
        this.device.queue.submit([enc.finish()]);
        scratch.destroy();
    }

    // ── Zero a field slot ─────────────────────────────────────────────────
    _zeroField(slot) {
        const S    = this.stride;
        const bytes = S * S * 4;
        const base  = slot * bytes;
        this.device.queue.writeBuffer(
            this.fieldBuf, base,
            new Float32Array(S * S) // zeros
        );
    }

    // ── Public API ─────────────────────────────────────────────────────────

    clear() {
        if (!this.ready) return;
        this.device.queue.writeBuffer(
            this.fieldBuf, 0,
            new Float32Array(FIELD_COUNT * this.stride * this.stride)
        );
    }

    /**
     * Write a patch of values into a field slot from a CPU Float32Array.
     * Used by main.js to inject faucet / drain / brush data.
     * @param {number}       fieldSlot  - one of the F_* constants (exported below)
     * @param {Float32Array} data       - full (N+2)² array
     */
    writeField(fieldSlot, data) {
        if (!this.ready) return;
        const S    = this.stride;
        const base = fieldSlot * S * S * 4;
        this.device.queue.writeBuffer(this.fieldBuf, base, data);
    }

    /**
     * Read a full field slice back to CPU.
     * Returns a Promise<Float32Array>.
     */
    async readField(fieldSlot) {
        const S    = this.stride;
        const bytes = S * S * 4;
        const base  = fieldSlot * S * S * 4;
        const tmp = this.device.createBuffer({
            size:  bytes,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });
        const enc = this.device.createCommandEncoder();
        enc.copyBufferToBuffer(this.fieldBuf, base, tmp, 0, bytes);
        this.device.queue.submit([enc.finish()]);
        await tmp.mapAsync(GPUMapMode.READ);
        const result = new Float32Array(tmp.getMappedRange().slice(0));
        tmp.unmap();
        tmp.destroy();
        return result;
    }

    /**
     * Advance simulation by dt seconds.
     * @param {number} visc
     * @param {number} diff
     * @param {number} dt
     * @param {boolean} gravity
     * @param {number} gravStr
     */
    async step(visc, diff, dt, gravity, gravStr) {
        if (!this.ready) return;
        this._writeUniforms(dt, diff, visc, gravity ? gravStr : 0);

        // ── Velocity step ─────────────────────────────────────────────────

        // addSrc u += dt * u0
        this._writeVariant(F_U, F_U0);
        let enc = this.device.createCommandEncoder();
        this._dispatch(enc, this._pipelines.addSrc, this._varBG, this.N);
        this.device.queue.submit([enc.finish()]);

        // addSrc v += dt * v0
        this._writeVariant(F_V, F_V0);
        enc = this.device.createCommandEncoder();
        this._dispatch(enc, this._pipelines.addSrc, this._varBG, this.N);
        this.device.queue.submit([enc.finish()]);

        if (gravity) {
            enc = this.device.createCommandEncoder();
            this._dispatch(enc, this._pipelines.gravity, this._simBG, this.N);
            this.device.queue.submit([enc.finish()]);
        }

        // diffuse u: swap u↔u0, solve u from u0
        await this._swapFields(F_U, F_U0);
        await this._linSolve(F_U, F_U0, true, 1);

        // diffuse v: swap v↔v0, solve v from v0
        await this._swapFields(F_V, F_V0);
        await this._linSolve(F_V, F_V0, true, 2);

        // project #1
        enc = this.device.createCommandEncoder();
        this._dispatch(enc, this._pipelines.projectDiv, this._simBG, this.N);
        this.device.queue.submit([enc.finish()]);
        await this._applyBndCPU(F_DIV, 0);
        await this._applyBndCPU(F_P,   0);
        await this._linSolve(F_P, F_DIV, false, 0);
        await this._applyBndCPU(F_P, 0);
        enc = this.device.createCommandEncoder();
        this._dispatch(enc, this._pipelines.projectGrad, this._simBG, this.N);
        this.device.queue.submit([enc.finish()]);
        await this._applyBndCPU(F_U, 1);
        await this._applyBndCPU(F_V, 2);

        // advect velocity: swap u↔u0, v↔v0
        await this._swapFields(F_U, F_U0);
        await this._swapFields(F_V, F_V0);
        this._writeVariant(F_U, F_U0, F_U0, F_V0);
        enc = this.device.createCommandEncoder();
        this._dispatch(enc, this._pipelines.advect, this._varBG, this.N);
        this.device.queue.submit([enc.finish()]);
        await this._applyBndCPU(F_U, 1);

        this._writeVariant(F_V, F_V0, F_U0, F_V0);
        enc = this.device.createCommandEncoder();
        this._dispatch(enc, this._pipelines.advect, this._varBG, this.N);
        this.device.queue.submit([enc.finish()]);
        await this._applyBndCPU(F_V, 2);

        // project #2
        enc = this.device.createCommandEncoder();
        this._dispatch(enc, this._pipelines.projectDiv, this._simBG, this.N);
        this.device.queue.submit([enc.finish()]);
        await this._applyBndCPU(F_DIV, 0);
        await this._applyBndCPU(F_P,   0);
        await this._linSolve(F_P, F_DIV, false, 0);
        await this._applyBndCPU(F_P, 0);
        enc = this.device.createCommandEncoder();
        this._dispatch(enc, this._pipelines.projectGrad, this._simBG, this.N);
        this.device.queue.submit([enc.finish()]);
        await this._applyBndCPU(F_U, 1);
        await this._applyBndCPU(F_V, 2);

        // ── Density step ──────────────────────────────────────────────────

        // addSrc dens += dt * dens0
        this._writeVariant(F_DENS, F_DENS0);
        enc = this.device.createCommandEncoder();
        this._dispatch(enc, this._pipelines.addSrc, this._varBG, this.N);
        this.device.queue.submit([enc.finish()]);

        // diffuse
        await this._swapFields(F_DENS, F_DENS0);
        await this._linSolve(F_DENS, F_DENS0, false, 0);

        // advect
        await this._swapFields(F_DENS, F_DENS0);
        this._writeVariant(F_DENS, F_DENS0, F_U, F_V);
        enc = this.device.createCommandEncoder();
        this._dispatch(enc, this._pipelines.advect, this._varBG, this.N);
        this.device.queue.submit([enc.finish()]);
        await this._applyBndCPU(F_DENS, 0);

        // Clear source buffers
        this._zeroField(F_U0);
        this._zeroField(F_V0);
        this._zeroField(F_DENS0);
    }

    /**
     * Run the GPU render shader; returns an ImageBitmap of size N×N.
     * @param {number} themeIndex - 0..4
     */
    async renderToImageBitmap(themeIndex) {
        if (!this.ready) return null;

        const N   = this.N;
        const uni = new Uint32Array([N, this.stride, themeIndex, 0]);
        this.device.queue.writeBuffer(this.renderUniBuf, 0, uni);

        const enc = this.device.createCommandEncoder();
        const pass = enc.beginComputePass();
        pass.setPipeline(this._pipelines.render);
        pass.setBindGroup(0, this._renderBG);
        pass.dispatchWorkgroups(Math.ceil(N / WG), Math.ceil(N / WG));
        pass.end();

        // Copy texture → staging buffer (bytesPerRow must be 256-aligned)
        const bytesPerRow = Math.ceil(N * 4 / 256) * 256;
        enc.copyTextureToBuffer(
            { texture: this.outTex },
            { buffer: this.texStageBuf, bytesPerRow, rowsPerImage: N },
            { width: N, height: N }
        );
        this.device.queue.submit([enc.finish()]);

        await this.texStageBuf.mapAsync(GPUMapMode.READ);
        const raw  = new Uint8ClampedArray(this.texStageBuf.getMappedRange());
        // Extract tightly-packed rows (strip alignment padding)
        const tight = new Uint8ClampedArray(N * N * 4);
        for (let row = 0; row < N; row++) {
            tight.set(raw.subarray(row * bytesPerRow, row * bytesPerRow + N * 4), row * N * 4);
        }
        this.texStageBuf.unmap();

        return await createImageBitmap(new ImageData(tight, N, N));
    }

    destroy() {
        if (!this.device) return;
        this.fieldBuf.destroy();
        this.stageBuf.destroy();
        this.uploadBuf.destroy();
        this.uniformBuf.destroy();
        this.variantBuf.destroy();
        this.renderUniBuf.destroy();
        this.outTex.destroy();
        this.texStageBuf.destroy();
        this.device.destroy();
        this.ready = false;
    }
}

// Re-export slot constants so main.js can reference them
export { F_U, F_V, F_U0, F_V0, F_DENS, F_DENS0 };
