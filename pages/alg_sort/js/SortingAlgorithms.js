'use strict';

const ALGORITHM_NAMES = {
    bubble: 'Bubble Sort',
    insertion: 'Insertion Sort',
    selection: 'Selection Sort',
    merge: 'Merge Sort',
    quick: 'Quick Sort',
    heap: 'Heap Sort',
};

export class SortingAlgorithms {
    static options() {
        return Object.entries(ALGORITHM_NAMES).map(([key, name]) => ({ key, name }));
    }

    static nameFor(key) {
        return ALGORITHM_NAMES[key] ?? 'Sorting';
    }

    static run(key, input) {
        switch (key) {
            case 'bubble':
                return this.bubbleSortSteps(input);
            case 'insertion':
                return this.insertionSortSteps(input);
            case 'selection':
                return this.selectionSortSteps(input);
            case 'merge':
                return this.mergeSortSteps(input);
            case 'quick':
                return this.quickSortSteps(input);
            case 'heap':
                return this.heapSortSteps(input);
            default:
                return this.bubbleSortSteps(input);
        }
    }

    static bubbleSortSteps(input) {
        const arr = input.slice();
        const steps = [];
        const n = arr.length;

        for (let end = n - 1; end > 0; end--) {
            let swappedThisPass = false;
            for (let i = 0; i < end; i++) {
                steps.push({ type: 'compare', indices: [i, i + 1], label: `Comparing ${i + 1} and ${i + 2}` });
                if (arr[i] > arr[i + 1]) {
                    [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
                    steps.push({ type: 'swap', indices: [i, i + 1], label: 'Swapping adjacent bars' });
                    swappedThisPass = true;
                }
            }
            steps.push({ type: 'markSortedRange', from: end, to: n - 1, label: `Tail locked at ${n - end} bar${n - end === 1 ? '' : 's'}` });
            if (!swappedThisPass) break;
        }

        steps.push({ type: 'markSortedRange', from: 0, to: n - 1, label: 'Bubble sort complete' });
        this._appendVerificationPass(steps, n);
        return steps;
    }

    static selectionSortSteps(input) {
        const arr = input.slice();
        const steps = [];
        const n = arr.length;

        for (let i = 0; i < n - 1; i++) {
            let min = i;
            for (let j = i + 1; j < n; j++) {
                steps.push({ type: 'compare', indices: [min, j], label: `Scanning for minimum in pass ${i + 1}` });
                if (arr[j] < arr[min]) min = j;
            }
            if (min !== i) {
                [arr[i], arr[min]] = [arr[min], arr[i]];
                steps.push({ type: 'swap', indices: [i, min], label: 'Placing the smallest bar' });
            }
            steps.push({ type: 'markSortedIndex', index: i, label: `Position ${i + 1} fixed` });
        }

        steps.push({ type: 'markSortedRange', from: 0, to: n - 1, label: 'Selection sort complete' });
        this._appendVerificationPass(steps, n);
        return steps;
    }

    static insertionSortSteps(input) {
        const arr = input.slice();
        const steps = [];
        const n = arr.length;

        if (n > 0) {
            steps.push({ type: 'markSortedIndex', index: 0, label: 'First bar is the initial sorted run' });
        }

        for (let i = 1; i < n; i++) {
            const key = arr[i];
            let j = i - 1;

            while (j >= 0 && arr[j] > key) {
                steps.push({ type: 'compare', indices: [j, i], label: 'Sliding the key left' });
                arr[j + 1] = arr[j];
                steps.push({ type: 'write', index: j + 1, value: arr[j], label: 'Shifting a bar right' });
                j--;
            }

            arr[j + 1] = key;
            steps.push({ type: 'write', index: j + 1, value: key, label: 'Inserting the key' });
            steps.push({ type: 'markSortedRange', from: 0, to: i, label: `Prefix ${i + 1} sorted` });
        }

        steps.push({ type: 'markSortedRange', from: 0, to: n - 1, label: 'Insertion sort complete' });
        this._appendVerificationPass(steps, n);
        return steps;
    }

    static mergeSortSteps(input) {
        const arr = input.slice();
        const steps = [];

        function merge(lo, mid, hi) {
            const left = arr.slice(lo, mid + 1);
            const right = arr.slice(mid + 1, hi + 1);
            let i = 0;
            let j = 0;
            let k = lo;

            while (i < left.length && j < right.length) {
                steps.push({ type: 'compare', indices: [lo + i, mid + 1 + j], label: 'Merging sorted runs' });
                if (left[i] <= right[j]) {
                    arr[k] = left[i];
                    steps.push({ type: 'write', index: k, value: left[i], label: 'Writing from the left half' });
                    i++;
                } else {
                    arr[k] = right[j];
                    steps.push({ type: 'write', index: k, value: right[j], label: 'Writing from the right half' });
                    j++;
                }
                k++;
            }

            while (i < left.length) {
                arr[k] = left[i];
                steps.push({ type: 'write', index: k, value: left[i], label: 'Copying leftover left-half bars' });
                i++;
                k++;
            }

            while (j < right.length) {
                arr[k] = right[j];
                steps.push({ type: 'write', index: k, value: right[j], label: 'Copying leftover right-half bars' });
                j++;
                k++;
            }
        }

        function sort(lo, hi) {
            if (lo >= hi) {
                if (lo === hi) steps.push({ type: 'markSortedIndex', index: lo, label: 'Single bar is already sorted' });
                return;
            }

            const mid = Math.floor((lo + hi) / 2);
            sort(lo, mid);
            sort(mid + 1, hi);
            merge(lo, mid, hi);
            steps.push({ type: 'markSortedRange', from: lo, to: hi, label: `Merged segment ${lo + 1}-${hi + 1}` });
        }

        sort(0, arr.length - 1);
        steps.push({ type: 'markSortedRange', from: 0, to: arr.length - 1, label: 'Merge sort complete' });
        this._appendVerificationPass(steps, arr.length);
        return steps;
    }

    static quickSortSteps(input) {
        const arr = input.slice();
        const steps = [];

        function partition(lo, hi) {
            const pivot = arr[hi];
            let i = lo;

            for (let j = lo; j < hi; j++) {
                steps.push({ type: 'compare', indices: [j, hi], label: 'Checking the pivot boundary' });
                if (arr[j] <= pivot) {
                    if (i !== j) {
                        [arr[i], arr[j]] = [arr[j], arr[i]];
                        steps.push({ type: 'swap', indices: [i, j], label: 'Moving a bar below the pivot' });
                    }
                    i++;
                }
            }

            if (i !== hi) {
                [arr[i], arr[hi]] = [arr[hi], arr[i]];
                steps.push({ type: 'swap', indices: [i, hi], label: 'Placing the pivot' });
            }

            steps.push({ type: 'markSortedIndex', index: i, label: 'Pivot fixed' });
            return i;
        }

        function sort(lo, hi) {
            if (lo >= hi) {
                if (lo === hi) steps.push({ type: 'markSortedIndex', index: lo, label: 'Single bar fixed' });
                return;
            }

            const pivotIndex = partition(lo, hi);
            sort(lo, pivotIndex - 1);
            sort(pivotIndex + 1, hi);
        }

        sort(0, arr.length - 1);
        steps.push({ type: 'markSortedRange', from: 0, to: arr.length - 1, label: 'Quick sort complete' });
        this._appendVerificationPass(steps, arr.length);
        return steps;
    }

    static heapSortSteps(input) {
        const arr = input.slice();
        const steps = [];
        const n = arr.length;

        function siftDown(start, end) {
            let root = start;

            while (root * 2 + 1 <= end) {
                let child = root * 2 + 1;
                let swapIndex = root;

                steps.push({ type: 'compare', indices: [root, child], label: 'Heapifying the tree' });
                if (arr[swapIndex] < arr[child]) swapIndex = child;

                if (child + 1 <= end) {
                    steps.push({ type: 'compare', indices: [swapIndex, child + 1], label: 'Choosing the larger child' });
                    if (arr[swapIndex] < arr[child + 1]) swapIndex = child + 1;
                }

                if (swapIndex === root) return;

                [arr[root], arr[swapIndex]] = [arr[swapIndex], arr[root]];
                steps.push({ type: 'swap', indices: [root, swapIndex], label: 'Sifting a larger value upward' });
                root = swapIndex;
            }
        }

        for (let start = Math.floor(n / 2) - 1; start >= 0; start--) {
            siftDown(start, n - 1);
        }

        for (let end = n - 1; end > 0; end--) {
            [arr[end], arr[0]] = [arr[0], arr[end]];
            steps.push({ type: 'swap', indices: [0, end], label: 'Extracting the max bar' });
            steps.push({ type: 'markSortedIndex', index: end, label: `Bar ${end + 1} is locked` });
            siftDown(0, end - 1);
        }

        steps.push({ type: 'markSortedRange', from: 0, to: n - 1, label: 'Heap sort complete' });
        this._appendVerificationPass(steps, n);
        return steps;
    }

    static _appendVerificationPass(steps, count) {
        if (count < 2) {
            steps.push({ type: 'pass', label: 'Sorted order confirmed' });
            return;
        }

        for (let i = 0; i < count - 1; i++) {
            steps.push({
                type: 'compare',
                indices: [i, i + 1],
                label: `Verifying ${i + 1} and ${i + 2}`,
            });
        }

        steps.push({ type: 'pass', label: 'Sorted order confirmed' });
    }
}
