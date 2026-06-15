"use strict";

// ObjectPool - reuse arrays and objects to reduce garbage collection pressure
// Critical for handling thousands of sprites with frequent allocations

export class ArrayPool {
    constructor(initialSize = 10) {
        this.pool = [];
        for (let i = 0; i < initialSize; i++) {
            this.pool.push([]);
        }
    }

    acquire() {
        if (this.pool.length > 0) {
            return this.pool.pop();
        }
        return [];
    }

    release(arr) {
        if (!arr) return;
        arr.length = 0; // clear the array
        this.pool.push(arr);
    }

    releaseAll(arrays) {
        for (const arr of arrays) {
            this.release(arr);
        }
    }

    getSize() {
        return this.pool.length;
    }
}

// Pool for reusable objects (e.g., collision results, queue entries)
export class ObjectPool {
    constructor(factory, reset, initialSize = 10) {
        this.factory = factory; // function that creates new objects
        this.reset = reset; // function that resets object state
        this.pool = [];
        
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(this.factory());
        }
    }

    acquire() {
        if (this.pool.length > 0) {
            const obj = this.pool.pop();
            return obj;
        }
        return this.factory();
    }

    release(obj) {
        if (!obj) return;
        if (this.reset) this.reset(obj);
        this.pool.push(obj);
    }

    releaseAll(objects) {
        for (const obj of objects) {
            this.release(obj);
        }
    }

    getSize() {
        return this.pool.length;
    }
}

// Singleton pools for common use cases
export const colliderArrayPool = new ArrayPool(20);
export const queueEntryPool = new ObjectPool(
    () => ({ sprite: null, weight: 0, age: 0 }),
    (obj) => { obj.sprite = null; obj.weight = 0; obj.age = 0; },
    100
);
