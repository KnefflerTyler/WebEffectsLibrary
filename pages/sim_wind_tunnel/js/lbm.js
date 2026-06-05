/**
 * lbm.js — main-thread API that launches lbm.worker.js and relays results.
 *
 * Usage:
 *   import { runLBM } from './lbm.js';
 *
 *   const handle = runLBM({
 *       voxels   : objSphere.voxels,   // solid mask (from objects.js)
 *       onProgress : p => console.log(p * 100 + '%'),
 *       onComplete : lbmGrid => { ... },
 *       onCancel   : () => { ... },
 *   });
 *
 *   handle.cancel();  // terminates the worker early
 *
 * lbmGrid shape returned to onComplete:
 *   { NX, NY, NZ, DX,
 *     vx: Float32Array,   // normalised velocity (÷ U_IN); freestream = 1
 *     vy: Float32Array,
 *     vz: Float32Array }
 *
 * The velocity arrays are indexed as:  idx = ix + NX*(iy + NY*iz)
 * World position of cell (ix, iy, iz):
 *   wx = -TW/2 + (ix + 0.5)*DX
 *   wy = -TH/2 + (iy + 0.5)*DX
 *   wz = -TL/2 + (iz + 0.5)*DX
 */

/**
 * @param {{ voxels, onProgress, onComplete, onCancel }} opts
 * @returns {{ cancel: function }}
 */
export function runLBM({ voxels, onProgress, onComplete, onCancel }) {
    const workerUrl = new URL('./lbm.worker.js', import.meta.url);
    const worker    = new Worker(workerUrl, { type: 'module' });
    let terminated  = false;

    worker.onmessage = ({ data }) => {
        if (data.type === 'progress') {
            onProgress?.(data.value);

        } else if (data.type === 'complete') {
            if (!terminated) {
                worker.terminate();
                terminated = true;
                onComplete?.({
                    NX: data.NX,
                    NY: data.NY,
                    NZ: data.NZ,
                    DX: data.DX,
                    vx: new Float32Array(data.vx),
                    vy: new Float32Array(data.vy),
                    vz: new Float32Array(data.vz),
                });
            }

        } else if (data.type === 'error') {
            if (!terminated) {
                worker.terminate();
                terminated = true;
                console.error('[LBM worker]', data.message);
                onCancel?.();
            }
        }
    };

    worker.onerror = err => {
        if (!terminated) {
            worker.terminate();
            terminated = true;
            console.error('[LBM worker error]', err);
            onCancel?.();
        }
    };

    // Serialise voxel data for transfer into the worker.
    // Uint8Array is copied (not transferred) so objSphere.voxels remains usable.
    worker.postMessage({
        type  : 'start',
        voxels: voxels ? {
            data : voxels.data,
            ox   : voxels.ox,   oy: voxels.oy,   oz: voxels.oz,
            step : voxels.step,
            nx   : voxels.nx,   ny: voxels.ny,   nz: voxels.nz,
        } : null,
    });

    return {
        cancel() {
            if (!terminated) {
                worker.terminate();
                terminated = true;
                onCancel?.();
            }
        },
    };
}
