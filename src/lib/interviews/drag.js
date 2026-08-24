import { PLACING } from './hands.js';

/** @param {HTMLElement} rootEl */
export function createPlacementHand(rootEl) {
  const el = document.createElement('div');
  el.className = 'databun-drag';
  el.innerHTML = PLACING;
  rootEl.appendChild(el);

  const v = /** @type {HTMLElement} */ (rootEl.querySelector('.viewport')).getBoundingClientRect();
  el.style.left = `${v.left + v.width / 2 - 90}px`;
  el.style.top  = `${v.top + v.height / 2 - 70}px`;

  return { destroy() { el.remove(); } };
}
