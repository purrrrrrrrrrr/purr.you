import { HOLDING_DATABUN } from './hands.js';

export function createDrag(rootEl, slotEl, onDrop, inZone) {
  const el = document.createElement('div');
  el.className = 'databun-drag';
  el.innerHTML = HOLDING_DATABUN;
  rootEl.appendChild(el);

  const v = rootEl.querySelector('.viewport').getBoundingClientRect();
  el.style.left = `${v.left + v.width / 2 - 90}px`;
  el.style.top  = `${v.top + v.height / 2 - 70}px`;

  let dragging = false;
  let offsetX = 0, offsetY = 0;

  el.addEventListener('pointerdown', (e) => {
    dragging = true;
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
    const r = el.getBoundingClientRect();
    offsetX = e.clientX - r.left;
    offsetY = e.clientY - r.top;
  });

  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    el.style.left = `${e.clientX - offsetX}px`;
    el.style.top  = `${e.clientY - offsetY}px`;
  });

  el.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('dragging');
    const slot = slotEl.getBoundingClientRect();
    const slotHit = e.clientX >= slot.left && e.clientX <= slot.right
                 && e.clientY >= slot.top  && e.clientY <= slot.bottom;
    const zoneHit = inZone ? inZone(e) : false;
    if (slotHit || zoneHit) {
      el.remove();
      onDrop();
    }
  });

  return { destroy() { el.remove(); } };
}
