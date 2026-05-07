import { LINE_VERTEX, LINE_FRAGMENT } from './shaders.js';

/**
 * BFS neighbor directions — populated from dirSequence.json at startup;
 * falls back to the canonical 26-direction set when the file is unavailable.
 * @type {Array<{key:string, dx:number, dy:number, dz:number}>}
 */
let DIR_SEQUENCE = [
    { key: 'L',   dx: -1, dy:  0, dz:  0 }, { key: 'R',   dx:  1, dy:  0, dz:  0 },
    { key: 'U',   dx:  0, dy:  1, dz:  0 }, { key: 'D',   dx:  0, dy: -1, dz:  0 },
    { key: 'F',   dx:  0, dy:  0, dz:  1 }, { key: 'B',   dx:  0, dy:  0, dz: -1 },
    { key: 'LU',  dx: -1, dy:  1, dz:  0 }, { key: 'RU',  dx:  1, dy:  1, dz:  0 },
    { key: 'LD',  dx: -1, dy: -1, dz:  0 }, { key: 'RD',  dx:  1, dy: -1, dz:  0 },
    { key: 'LF',  dx: -1, dy:  0, dz:  1 }, { key: 'RF',  dx:  1, dy:  0, dz:  1 },
    { key: 'LB',  dx: -1, dy:  0, dz: -1 }, { key: 'RB',  dx:  1, dy:  0, dz: -1 },
    { key: 'UF',  dx:  0, dy:  1, dz:  1 }, { key: 'UB',  dx:  0, dy:  1, dz: -1 },
    { key: 'DF',  dx:  0, dy: -1, dz:  1 }, { key: 'DB',  dx:  0, dy: -1, dz: -1 },
    { key: 'LUF', dx: -1, dy:  1, dz:  1 }, { key: 'RUF', dx:  1, dy:  1, dz:  1 },
    { key: 'LUB', dx: -1, dy:  1, dz: -1 }, { key: 'RUB', dx:  1, dy:  1, dz: -1 },
    { key: 'LDF', dx: -1, dy: -1, dz:  1 }, { key: 'RDF', dx:  1, dy: -1, dz:  1 },
    { key: 'LDB', dx: -1, dy: -1, dz: -1 }, { key: 'RDB', dx:  1, dy: -1, dz: -1 },
];

const PT_VERT = /* glsl */`
    attribute float aAlpha;
    varying   float vAlpha;
    void main() {
        vAlpha       = aAlpha;
        gl_PointSize = 5.0;
        gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const PT_FRAG = /* glsl */`
    uniform vec3  uColor;
    varying float vAlpha;
    void main() {
        if (vAlpha < 0.01) discard;
        if (length(gl_PointCoord - vec2(0.5)) > 0.5) discard;
        gl_FragColor = vec4(uColor, vAlpha);
    }
`;

/**
 * MouseWeb — draws a persistent BFS web of lines from the mouse cursor into the
 * grid.  When the mouse enters a root point's hit-radius, that point is assigned
 * `maxConnections` directions from DIR_SEQUENCE.  Each direction is followed for
 * `depth` hops; masked-out points are skipped and the walk continues in the same
 * direction.  Connections are sticky: they persist until the root point leaves
 * the hit-radius.
 *
 * @example
 * const web = new MouseWeb(THREE, scene, camera, canvas, container, slabManager.slabs,
 *     pointMaterial.uniforms.uColor.value,
 *     { spacing: 2, xyExtent: 18, hitRadius: 2.5, maxConnections: 5, depth: 10 });
 * // in animate loop:
 * web.update();
 * // on teardown:
 * web.dispose();
 */
export class MouseWeb {
    /**
     * @param {object}            THREE
     * @param {THREE.Scene}       scene
     * @param {THREE.Camera}      camera
     * @param {HTMLCanvasElement} canvas
     * @param {HTMLElement}       container
     * @param {Map}               slabs              - Live slab map from SlabManager
     * @param {THREE.Color}       color              - Base grid color (fallback web color)
     * @param {object}            config
     * @param {number}            config.spacing
     * @param {number}            config.xyExtent    - Half-width of grid in steps
     * @param {number}            config.uFarDist    - Z distance at which alpha reaches 0
     * @param {number}            config.hitRadius   - Mouse influence radius in world units
     * @param {number}           [config.maxConnections=5]
     * @param {number}           [config.maxLines=4096]
     * @param {Function}         [config.isPointValid] - (gx,gy,zIdx)=>bool; omit to allow all
     * @param {Array}            [config.dirSequence]  - Overrides the built-in DIR_SEQUENCE
     * @param {number}           [config.depth=10]     - BFS hops from each root point
     * @param {boolean}          [config.depthFade=false]
     * @param {number}           [config.depthFadeStrength=0.65] - Per-level alpha multiplier
     * @param {number|string}    [config.mouseColor]   - Defaults to base grid color
     */
    constructor(THREE, scene, camera, canvas, container, slabs, color, {
        spacing           = 0.5,
        xyExtent          = 18,
        uFarDist          = 50,
        hitRadius         = 1.5,
        maxConnections    = 1,
        maxLines          = 4096,
        isPointValid      = null,
        dirSequence       = null,
        depth             = 1,
        depthFade         = false,
        depthFadeStrength = 0,
        mouseColor        = null,
    } = {}) {
        this._THREE          = THREE;
        this._scene          = scene;
        this._camera         = camera;
        this._canvas         = canvas;
        this._slabs          = slabs;
        this._spacing        = spacing;
        this._xyExtent       = xyExtent;
        this._uFarDist       = uFarDist;
        this._hitRadius      = hitRadius;
        this._maxConnections = maxConnections;
        this._maxLines       = maxLines;
        this._isPointValid   = isPointValid;
        this._depth          = Math.max(0, depth);
        this._depthFade      = depthFade;
        this._depthFadeStrength = depthFadeStrength;

        if (dirSequence) DIR_SEQUENCE = dirSequence;

        const webColor = mouseColor !== null ? new THREE.Color(mouseColor) : color.clone();
        this._webColor = webColor;

        this._mouse       = new THREE.Vector2(Infinity, Infinity);
        this._raycaster   = new THREE.Raycaster();
        this._lastClientX = null;
        this._lastClientY = null;

        // Advances by maxConnections per activation so successive roots get different patterns.
        this._dirCursor = 0;

        /**
         * Persistent per-point data, keyed by `${gx},${gy},${zIdx}`.
         * Entries survive across frames; evicted when the point leaves hit-radius.
         * @type {Map<string, {gx,gy,zIdx,wx,wy,wz,dirIndices:number[],alpha:number,nodeDepth:number,parentKey:string|null}>}
         */
        this._nodes = new Map();

        this._lineGeo      = this._makeGeo(THREE, maxLines * 6, maxLines * 2);
        this._lineMat      = new THREE.ShaderMaterial({
            transparent: true, depthWrite: false,
            vertexShader: LINE_VERTEX, fragmentShader: LINE_FRAGMENT,
            uniforms: { uColor: { value: webColor } },
        });
        this._lineSegments = new THREE.LineSegments(this._lineGeo, this._lineMat);
        this._lineSegments.frustumCulled = false;
        scene.add(this._lineSegments);

        this._ptGeo    = this._makeGeo(THREE, maxLines * 3, maxLines);
        this._ptMat    = new THREE.ShaderMaterial({
            transparent: true, depthWrite: false,
            vertexShader: PT_VERT, fragmentShader: PT_FRAG,
            uniforms: { uColor: { value: webColor } },
        });
        this._ptPoints = new THREE.Points(this._ptGeo, this._ptMat);
        this._ptPoints.frustumCulled = false;
        scene.add(this._ptPoints);

        // CPU-side mirrors of the GPU buffers (views into the typed arrays).
        this._linePosBuf   = this._lineGeo.attributes.position.array;
        this._lineAlphaBuf = this._lineGeo.attributes.aAlpha.array;
        this._ptPosBuf     = this._ptGeo.attributes.position.array;
        this._ptAlphaBuf   = this._ptGeo.attributes.aAlpha.array;

        this._onMouseMove  = this._onMouseMove.bind(this);
        this._onMouseLeave = this._onMouseLeave.bind(this);
        this._onScroll     = this._onScroll.bind(this);
        container.addEventListener('mousemove',  this._onMouseMove);
        container.addEventListener('mouseleave', this._onMouseLeave);
        window.addEventListener('scroll', this._onScroll, { passive: true });
        this._container = container;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** Build a BufferGeometry with `position` (xyz) and `aAlpha` (float) attributes. */
    _makeGeo(THREE, posLen, alphaLen) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position',
            new THREE.BufferAttribute(new Float32Array(posLen),   3)
                .setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute('aAlpha',
            new THREE.BufferAttribute(new Float32Array(alphaLen), 1)
                .setUsage(THREE.DynamicDrawUsage));
        geo.setDrawRange(0, 0);
        return geo;
    }

    /** Linear depth-fade alpha for a world-Z position. */
    _slabAlpha(worldZ) {
        const dist = this._camera.position.z - worldZ;
        return 1.0 - Math.max(0, Math.min(1, dist / this._uFarDist));
    }

    _key(gx, gy, zIdx) { return `${gx},${gy},${zIdx}`; }

    _updateNDC(clientX, clientY) {
        const rect    = this._canvas.getBoundingClientRect();
        this._mouse.x =  ((clientX - rect.left) / rect.width)  * 2 - 1;
        this._mouse.y = -((clientY - rect.top)  / rect.height) * 2 + 1;
    }

    _onMouseMove(e) {
        this._lastClientX = e.clientX;
        this._lastClientY = e.clientY;
        this._updateNDC(e.clientX, e.clientY);
    }

    _onMouseLeave() {
        this._lastClientX = this._lastClientY = null;
        this._mouse.set(Infinity, Infinity);
    }

    _onScroll() {
        if (this._lastClientX !== null)
            this._updateNDC(this._lastClientX, this._lastClientY);
    }

    // ── Update passes ─────────────────────────────────────────────────────────

    /**
     * Raycast the mouse ray onto each slab plane and collect root nodes (depth 0)
     * within hitRadius.  Returns { reachedThisFrame, slabHits }.
     */
    _collectRoots() {
        const { _spacing: sp, _xyExtent: ext, _hitRadius: hr } = this;
        const ro = this._raycaster.ray.origin;
        const rd = this._raycaster.ray.direction;

        const reachedThisFrame = new Set();
        const slabHits = new Map(); // zIdx → { hitX, hitY, worldZ }

        for (const [zIdx, pts] of this._slabs) {
            if (Math.abs(rd.z) < 0.0001) continue;
            const worldZ = pts.geometry.attributes.position.getZ(0) + pts.position.z;
            const t = (worldZ - ro.z) / rd.z;
            if (t < 0.01) continue;

            const hitX = ro.x + rd.x * t;
            const hitY = ro.y + rd.y * t;
            slabHits.set(zIdx, { hitX, hitY, worldZ });

            const slabAlpha = this._slabAlpha(worldZ);
            const gxMin = Math.max(-ext, Math.ceil( (hitX - hr) / sp));
            const gxMax = Math.min( ext, Math.floor((hitX + hr) / sp));
            const gyMin = Math.max(-ext, Math.ceil( (hitY - hr) / sp));
            const gyMax = Math.min( ext, Math.floor((hitY + hr) / sp));

            for (let gx = gxMin; gx <= gxMax; gx++) {
                for (let gy = gyMin; gy <= gyMax; gy++) {
                    const px = gx * sp, py = gy * sp;
                    const fade = 1.0 - Math.sqrt((px - hitX) ** 2 + (py - hitY) ** 2) / hr;
                    if (fade <= 0) continue;
                    if (this._isPointValid && !this._isPointValid(gx, gy, zIdx)) continue;

                    const key   = this._key(gx, gy, zIdx);
                    const alpha = slabAlpha * fade;
                    reachedThisFrame.add(key);

                    if (!this._nodes.has(key)) {
                        const dirIndices = Array.from({ length: this._maxConnections },
                            (_, i) => (this._dirCursor + i) % DIR_SEQUENCE.length);
                        this._dirCursor = (this._dirCursor + this._maxConnections) % DIR_SEQUENCE.length;
                        this._nodes.set(key, {
                            gx, gy, zIdx, wx: px, wy: py, wz: worldZ,
                            dirIndices, alpha, nodeDepth: 0, parentKey: null,
                        });
                    } else {
                        const n = this._nodes.get(key);
                        n.alpha = alpha; n.wz = worldZ; n.nodeDepth = 0; n.parentKey = null;
                    }
                }
            }
        }

        return { reachedThisFrame, slabHits };
    }

    /**
     * BFS — expand from roots for `depth` hops.  Each non-root node inherits the
     * single direction it was reached through (straight arms, no branching).
     * Masked-out points are skipped; the walk continues in the same direction.
     */
    _bfsExpand(reachedThisFrame) {
        if (this._depth === 0) return;

        const { _spacing: sp, _xyExtent: ext } = this;
        let frontier = [...reachedThisFrame];

        for (let level = 1; level <= this._depth; level++) {
            const nextFrontier = [];

            for (const parentKey of frontier) {
                const parent = this._nodes.get(parentKey);
                if (!parent) continue;

                for (const di of parent.dirIndices) {
                    const dir  = DIR_SEQUENCE[di];
                    let ngx   = parent.gx   + dir.dx;
                    let ngy   = parent.gy   + dir.dy;
                    let nzIdx = parent.zIdx + dir.dz;

                    // Walk in this direction, skipping masked-out points.
                    let neighborPts = null;
                    while (ngx >= -ext && ngx <= ext && ngy >= -ext && ngy <= ext) {
                        neighborPts = this._slabs.get(nzIdx);
                        if (!neighborPts) break;
                        if (!this._isPointValid || this._isPointValid(ngx, ngy, nzIdx)) break;
                        ngx += dir.dx; ngy += dir.dy; nzIdx += dir.dz;
                    }
                    if (!neighborPts) continue;
                    if (this._isPointValid && !this._isPointValid(ngx, ngy, nzIdx)) continue;

                    const nwz = neighborPts.geometry.attributes.position.getZ(0) + neighborPts.position.z;
                    if (this._slabAlpha(nwz) < 0.01) continue;

                    const key = this._key(ngx, ngy, nzIdx);
                    if (reachedThisFrame.has(key)) continue;

                    reachedThisFrame.add(key);
                    nextFrontier.push(key);

                    const childAlpha = this._depthFade
                        ? parent.alpha * this._depthFadeStrength
                        : parent.alpha;

                    if (!this._nodes.has(key)) {
                        this._nodes.set(key, {
                            gx: ngx, gy: ngy, zIdx: nzIdx,
                            wx: ngx * sp, wy: ngy * sp, wz: nwz,
                            dirIndices: [di], alpha: childAlpha,
                            nodeDepth: level, parentKey,
                        });
                    } else {
                        const n = this._nodes.get(key);
                        n.dirIndices = [di]; n.alpha = childAlpha;
                        n.wz = nwz; n.nodeDepth = level; n.parentKey = parentKey;
                    }
                }
            }

            frontier = nextFrontier;
        }
    }

    /** Remove any node not visited this frame. */
    _evict(reachedThisFrame) {
        for (const key of this._nodes.keys()) {
            if (!reachedThisFrame.has(key)) this._nodes.delete(key);
        }
    }

    /** Write line and point GPU buffers from the current node map. */
    _flushBuffers(slabHits) {
        const { _maxLines: max, _linePosBuf: lp, _lineAlphaBuf: la } = this;
        let lineCount = 0;

        for (const node of this._nodes.values()) {
            if (lineCount >= max) break;
            const { wx, wy, wz, zIdx, alpha, nodeDepth, parentKey } = node;
            const base = lineCount * 6, ab = lineCount * 2;

            if (nodeDepth === 0) {
                const hit = slabHits.get(zIdx);
                if (!hit) continue;
                lp[base]     = hit.hitX; lp[base + 1] = hit.hitY; lp[base + 2] = wz;
                lp[base + 3] = wx;       lp[base + 4] = wy;       lp[base + 5] = wz;
                la[ab]     = alpha * 0.25;
                la[ab + 1] = alpha;
            } else {
                const parent = parentKey && this._nodes.get(parentKey);
                if (!parent) continue;
                lp[base]     = parent.wx; lp[base + 1] = parent.wy; lp[base + 2] = parent.wz;
                lp[base + 3] = wx;        lp[base + 4] = wy;        lp[base + 5] = wz;
                la[ab]     = parent.alpha;
                la[ab + 1] = alpha;
            }
            lineCount++;
        }

        this._lineGeo.attributes.position.needsUpdate = true;
        this._lineGeo.attributes.aAlpha.needsUpdate   = true;
        this._lineGeo.setDrawRange(0, lineCount * 2);
        if (lineCount > 0) this._lineGeo.computeBoundingSphere();

        const { _ptPosBuf: pp, _ptAlphaBuf: pa } = this;
        let ptCount = 0;
        for (const node of this._nodes.values()) {
            if (ptCount >= max) break;
            const base = ptCount * 3;
            pp[base] = node.wx; pp[base + 1] = node.wy; pp[base + 2] = node.wz;
            pa[ptCount] = node.alpha;
            ptCount++;
        }
        this._ptGeo.attributes.position.needsUpdate = true;
        this._ptGeo.attributes.aAlpha.needsUpdate   = true;
        this._ptGeo.setDrawRange(0, ptCount);
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /** Call once per animation frame. */
    update() {
        if (this._mouse.x === Infinity) {
            this._nodes.clear();
            this._lineGeo.setDrawRange(0, 0);
            this._ptGeo.setDrawRange(0, 0);
            return;
        }

        this._raycaster.setFromCamera(this._mouse, this._camera);

        const { reachedThisFrame, slabHits } = this._collectRoots();
        this._bfsExpand(reachedThisFrame);
        this._evict(reachedThisFrame);
        this._flushBuffers(slabHits);
    }

    /** Change the web color at runtime. */
    setColor(hex) {
        this._lineMat.uniforms.uColor.value.set(hex);
        this._ptMat.uniforms.uColor.value.set(hex);
    }

    /** Remove from scene, release GPU resources, and unregister event listeners. */
    dispose() {
        this._container.removeEventListener('mousemove',  this._onMouseMove);
        this._container.removeEventListener('mouseleave', this._onMouseLeave);
        window.removeEventListener('scroll', this._onScroll);

        this._scene.remove(this._lineSegments);
        this._lineGeo.dispose();
        this._lineMat.dispose();

        this._scene.remove(this._ptPoints);
        this._ptGeo.dispose();
        this._ptMat.dispose();
    }
}
