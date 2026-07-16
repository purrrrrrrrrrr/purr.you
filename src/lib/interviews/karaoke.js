import { escapeHtml } from './html.js';

/**
 * @param {HTMLElement} containerEl
 * @param {() => number} getTime
 */
export function createKaraoke(containerEl, getTime) {
  /** @type {{ start: number, end: number, text: string }[]} */
  let cues = [];
  /** @type {HTMLElement[]} */
  let cueEls = [];
  /** @type {HTMLElement[]} */
  let fills = [];
  let activeCueIdx = -1;
  /** @type {number | null} */
  let rafId = null;

  function tick() {
    update(getTime());
    rafId = requestAnimationFrame(tick);
  }

  /** @param {{ start: number, end: number, text: string }[]} cuesNext */
  function render(cuesNext) {
    cues = cuesNext;
    activeCueIdx = -1;
    containerEl.innerHTML = cues.map((c, i) => `
      <div class="cue" data-cue="${i}">
        <span class="cue-base">${escapeHtml(c.text)}</span>
        <span class="cue-fill" style="clip-path: inset(0 100% 0 0)">${escapeHtml(c.text)}</span>
      </div>
    `).join('');
    cueEls = /** @type {HTMLElement[]} */ (Array.from(containerEl.querySelectorAll('.cue')));
    fills = /** @type {HTMLElement[]} */ (Array.from(containerEl.querySelectorAll('.cue-fill')));
    containerEl.style.transform = 'translateY(0)';
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  /** @param {number} currentTime */
  function update(currentTime) {
    const idx = cues.findIndex(c => currentTime >= c.start && currentTime < c.end);
    if (idx === -1) return;
    if (idx !== activeCueIdx) {
      activeCueIdx = idx;
      cueEls.forEach((el, i) => el.classList.toggle('active', i === idx));
      const dy = cueEls[idx].offsetTop - cueEls[0].offsetTop;
      containerEl.style.transform = `translateY(-${dy}px)`;
    }
    const cue = cues[idx];
    const pct = Math.min(100, Math.max(0, ((currentTime - cue.start) / (cue.end - cue.start)) * 100));
    if (fills[idx]) fills[idx].style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
  }

  function destroy() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  return { render, destroy };
}
