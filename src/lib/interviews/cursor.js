import { HOLDING_DATABUN, PLACING, POINTING } from './hands.js';

const POSES = { holding: HOLDING_DATABUN, placing: PLACING, pointing: POINTING };

/** @param {HTMLElement} rootEl */
export function createCursor(rootEl) {
  const el = document.createElement('div');
  el.className = 'hand-cursor';
  el.innerHTML = POSES.holding;
  el.style.display = 'none';
  rootEl.appendChild(el);

  let visible = false;
  let frozen = false;
  let lastX = 0, lastY = 0;

  /** @param {PointerEvent} e */
  function onMove(e) {
    lastX = e.clientX;
    lastY = e.clientY;
    if (frozen) return;
    el.style.left = `${e.clientX}px`;
    el.style.top = `${e.clientY}px`;
    if (!visible) { el.style.display = 'block'; visible = true; }
  }

  function freeze() {
    frozen = true;
    const x = 230;
    const y = 350;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.position = 'absolute';
    if (!visible) { el.style.display = 'block'; visible = true; }
  }

  function unfreeze() {
    frozen = false;
    el.style.left = `${lastX}px`;
    el.style.top = `${lastY}px`;
    el.style.position = 'fixed';
  }

  function attach() {
    rootEl.classList.add('cursor-hidden');
    window.addEventListener('pointermove', onMove);
    el.style.display = 'none';
  }

  function detach() {
    rootEl.classList.remove('cursor-hidden');
    window.removeEventListener('pointermove', onMove);
    el.style.display = 'none';
    visible = false;
  }

  /** @param {keyof typeof POSES} name */
  function setPose(name) {
    el.innerHTML = POSES[name];
    el.dataset.pose = name;
  }

  return { attach, detach, setPose, freeze, unfreeze };
}
