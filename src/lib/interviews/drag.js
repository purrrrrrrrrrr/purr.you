import { PLACING } from './hands.js';

/** @param {HTMLElement} rootEl */
export function createPlacementHand(rootEl) {
  const el = document.createElement('div');
  el.className = 'databun-drag';
  el.innerHTML = PLACING;
  rootEl.appendChild(el);

  const slot = /** @type {HTMLElement} */ (rootEl.querySelector('.slot')).getBoundingClientRect();
  const hand = el.getBoundingClientRect();
  el.style.left = '50px';
  el.style.top  = `${slot.top + (slot.height - hand.height) / 2 - 48}px`;

  return { destroy() { el.remove(); } };
}
