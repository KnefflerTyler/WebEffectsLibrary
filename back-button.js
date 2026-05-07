(() => {
    const btn = document.createElement('a');
    btn.href      = '../index.html';
    btn.innerText = '← Back';
    btn.style.cssText = `
        position: fixed;
        top: 16px;
        left: 16px;
        z-index: 9999;
        padding: 7px 14px;
        background: rgba(10,14,20,0.72);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 8px;
        color: #c8d6e8;
        font-family: 'Segoe UI', system-ui, sans-serif;
        font-size: 0.85rem;
        font-weight: 600;
        text-decoration: none;
        backdrop-filter: blur(6px);
        transition: background 0.15s, border-color 0.15s;
    `;
    btn.addEventListener('mouseenter', () => {
        btn.style.background   = 'rgba(27,79,138,0.85)';
        btn.style.borderColor  = 'rgba(74,158,255,0.5)';
    });
    btn.addEventListener('mouseleave', () => {
        btn.style.background   = 'rgba(10,14,20,0.72)';
        btn.style.borderColor  = 'rgba(255,255,255,0.12)';
    });
    document.body.appendChild(btn);
})();
