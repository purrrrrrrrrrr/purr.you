// @ts-nocheck
export function createDebugPlacement(viewportEl) {
  const el = document.createElement('div');
  el.className = 'debug-placement-area';

  const dragHandle = document.createElement('div');
  dragHandle.className = 'dbg-drag-handle';
  el.appendChild(dragHandle);

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'dbg-resize-handle';
  el.appendChild(resizeHandle);

  const labels = {};
  for (const pos of ['tl', 'tr', 'bl', 'br']) {
    const s = document.createElement('span');
    s.className = `dbg-corner dbg-${pos}`;
    el.appendChild(s);
    labels[pos] = s;
  }

  document.body.appendChild(el);

  const vr = viewportEl.getBoundingClientRect();
  let x = 0, y = vr.top + vr.height / 2;
  let w = vr.width / 2, h = vr.height / 2;

  function appLeft() { return viewportEl.getBoundingClientRect().left; }

  function apply() {
    const ax = appLeft() + x;
    el.style.left   = `${ax}px`;
    el.style.top    = `${y}px`;
    el.style.width  = `${w}px`;
    el.style.height = `${h}px`;
    labels.tl.textContent = `${Math.round(x)},${Math.round(y)}`;
    labels.tr.textContent = `${Math.round(x + w)},${Math.round(y)}`;
    labels.bl.textContent = `${Math.round(x)},${Math.round(y + h)}`;
    labels.br.textContent = `${Math.round(x + w)},${Math.round(y + h)}`;
  }

  apply();
  window.addEventListener('resize', apply);

  let drag = null;
  dragHandle.addEventListener('pointerdown', e => {
    drag = { sx: e.clientX, sy: e.clientY, ox: x, oy: y };
    dragHandle.setPointerCapture(e.pointerId);
  });
  dragHandle.addEventListener('pointermove', e => {
    if (!drag) return;
    x = drag.ox + (e.clientX - drag.sx);
    y = drag.oy + (e.clientY - drag.sy);
    apply();
  });
  dragHandle.addEventListener('pointerup', () => { drag = null; });

  let resize = null;
  resizeHandle.addEventListener('pointerdown', e => {
    resize = { sx: e.clientX, sy: e.clientY, ow: w, oh: h };
    resizeHandle.setPointerCapture(e.pointerId);
    e.stopPropagation();
  });
  resizeHandle.addEventListener('pointermove', e => {
    if (!resize) return;
    w = Math.max(40, resize.ow + (e.clientX - resize.sx));
    h = Math.max(40, resize.oh + (e.clientY - resize.sy));
    apply();
  });
  resizeHandle.addEventListener('pointerup', () => { resize = null; });

  return {
    contains: (e) => {
      const ax = appLeft() + x;
      return e.clientX >= ax && e.clientX <= ax + w
          && e.clientY >= y  && e.clientY <= y + h;
    },
    destroy() {
      window.removeEventListener('resize', apply);
      el.remove();
    }
  };
}
