import { LINE_VERTEX, LINE_FRAGMENT } from './shaders.js';

/**
 * MouseLines — draws attraction lines from nearby grid points to the mouse cursor.
 *
 * For every active slab, the mouse ray is intersected with that slab's Z-plane.
 * Grid points within `hitRadius` world units of the intersection in XY get a
 * line segment drawn from the point to the cursor at the same Z depth.
 * Line opacity matches the depth-fade of the point shader.
 */
export class MouseLines {
    /**
     * @param {object}        THREE       - The Three.js namespace
     * @param {THREE.Scene}   scene       - Scene to add the line segments to
     * @param {THREE.Camera}  camera      - Active camera (used for raycasting)
     * @param {HTMLCanvasElement} canvas  - Renderer canvas (for NDC calculation)
     * @param {HTMLElement}   container   - Container element (receives pointer events)
     * @param {Map}           slabs       - Live slab map from SlabManager
     * @param {THREE.Color}   color       - Line color (shared with point material)
     * @param {object} config
     * @param {number} config.spacing     - World-unit grid spacing
     * @param {number} config.xyExtent    - Half-width of grid in steps
     * @param {number} config.uFarDist    - Depth at which points are fully transparent
     * @param {number} config.hitRadius   - World-unit XY proximity threshold
     * @param {number} config.maxLines    - Maximum line segments per frame
     */
    constructor(THREE, scene, camera, canvas, container, slabs, color, {
        spacing, xyExtent, uFarDist, hitRadius, maxLines,
    }) {
        this._THREE     = THREE;
        this._scene     = scene;
        this._camera    = camera;
        this._canvas    = canvas;
        this._slabs     = slabs;
        this._spacing   = spacing;
        this._xyExtent  = xyExtent;
        this._uFarDist  = uFarDist;
        this._hitRadius = hitRadius;
        this._maxLines  = maxLines;

        this._mouse     = new THREE.Vector2(Infinity, Infinity);
        this._raycaster = new THREE.Raycaster();

        this._lastClientX = null;
        this._lastClientY = null;

        // ── Geometry (pre-allocated dynamic buffers) ──
        this._linePosBuf   = new Float32Array(maxLines * 6); // 2 verts × xyz
        this._lineAlphaBuf = new Float32Array(maxLines * 2); // 1 alpha per vert

        this._lineGeo = new THREE.BufferGeometry();
        this._lineGeo.setAttribute('position',
            new THREE.BufferAttribute(this._linePosBuf,   3)
                .setUsage(THREE.DynamicDrawUsage));
        this._lineGeo.setAttribute('aAlpha',
            new THREE.BufferAttribute(this._lineAlphaBuf, 1)
                .setUsage(THREE.DynamicDrawUsage));
        this._lineGeo.setDrawRange(0, 0);

        this._lineMat = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite:  false,
            vertexShader:   LINE_VERTEX,
            fragmentShader: LINE_FRAGMENT,
            uniforms: { uColor: { value: color } },
        });

        this._lineSegments = new THREE.LineSegments(this._lineGeo, this._lineMat);
        this._lineSegments.frustumCulled = false; // bounds are never pre-computed on dynamic buffer
        scene.add(this._lineSegments);

        // ── Event listeners ──
        this._onMouseMove  = this._onMouseMove.bind(this);
        this._onMouseLeave = this._onMouseLeave.bind(this);
        this._onScroll     = this._onScroll.bind(this);

        container.addEventListener('mousemove',  this._onMouseMove);
        container.addEventListener('mouseleave', this._onMouseLeave);
        window.addEventListener('scroll', this._onScroll, { passive: true });

        this._container = container;
    }

    // -------------------------------------------------------------------------
    // Private event handlers

    _updateNDC(clientX, clientY) {
        const rect   = this._canvas.getBoundingClientRect();
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
        if (this._lastClientX !== null) {
            this._updateNDC(this._lastClientX, this._lastClientY);
        }
    }

    // -------------------------------------------------------------------------
    // Public API

    /** Rebuild the line segment buffer for the current mouse position and frame. */
    update() {
        if (this._mouse.x === Infinity) {
            this._lineGeo.setDrawRange(0, 0);
            return;
        }

        this._raycaster.setFromCamera(this._mouse, this._camera);
        const ro = this._raycaster.ray.origin;
        const rd = this._raycaster.ray.direction;

        const { _spacing: spacing, _xyExtent: xyExtent, _uFarDist: uFarDist,
                _hitRadius: hitRadius, _maxLines: maxLines,
                _linePosBuf: linePosBuf, _lineAlphaBuf: lineAlphaBuf } = this;

        let lineCount = 0;

        for (const [, pts] of this._slabs) {
            // World Z of this slab (geometry local Z + object position offset)
            const worldZ = pts.geometry.attributes.position.getZ(0) + pts.position.z;

            // Intersect ray with the slab's Z-plane
            if (Math.abs(rd.z) < 0.0001) continue;
            const t = (worldZ - ro.z) / rd.z;
            if (t < 0.01) continue;

            const hitX = ro.x + rd.x * t;
            const hitY = ro.y + rd.y * t;

            // Mirror the depth-based alpha from the point shader
            const depthDist = this._camera.position.z - worldZ;
            const slabAlpha = 1.0 - Math.max(0, Math.min(1, depthDist / uFarDist));
            if (slabAlpha < 0.01) continue;

            // Clamp grid-index search to the visible slab extent
            const gxMin = Math.max(-xyExtent, Math.ceil( (hitX - hitRadius) / spacing));
            const gxMax = Math.min( xyExtent, Math.floor((hitX + hitRadius) / spacing));
            const gyMin = Math.max(-xyExtent, Math.ceil( (hitY - hitRadius) / spacing));
            const gyMax = Math.min( xyExtent, Math.floor((hitY + hitRadius) / spacing));

            for (let gx = gxMin; gx <= gxMax && lineCount < maxLines; gx++) {
                for (let gy = gyMin; gy <= gyMax && lineCount < maxLines; gy++) {
                    const px = gx * spacing;
                    const py = gy * spacing;

                    const dx    = px - hitX;
                    const dy    = py - hitY;
                    const dist  = Math.sqrt(dx * dx + dy * dy);
                    const fade  = 1.0 - dist / hitRadius;
                    if (fade <= 0) continue;

                    const alpha = slabAlpha * fade;
                    const base  = lineCount * 6;
                    const ab    = lineCount * 2;

                    // Grid point end
                    linePosBuf[base]     = px;   linePosBuf[base + 1] = py;   linePosBuf[base + 2] = worldZ;
                    // Cursor end (at the ray-plane intersection, same Z)
                    linePosBuf[base + 3] = hitX; linePosBuf[base + 4] = hitY; linePosBuf[base + 5] = worldZ;

                    lineAlphaBuf[ab]     = alpha;
                    lineAlphaBuf[ab + 1] = alpha * 0.2; // fade toward cursor end

                    lineCount++;
                }
            }
        }

        this._lineGeo.attributes.position.needsUpdate = true;
        this._lineGeo.attributes.aAlpha.needsUpdate   = true;
        this._lineGeo.setDrawRange(0, lineCount * 2);
        if (lineCount > 0) this._lineGeo.computeBoundingSphere();
    }

    /** Remove from scene, dispose GPU resources, and unregister all listeners. */
    dispose() {
        this._container.removeEventListener('mousemove',  this._onMouseMove);
        this._container.removeEventListener('mouseleave', this._onMouseLeave);
        window.removeEventListener('scroll', this._onScroll);

        this._scene.remove(this._lineSegments);
        this._lineGeo.dispose();
        this._lineMat.dispose();
    }
}
