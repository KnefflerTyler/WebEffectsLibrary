/**
 * Renderer.js — WebGL2 cloth renderer (GPU-texture position path)
 *
 * Cloth mesh:
 *   Vertex shader reads particle positions from the GPUCloth position
 *   texture via texelFetch(uTexPos, ivec2(gl_VertexID % W, gl_VertexID / W)).
 *   Per-fragment normals are computed with dFdx/dFdy — no readback or
 *   separate normal pass needed.
 *
 * Collider meshes:
 *   Static OBJ geometry rendered as translucent solid with Phong shading.
 *
 * Other:
 *   Floor grid lines, pin point-sprites, orbit/pan camera.
 */

/* ── GLSL helpers ─────────────────────────────────────────────────────────── */

const CLOTH_VERT = /* glsl */`#version 300 es
precision highp float;

uniform highp sampler2D uTexPos;   // GPU cloth position texture
uniform int   uTexWidth;           // texture width (particles per row)
uniform mat4  uMVP;

in vec2 aUV;   // per-particle UV from VBO (for checkerboard)

out vec3 vWorldPos;
out vec2 vUV;

void main() {
    ivec2 tcoord = ivec2(gl_VertexID % uTexWidth, gl_VertexID / uTexWidth);
    vec3 pos     = texelFetch(uTexPos, tcoord, 0).xyz;
    vWorldPos    = pos;
    vUV          = aUV;
    gl_Position  = uMVP * vec4(pos, 1.0);
}`;

const CLOTH_FRAG = /* glsl */`#version 300 es
precision mediump float;

in vec3 vWorldPos;
in vec2 vUV;

uniform vec3  uCamPos;
uniform vec3  uColorA;
uniform vec3  uColorB;
uniform float uShininess;

out vec4 fragColor;

void main() {
    // Per-face normals from derivatives — no readback needed
    vec3 N = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
    if (!gl_FrontFacing) N = -N;

    vec3 L  = normalize(vec3(-0.4, 0.8, -0.5));
    vec3 V  = normalize(uCamPos - vWorldPos);
    vec3 H  = normalize(L + V);

    float diff = max(dot(N, L), 0.0);
    float spec = pow(max(dot(N, H), 0.0), uShininess);

    // Checkerboard from UV
    float cx = step(0.5, fract(vUV.x * 10.0));
    float cy = step(0.5, fract(vUV.y * 10.0));
    vec3 base = mix(uColorA, uColorB, abs(cx - cy));

    fragColor = vec4(base * (0.15 + 0.85 * diff) + spec * 0.35, 1.0);
}`;

const SOLID_VERT = /* glsl */`#version 300 es
in vec3 aPos;
in vec3 aNorm;
uniform mat4 uMVP;
uniform mat4 uModel;
out vec3 vNormal;
out vec3 vWorldPos;
void main() {
    vWorldPos   = (uModel * vec4(aPos, 1.0)).xyz;
    vNormal     = normalize(mat3(uModel) * aNorm);
    gl_Position = uMVP * vec4(aPos, 1.0);
}`;

const SOLID_FRAG = /* glsl */`#version 300 es
precision mediump float;
in vec3 vNormal;
in vec3 vWorldPos;
uniform vec3  uCamPos;
uniform vec3  uColor;
uniform float uAlpha;
out vec4 fragColor;
void main() {
    vec3 N = normalize(vNormal);
    if (!gl_FrontFacing) N = -N;
    vec3 L  = normalize(vec3(-0.4, 0.8, -0.5));
    vec3 V  = normalize(uCamPos - vWorldPos);
    float d = max(dot(N, L), 0.0);
    float s = pow(max(dot(normalize(L+V), N), 0.0), 32.0);
    fragColor = vec4(uColor * (0.18 + 0.82*d) + s*0.25, uAlpha);
}`;

const PIN_VERT = /* glsl */`#version 300 es
in vec3 aPos;
uniform mat4 uMVP;
void main() {
    gl_Position  = uMVP * vec4(aPos, 1.0);
    gl_PointSize = 11.0;
}`;

const PIN_FRAG = /* glsl */`#version 300 es
precision mediump float;
out vec4 fragColor;
void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c,c) > 0.25) discard;
    fragColor = vec4(1.0, 0.9, 0.1, 1.0);
}`;

const GRID_VERT = /* glsl */`#version 300 es
in vec3 aPos;
uniform mat4 uMVP;
void main() { gl_Position = uMVP * vec4(aPos,1.0); }`;

const GRID_FRAG = /* glsl */`#version 300 es
precision mediump float;
uniform vec4 uColor;
out vec4 fragColor;
void main() { fragColor = uColor; }`;

/* ── Minimal mat4 ─────────────────────────────────────────────────────────── */

function mat4Persp(fovY, asp, near, far) {
    const f=1/Math.tan(fovY*.5), nf=1/(near-far), m=new Float32Array(16);
    m[0]=f/asp; m[5]=f; m[10]=(far+near)*nf; m[11]=-1; m[14]=2*far*near*nf;
    return m;
}
function mat4LookAt(eye, ctr, up) {
    const ex=eye[0],ey=eye[1],ez=eye[2];
    let fx=ctr[0]-ex,fy=ctr[1]-ey,fz=ctr[2]-ez;
    let fl=Math.sqrt(fx*fx+fy*fy+fz*fz)||1; fx/=fl;fy/=fl;fz/=fl;
    let sx=fy*up[2]-fz*up[1],sy=fz*up[0]-fx*up[2],sz=fx*up[1]-fy*up[0];
    let sl=Math.sqrt(sx*sx+sy*sy+sz*sz)||1; sx/=sl;sy/=sl;sz/=sl;
    const ux=sy*fz-sz*fy,uy=sz*fx-sx*fz,uz=sx*fy-sy*fx;
    const m=new Float32Array(16);
    m[0]=sx;m[4]=sy;m[8]=sz;  m[1]=ux;m[5]=uy;m[9]=uz;
    m[2]=-fx;m[6]=-fy;m[10]=-fz;
    m[12]=-(sx*ex+sy*ey+sz*ez); m[13]=-(ux*ex+uy*ey+uz*ez);
    m[14]=fx*ex+fy*ey+fz*ez; m[15]=1;
    return m;
}
function mat4Mul(a,b) {
    const m=new Float32Array(16);
    for(let r=0;r<4;r++) for(let c=0;c<4;c++){let s=0;for(let k=0;k<4;k++)s+=a[r+k*4]*b[k+c*4];m[r+c*4]=s;}
    return m;
}
function mat4Id()     { const m=new Float32Array(16);m[0]=m[5]=m[10]=m[15]=1;return m; }
function mat4T(x,y,z) { const m=mat4Id();m[12]=x;m[13]=y;m[14]=z;return m; }
function mat4S(x,y,z) { const m=new Float32Array(16);m[0]=x;m[5]=y;m[10]=z;m[15]=1;return m; }
function norm3(v)     { const l=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2])||1;return[v[0]/l,v[1]/l,v[2]/l]; }
function cross3(a,b)  { return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]; }

/* ── Procedural normals for solid mesh ───────────────────────────────────── */

function computeNormals(verts, indices) {
    const nrm = new Float32Array(verts.length);
    for (let i = 0; i < indices.length; i += 3) {
        const a=indices[i]*3, b=indices[i+1]*3, c=indices[i+2]*3;
        const ax=verts[b]-verts[a],ay=verts[b+1]-verts[a+1],az=verts[b+2]-verts[a+2];
        const bx=verts[c]-verts[a],by=verts[c+1]-verts[a+1],bz=verts[c+2]-verts[a+2];
        const nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;
        [a,b,c].forEach(k=>{nrm[k]+=nx;nrm[k+1]+=ny;nrm[k+2]+=nz;});
    }
    for (let i=0;i<nrm.length;i+=3){const l=Math.sqrt(nrm[i]**2+nrm[i+1]**2+nrm[i+2]**2)||1;nrm[i]/=l;nrm[i+1]/=l;nrm[i+2]/=l;}
    return nrm;
}

function buildFloor(size=5, step=0.5, y=0) {
    const pts=[];
    for(let x=-size;x<=size;x+=step){pts.push(x,y,-size,x,y,size);}
    for(let z=-size;z<=size;z+=step){pts.push(-size,y,z,size,y,z);}
    return new Float32Array(pts);
}

/* ── Renderer class ───────────────────────────────────────────────────────── */

export class Renderer {
    /** @param {HTMLCanvasElement} canvas */
    constructor(canvas) {
        this.canvas = canvas;
        const gl = canvas.getContext('webgl2', { antialias: true });
        if (!gl) throw new Error('WebGL2 not supported');
        this.gl = gl;

        this.camAz     = 0.4;
        this.camEl     = 0.35;
        this.camDist   = 5.5;
        this.camTarget = [0, 0, 0];
        this._fovY     = 45 * Math.PI / 180;

        this.wireframe     = false;
        this.showPins      = true;
        this.showColliders = true;
        this.showFloor     = true;
        this.colorA        = [0.686, 0.431, 0.937];
        this.colorB        = [0.478, 0.290, 0.690];
        this.shininess     = 30;

        this._clothProg = null;
        this._solidProg = null;
        this._pinProg   = null;
        this._gridProg  = null;

        this._clothVAO        = null;
        this._clothUVBuf      = null;
        this._clothIdxBuf     = null;
        this._clothWireIdxBuf = null;
        this._clothTriCount   = 0;
        this._clothWireCount  = 0;

        this._pinVAO   = null;
        this._pinBuf   = null;
        this._pinCount = 0;

        /** @type {Map<string,{vao:WebGLVertexArrayObject, count:number, color:number[]}>} */
        this._colliderMeshes = new Map();

        this._floorVAO  = null;
        this._floorBuf  = null;
        this._floorVerts = 0;
        this._floorY    = -2.0;
        this._proj      = mat4Id();
    }

    init() {
        const gl = this.gl;
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        this._clothProg = this._prog(CLOTH_VERT, CLOTH_FRAG);
        this._solidProg = this._prog(SOLID_VERT, SOLID_FRAG);
        this._pinProg   = this._prog(PIN_VERT,   PIN_FRAG);
        this._gridProg  = this._prog(GRID_VERT,  GRID_FRAG);

        this._buildFloor();
        this.resize();
    }

    /* ──────────────────────────────────────── Cloth geometry upload ── */

    uploadClothInit(state) {
        const gl = this.gl;
        const n  = state.numParticles;

        if (this._clothVAO) gl.deleteVertexArray(this._clothVAO);
        this._clothVAO = gl.createVertexArray();
        gl.bindVertexArray(this._clothVAO);

        if (this._clothUVBuf) gl.deleteBuffer(this._clothUVBuf);
        this._clothUVBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._clothUVBuf);
        gl.bufferData(gl.ARRAY_BUFFER, state.uvs, gl.STATIC_DRAW);
        const uvLoc = gl.getAttribLocation(this._clothProg, 'aUV');
        gl.enableVertexAttribArray(uvLoc);
        gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);

        if (this._clothIdxBuf) gl.deleteBuffer(this._clothIdxBuf);
        this._clothIdxBuf = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._clothIdxBuf);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, state.indices, gl.STATIC_DRAW);
        this._clothTriCount = state.indices.length;

        gl.bindVertexArray(null);

        const wireIdx = this._buildWireIdx(state.indices);
        if (this._clothWireIdxBuf) gl.deleteBuffer(this._clothWireIdxBuf);
        this._clothWireIdxBuf = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._clothWireIdxBuf);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, wireIdx, gl.STATIC_DRAW);
        this._clothWireCount = wireIdx.length;

        if (this._pinVAO) gl.deleteVertexArray(this._pinVAO);
        this._pinVAO = gl.createVertexArray();
        gl.bindVertexArray(this._pinVAO);
        if (this._pinBuf) gl.deleteBuffer(this._pinBuf);
        this._pinBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._pinBuf);
        gl.bufferData(gl.ARRAY_BUFFER, n * 12, gl.DYNAMIC_DRAW);
        const pinLoc = gl.getAttribLocation(this._pinProg, 'aPos');
        gl.enableVertexAttribArray(pinLoc);
        gl.vertexAttribPointer(pinLoc, 3, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
        this._pinCount = 0;
    }

    updatePins(state) {
        const gl  = this.gl;
        const pts = [];
        for (let i = 0; i < state.numParticles; i++) {
            if (state.pinned[i]) pts.push(state.posX[i], state.posY[i], state.posZ[i]);
        }
        this._pinCount = pts.length / 3;
        if (pts.length) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this._pinBuf);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(pts));
        }
    }

    /* ──────────────────────────────────────── Collider mesh upload ── */

    addColliderMesh(name, vertices, faces, color) {
        const gl      = this.gl;
        const posFlat = new Float32Array(vertices.length * 3);
        for (let i = 0; i < vertices.length; i++) {
            posFlat[i*3]=vertices[i][0]; posFlat[i*3+1]=vertices[i][1]; posFlat[i*3+2]=vertices[i][2];
        }
        const nrm = computeNormals(posFlat, faces);
        const idx = new Uint32Array(faces);

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        const posBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
        gl.bufferData(gl.ARRAY_BUFFER, posFlat, gl.STATIC_DRAW);
        const pLoc = gl.getAttribLocation(this._solidProg, 'aPos');
        gl.enableVertexAttribArray(pLoc);
        gl.vertexAttribPointer(pLoc, 3, gl.FLOAT, false, 0, 0);

        const nrmBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, nrmBuf);
        gl.bufferData(gl.ARRAY_BUFFER, nrm, gl.STATIC_DRAW);
        const nLoc = gl.getAttribLocation(this._solidProg, 'aNorm');
        gl.enableVertexAttribArray(nLoc);
        gl.vertexAttribPointer(nLoc, 3, gl.FLOAT, false, 0, 0);

        const idxBuf = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

        gl.bindVertexArray(null);
        this._colliderMeshes.set(name, { vao, count: idx.length, color });
    }

    /* ─────────────────────────────────────────────────── Render ──── */

    resize() {
        const gl  = this.gl;
        const dpr = window.devicePixelRatio || 1;
        const w   = window.innerWidth;
        const h   = window.innerHeight;
        this.canvas.width  = Math.round(w * dpr);
        this.canvas.height = Math.round(h * dpr);
        this.canvas.style.width  = w + 'px';
        this.canvas.style.height = h + 'px';
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this._proj = mat4Persp(this._fovY, w / h, 0.01, 100);
    }

    /**
     * @param {import('./GPUCloth.js').GPUCloth} gpu
     * @param {Array<{name:string, pos:number[], scale:number, on:boolean}>} colliders
     * @param {number} floorY
     */
    render(gpu, colliders, floorY) {
        const gl  = this.gl;
        // Ensure we're drawing to the screen, at the correct dimensions
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        const eye = this.getEye();
        const VP  = mat4Mul(this._proj, mat4LookAt(eye, this.camTarget, [0,1,0]));

        gl.clearColor(0.02, 0.035, 0.055, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        if (this._clothVAO && gpu) this._drawCloth(VP, eye, gpu);

        if (this.showColliders) {
            for (const { name, pos, scale, on } of colliders) {
                if (!on) continue;
                const mesh = this._colliderMeshes.get(name);
                if (!mesh) continue;
                const model = mat4Mul(mat4T(pos[0],pos[1],pos[2]), mat4S(scale,scale,scale));
                this._drawSolid(mesh, model, mat4Mul(VP, model), eye);
            }
        }

        if (this.showFloor) this._drawFloor(VP, floorY);
        if (this.showPins && this._pinCount > 0) this._drawPins(VP);
    }

    /* ──────────────────────────────────────────── Draw helpers ──── */

    _drawCloth(VP, eye, gpu) {
        const gl   = this.gl;
        const prog = this._clothProg;
        gl.useProgram(prog);
        gl.uniformMatrix4fv(gl.getUniformLocation(prog,'uMVP'),       false, VP);
        gl.uniform3fv(gl.getUniformLocation(prog,'uCamPos'),   eye);
        gl.uniform3fv(gl.getUniformLocation(prog,'uColorA'),   this.colorA);
        gl.uniform3fv(gl.getUniformLocation(prog,'uColorB'),   this.colorB);
        gl.uniform1f (gl.getUniformLocation(prog,'uShininess'),this.shininess);
        gl.uniform1i (gl.getUniformLocation(prog,'uTexWidth'), gpu.texWidth);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, gpu.getPosTex());
        gl.uniform1i(gl.getUniformLocation(prog,'uTexPos'), 0);
        gl.bindVertexArray(this._clothVAO);
        gl.disable(gl.CULL_FACE);
        if (this.wireframe !== 'wireframe') {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._clothIdxBuf);
            gl.drawElements(gl.TRIANGLES, this._clothTriCount, gl.UNSIGNED_INT, 0);
        }
        if (this.wireframe === 'wireframe' || this.wireframe === 'both') {
            gl.uniform3f(gl.getUniformLocation(prog,'uColorA'), 0.9,0.9,1.0);
            gl.uniform3f(gl.getUniformLocation(prog,'uColorB'), 0.9,0.9,1.0);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._clothWireIdxBuf);
            gl.drawElements(gl.LINES, this._clothWireCount, gl.UNSIGNED_INT, 0);
        }
        gl.bindVertexArray(null);
    }

    _drawSolid(mesh, model, mvp, eye) {
        const gl   = this.gl;
        const prog = this._solidProg;
        gl.useProgram(prog);
        gl.uniformMatrix4fv(gl.getUniformLocation(prog,'uMVP'),   false, mvp);
        gl.uniformMatrix4fv(gl.getUniformLocation(prog,'uModel'), false, model);
        gl.uniform3fv(gl.getUniformLocation(prog,'uCamPos'), eye);
        gl.uniform3fv(gl.getUniformLocation(prog,'uColor'),  mesh.color);
        gl.uniform1f (gl.getUniformLocation(prog,'uAlpha'),  0.72);
        gl.bindVertexArray(mesh.vao);
        gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
        gl.bindVertexArray(null);
    }

    _drawPins(VP) {
        const gl   = this.gl;
        const prog = this._pinProg;
        gl.useProgram(prog);
        gl.uniformMatrix4fv(gl.getUniformLocation(prog,'uMVP'), false, VP);
        gl.bindVertexArray(this._pinVAO);
        gl.drawArrays(gl.POINTS, 0, this._pinCount);
        gl.bindVertexArray(null);
    }

    _drawFloor(VP, floorY) {
        const gl = this.gl;
        if (this._floorY !== floorY) {
            this._floorY = floorY;
            const data = buildFloor(5, 0.5, floorY);
            gl.bindBuffer(gl.ARRAY_BUFFER, this._floorBuf);
            gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
            this._floorVerts = data.length / 3;
        }
        const prog = this._gridProg;
        gl.useProgram(prog);
        gl.uniformMatrix4fv(gl.getUniformLocation(prog,'uMVP'),   false, VP);
        gl.uniform4f      (gl.getUniformLocation(prog,'uColor'), 0.18,0.18,0.28,0.45);
        gl.bindVertexArray(this._floorVAO);
        gl.drawArrays(gl.LINES, 0, this._floorVerts);
        gl.bindVertexArray(null);
    }

    /* ──────────────────────────────────────── Camera & picking ──── */

    getEye() {
        const az=this.camAz, el=this.camEl, d=this.camDist, cosEl=Math.cos(el);
        return [
            this.camTarget[0]+Math.sin(az)*cosEl*d,
            this.camTarget[1]+Math.sin(el)*d,
            this.camTarget[2]+Math.cos(az)*cosEl*d,
        ];
    }

    getPickRay(cx, cy) {
        const w=window.innerWidth, h=window.innerHeight;
        const ndx=(cx/w)*2-1, ndy=1-(cy/h)*2;
        const eye=this.getEye();
        const fwd=norm3([this.camTarget[0]-eye[0],this.camTarget[1]-eye[1],this.camTarget[2]-eye[2]]);
        const rgt=norm3(cross3(fwd,[0,1,0]));
        const up=cross3(rgt,fwd);
        const tan=Math.tan(this._fovY*0.5), asp=window.innerWidth/window.innerHeight;
        const dir=norm3([
            fwd[0]+ndx*rgt[0]*tan*asp+ndy*up[0]*tan,
            fwd[1]+ndx*rgt[1]*tan*asp+ndy*up[1]*tan,
            fwd[2]+ndx*rgt[2]*tan*asp+ndy*up[2]*tan,
        ]);
        return { origin: eye, dir };
    }

    projectOnPlane(cx, cy, planePoint, planeNormal) {
        const {origin,dir}=this.getPickRay(cx,cy);
        const d=dir[0]*planeNormal[0]+dir[1]*planeNormal[1]+dir[2]*planeNormal[2];
        if(Math.abs(d)<1e-6)return null;
        const t=((planePoint[0]-origin[0])*planeNormal[0]+
                 (planePoint[1]-origin[1])*planeNormal[1]+
                 (planePoint[2]-origin[2])*planeNormal[2])/d;
        return [origin[0]+dir[0]*t,origin[1]+dir[1]*t,origin[2]+dir[2]*t];
    }

    /* ──────────────────────────────────────────── Utilities ──── */

    _buildFloor() {
        const gl=this.gl;
        const data=buildFloor(5,0.5,this._floorY);
        this._floorVerts=data.length/3;
        this._floorVAO=gl.createVertexArray();
        gl.bindVertexArray(this._floorVAO);
        this._floorBuf=gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER,this._floorBuf);
        gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
        const loc=gl.getAttribLocation(this._gridProg,'aPos');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc,3,gl.FLOAT,false,0,0);
        gl.bindVertexArray(null);
    }

    _buildWireIdx(triIdx) {
        const seen=new Set(), wire=[];
        for(let i=0;i<triIdx.length;i+=3){
            const a=triIdx[i],b=triIdx[i+1],c=triIdx[i+2];
            [[a,b],[b,c],[c,a]].forEach(([x,y])=>{
                const k=x<y?`${x},${y}`:`${y},${x}`;
                if(!seen.has(k)){seen.add(k);wire.push(x,y);}
            });
        }
        return new Uint32Array(wire);
    }

    _prog(vsrc, fsrc) {
        const gl=this.gl;
        const compile=(type,src)=>{
            const s=gl.createShader(type);
            gl.shaderSource(s,src); gl.compileShader(s);
            if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))
                throw new Error(gl.getShaderInfoLog(s)+'\n---\n'+src);
            return s;
        };
        const p=gl.createProgram();
        gl.attachShader(p,compile(gl.VERTEX_SHADER,vsrc));
        gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fsrc));
        gl.linkProgram(p);
        if(!gl.getProgramParameter(p,gl.LINK_STATUS))
            throw new Error(gl.getProgramInfoLog(p));
        return p;
    }
}
