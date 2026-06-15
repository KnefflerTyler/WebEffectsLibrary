"use strict";

// GameManager - High-performance sprite orchestration for thousands of entities
//
// Performance optimizations implemented:
// 1. Weighted update queue - only updates high-priority sprites each frame
// 2. Object pooling - reuses arrays/objects to reduce garbage collection
// 3. Distance-based culling - skips updates for very distant sprites
// 4. Adaptive BSP spatial partitioning - efficient collision queries
// 5. Cached spatial structures - rebuilds only when necessary
//
// Configuration:
// - weightBudget: controls how many sprites update per frame
// - maxQueueAge: ensures no sprite waits longer than this (seconds)
// - distanceCulling: enable/disable distance-based update skipping
// - maxUpdateDistance: pixels beyond which sprites update less frequently

import BSP from './spatial/bsp.js';
import { colliderArrayPool, queueEntryPool } from './objectPool.js';

function safeBBox(item) {
    if (!item) return null;
    if (item.minX !== undefined && item.minY !== undefined && item.maxX !== undefined && item.maxY !== undefined) {
        return { minX: item.minX, minY: item.minY, maxX: item.maxX, maxY: item.maxY };
    }

    // SpriteCollider-like: has worldPos() and radius (circle-only)
    if (typeof item.worldPos === 'function') {
        const p = item.worldPos() || {};
        if (p.x !== undefined && p.y !== undefined) {
            const r = item.radius || 4;
            return { minX: p.x - r, minY: p.y - r, maxX: p.x + r, maxY: p.y + r };
        }
    }

    // Plain circle-like
    if (item.x !== undefined && item.y !== undefined && item.r !== undefined) {
        return { minX: item.x - item.r, minY: item.y - item.r, maxX: item.x + item.r, maxY: item.y + item.r };
    }
    
    return null;
}

function getBoundsForSprite(s) {
    if (!s) return null;
    if (s.collider) {
        const bb = safeBBox(s.collider);
        if (bb) return bb;
    }
    const x = (s.x !== undefined) ? s.x : (s.cx !== undefined ? s.cx : 0);
    const y = (s.y !== undefined) ? s.y : (s.cy !== undefined ? s.cy : 0);
    const w = (s.width !== undefined) ? s.width : (s.w !== undefined ? s.w : 10);
    const h = (s.height !== undefined) ? s.height : (s.h !== undefined ? s.h : 10);
    return { minX: x - w / 2, minY: y - h / 2, maxX: x + w / 2, maxY: y + h / 2 };
}

// Game orchestrates global state and a weighted update queue for objects.
// The queue orders sprites by a weight calculated from a base priority
// (e.g. proximity to target) multiplied by age (time since last update).
export default class GameManager {
    constructor({ sprites = [], target = null, flock = null, weightBudget = 50, maxQueueAge = 0.01 } = {}) {
        this.sprites = sprites;
        this.target = target || { x: 0, y: 0 };
        this.flock = flock || null;

        // per-frame budget for executing updates (in arbitrary cost units)
        this.weightBudget = weightBudget;
        // maximum acceptable time (seconds) a sprite may sit in the queue
        this.maxQueueAge = maxQueueAge; // default 0.01s (10ms)

        // customizable functions
        // basePriority(sprite, game) -> number (higher = more important)
        this.basePriority = (s, g) => {
            // default: sprites closer to target are higher priority
            const tx = g.target.x ?? 0;
            const ty = g.target.y ?? 0;
            const dx = (s.x ?? 0) - tx;
            const dy = (s.y ?? 0) - ty;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            return 1 / (1 + dist);
        };

        // costFunction(sprite) -> number cost to execute update (default 1)
        this.costFunction = (s) => 1;

        // weightFunction combines basePriority and age (time since last update)
        this.weightFunction = (s, g, now) => {
            const base = g.basePriority(s, g) || 0;
            const last = s._lastUpdateTime || 0;
            const age = Math.max(0, now - last);

            // Strongly scale weight based on age so starving sprites bubble up quickly.
            // Use a fourth-power curve normalized by maxQueueAge to make weight
            // explode once an item approaches the threshold.
            const norm = (g.maxQueueAge > 0) ? (age / g.maxQueueAge) : age;
            const ageFactor = Math.pow(1 + norm, 4);

            return base * ageFactor;
        };

        // BSP cache to avoid rebuilding every frame
        this._bspCache = {
            tree: null,
            lastCount: 0,
            frameCounter: 0,
        };

        // Performance settings
        this.distanceCulling = true; // skip updates for very distant sprites
        this.maxUpdateDistance = 2000; // pixels - sprites beyond this only get minimal updates
        this.distantUpdateInterval = 5; // frames between updates for distant sprites
        
        // Extreme-scale optimizations (10k+ sprites)
        this.disableCollisionsThreshold = 5000; // disable collisions above this sprite count
        this.partialSortSize = 1000; // only sort top N sprites (rest get randomized priority)
        this.maxCollisionChecks = 200; // max sprites that check collisions per frame
    }

    setSprites(arr) {
        this.sprites = arr || [];
        // initialize timestamps for scheduling
        const now = performance.now() / 1000;
        for (const s of this.sprites) s._lastUpdateTime = s._lastUpdateTime || now;
    }

    setTarget(x, y) {
        this.target.x = x;
        this.target.y = y;
    }

    // Build and execute a weighted update queue within this.weightBudget
    update(dt) {
        const now = performance.now() / 1000;

        // Extreme-scale optimization: disable collisions if sprite count too high
        const spriteCount = (this.flock && this.flock.sprites) ? this.flock.sprites.length : this.sprites.length;
        const useCollisions = spriteCount < this.disableCollisionsThreshold;
        
        // Collect colliders once per frame (only if enabled)
        const colliders = useCollisions ? this.sprites.map(s => s.collider).filter(Boolean) : [];

        // Spatial partition colliders for fast local queries
        let bsp = null;
        try {
            // lazy import-friendly: require local module
            // eslint-disable-next-line no-undef
            // import path relative
        } catch (e) {
            // ignore
        }

        // Build queue with computed weight (use flock's live sprite list if available)
        const spritesList = (this.flock && this.flock.sprites) ? this.flock.sprites : this.sprites;
        const queue = [];
        const pooledEntries = [];
        
        for (const s of spritesList) {
            if (typeof s.update !== 'function') continue;
            
            // Distance-based culling: skip very distant sprites most frames
            if (this.distanceCulling) {
                const dx = (s.x ?? 0) - this.target.x;
                const dy = (s.y ?? 0) - this.target.y;
                const distSq = dx * dx + dy * dy;
                const maxDistSq = this.maxUpdateDistance * this.maxUpdateDistance;
                
                if (distSq > maxDistSq) {
                    // Only update distant sprites occasionally
                    const framesSinceUpdate = Math.floor((now - (s._lastUpdateTime || 0)) * 60);
                    if (framesSinceUpdate < this.distantUpdateInterval) {
                        continue; // skip this frame
                    }
                }
            }
            
            const last = s._lastUpdateTime || 0;
            const age = Math.max(0, now - last);
            const weight = this.weightFunction(s, this, now);
            
            // Use pooled objects to reduce GC pressure
            const entry = queueEntryPool.acquire();
            entry.sprite = s;
            entry.weight = weight;
            entry.age = age;
            queue.push(entry);
            pooledEntries.push(entry);
        }

        // Partial sort optimization for extreme scale: only sort top portion
        if (queue.length > this.partialSortSize * 2) {
            // Partition: move high-weight items to front using partial quickselect approach
            // Full sort only top portion, rest stay in random order (they'll age up later)
            const topN = Math.min(this.partialSortSize, queue.length);
            queue.sort((a, b) => b.weight - a.weight);
            // Only keep sorted top N in queue for this frame, sample rest randomly
            const rest = queue.slice(topN);
            queue.length = topN;
            // Add random sample from rest
            const sampleSize = Math.min(rest.length, Math.floor(topN * 0.2));
            for (let i = 0; i < sampleSize; i++) {
                const idx = Math.floor(Math.random() * rest.length);
                queue.push(rest[idx]);
                rest.splice(idx, 1);
            }
        } else {
            // Normal sort for smaller queues
            queue.sort((a, b) => b.weight - a.weight);
        }

        // Build or reuse BSP for collider queries (only if many colliders)
        let bspTree = null;
        const cache = this._bspCache;
        cache.frameCounter++;
        
        // Adaptive rebuild: less frequent for larger sprite counts
        const rebuildInterval = colliders.length > 1000 ? 20 : (colliders.length > 100 ? 10 : 5);
        const shouldRebuild = (colliders.length !== cache.lastCount) || (cache.frameCounter % rebuildInterval === 0);
        
        if (colliders.length > 16) {
            try {
                if (!cache.tree || shouldRebuild) {
                    // Adaptive BSP parameters based on sprite count
                    const leafSize = colliders.length > 1000 ? 16 : 8;
                    const maxDepth = colliders.length > 5000 ? 14 : 12;
                    cache.tree = new BSP(colliders, { leafSize, maxDepth });
                    cache.lastCount = colliders.length;
                }
                bspTree = cache.tree;
            } catch (e) {
                bspTree = null;
            }
        } else {
            // clear cache for small counts
            cache.tree = null;
            cache.lastCount = colliders.length;
        }

        // Execute updates until budget exhausted
        let budget = this.weightBudget;
        // Allow limited overspend to guarantee items older than maxQueueAge are executed.
        const maxOverspend = Math.max(0, this.weightBudget); // allow at most one budget's worth negative
        let collisionChecksUsed = 0;
        const maxCollisionChecks = useCollisions ? this.maxCollisionChecks : 0;
        
        for (const entry of queue) {
            const s = entry.sprite;
            const cost = Math.max(0.0001, this.costFunction(s));

            // If budget exhausted but entry is older than threshold, allow execution
            if (cost > budget) {
                if (entry.age < this.maxQueueAge) {
                    // skip until next frame
                    continue;
                }

                // enforce overspend limit
                if (budget - cost < -maxOverspend) continue;
            }

            // Compute per-sprite dt (time since last update or frame dt)
            const spriteDtRaw = Math.max(entry.age, dt);
            // Cap to avoid huge physics steps that destabilize simulation
            const spriteDt = Math.min(spriteDtRaw, 0.1);

            // Determine local colliders for this sprite (use BSP if available)
            // Skip collision checks if globally disabled or budget exhausted
            const shouldCheckCollisions = useCollisions && collisionChecksUsed < maxCollisionChecks;
            let localColliders = shouldCheckCollisions ? colliderArrayPool.acquire() : [];
            
            if (shouldCheckCollisions) {
                collisionChecksUsed++;
            }
            
            try {
                const bounds = shouldCheckCollisions ? getBoundsForSprite(s) : null;
                if (shouldCheckCollisions && bspTree && bounds) {
                    // Query with larger margin for better collision detection
                    const margin = Math.max(s.width || 10, s.height || 10);
                    const results = bspTree.queryBox(
                        bounds.minX - margin, 
                        bounds.minY - margin, 
                        bounds.maxX + margin, 
                        bounds.maxY + margin
                    );
                    for (const c of results) {
                        if (c !== s.collider) localColliders.push(c);
                    }
                } else if (bounds) {
                    // fallback: filter by bbox overlap cheaply
                    for (const c of colliders) {
                        if (c === s.collider) continue;
                        const bb = safeBBox(c);
                        if (!bb) continue;
                        if (!(bb.minX > bounds.maxX || bb.maxX < bounds.minX || 
                              bb.minY > bounds.maxY || bb.maxY < bounds.minY)) {
                            localColliders.push(c);
                        }
                    }
                } else {
                    // no bounds available, use all colliders
                    for (const c of colliders) {
                        if (c !== s.collider) localColliders.push(c);
                    }
                }
            } catch (e) {
                // on error, fall back to all colliders
                colliderArrayPool.release(localColliders);
                localColliders = colliders;
            }

            // Apply flock/global forces if available using per-sprite dt
            if (this.flock && typeof this.flock.applyForces === 'function') {
                this.flock.applyForces(s, spriteDt);
            }

            try {
                s.update(spriteDt, localColliders);
            } catch (e) {
                console.error('[Game] sprite.update threw', e);
            }

            // Release pooled collider array if we acquired one
            if (shouldCheckCollisions && localColliders !== colliders && localColliders.length >= 0) {
                colliderArrayPool.release(localColliders);
            }

            // mark sprite as updated now
            s._lastUpdateTime = now;
            budget -= cost;

            // Stop if we've exhausted allowed overspend
            if (budget <= -maxOverspend) break;
        }
        
        // Release all pooled queue entries
        queueEntryPool.releaseAll(pooledEntries);
    }
}
