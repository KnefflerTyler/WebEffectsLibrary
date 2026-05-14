/**
 * Returns the appropriate DOM event type for a form element.
 * Checkboxes and selects use 'change'; everything else uses 'input'.
 * @param {HTMLElement} el
 * @returns {'change'|'input'}
 */
export function evtFor(el) {
    return (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
}

/**
 * Binds an input element to a display-only span.
 * Updates the span text on drag/input but applies nothing to the engine.
 * @param {string} id      - Input element id
 * @param {string} valId   - Display span id
 * @param {number} [decimals=0]
 */
export function bindDisplay(id, valId, decimals = 0) {
    const el  = document.getElementById(id);
    const val = document.getElementById(valId);
    if (!el || !val) return;
    el.addEventListener('input', () => val.textContent = parseFloat(el.value).toFixed(decimals));
}

/**
 * Wires the settings panel open/close toggle button.
 * Clicking the button toggles 'sp-open'. Clicking outside the panel closes it.
 * @param {string} [btnId='spBtn']
 * @param {string} [panelId='spPanel']
 */
export function initPanelToggle(btnId = 'spBtn', panelId = 'spPanel') {
    const btn   = document.getElementById(btnId);
    const panel = document.getElementById(panelId);
    if (!btn || !panel) return;
    btn.addEventListener('click', () => {
        btn.classList.toggle('sp-open');
        panel.classList.toggle('sp-open');
    });
    document.addEventListener('click', e => {
        if (!panel.contains(e.target) && e.target !== btn) {
            btn.classList.remove('sp-open');
            panel.classList.remove('sp-open');
        }
    });
}

/**
 * Factory for live-apply settings wiring.
 *
 *   const { wire, restore } = makeWirer('ns:');
 *   wire('cfgX', 'valX', v => apply(+v));          // auto decimal from el.step
 *   wire('cfgY', null,   v => apply(+v), 2);        // explicit 2 decimal places
 *   restore();
 *
 * wire(id, valId, onInput, decimals?)
 *   - Listens for the appropriate DOM event (input/change)
 *   - Saves value to localStorage on change
 *   - Updates the display span if valId is provided
 *   - Calls onInput(value, el): boolean for checkboxes, string otherwise
 *   - decimals: display decimal count; defaults to auto-detect from el.step
 *
 * restore()
 *   - Reads all registered ids from localStorage and re-applies them
 *
 * @param {string} NS - localStorage namespace prefix (e.g. 'gb:')
 */
export function makeWirer(NS) {
    const reg = [];

    function wire(id, valId, onInput, decimals = null) {
        const el  = document.getElementById(id);
        const val = valId ? document.getElementById(valId) : null;
        if (!el) return;
        const dec = decimals ?? (el.step?.includes('.') ? el.step.split('.')[1].length : 0);
        reg.push({ id, el, val, dec, onInput });
        el.addEventListener(evtFor(el), () => {
            const v = el.type === 'checkbox' ? el.checked : el.value;
            localStorage.setItem(NS + id, el.type === 'checkbox' ? String(v) : v);
            if (val) val.textContent = el.type === 'checkbox' ? '' : (+v).toFixed(dec);
            onInput(v, el);
        });
    }

    function restore() {
        reg.forEach(({ id, el, val, dec, onInput }) => {
            const stored = localStorage.getItem(NS + id);
            if (stored === null) return;
            if (el.type === 'checkbox') el.checked = stored === 'true';
            else el.value = stored;
            if (val) val.textContent = el.type === 'checkbox' ? '' : (+stored).toFixed(dec);
            onInput(el.type === 'checkbox' ? (stored === 'true') : stored, el);
        });
    }

    return { wire, restore };
}

/**
 * Persist pattern for Apply-button terrain effects.
 * Saves all ids to localStorage on change.
 * Restores values via dispatchEvent (which triggers bindDisplay listeners).
 * Calls onRestored() after all values are restored.
 * @param {string}   NS         - localStorage namespace prefix
 * @param {string[]} ids        - Array of element ids to persist
 * @param {Function} onRestored - Called after all values are restored
 */
export function persistSettings(NS, ids, onRestored) {
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener(evtFor(el), () =>
            localStorage.setItem(NS + id, el.type === 'checkbox' ? String(el.checked) : el.value));
    });
    ids.forEach(id => {
        const el = document.getElementById(id);
        const v  = localStorage.getItem(NS + id);
        if (!el || v === null) return;
        if (el.type === 'checkbox') el.checked = v === 'true';
        else el.value = v;
        el.dispatchEvent(new Event(evtFor(el)));
    });
    onRestored?.();
}
