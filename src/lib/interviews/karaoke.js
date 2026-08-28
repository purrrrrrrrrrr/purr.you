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
  /** @type {{ el: HTMLElement, start: number, end: number, textEnd: number }[][]} */
  let lineGroups = [];
  let activeCueIdx = -1;
  /** @type {number | null} */
  let rafId = null;

  function tick() {
    update(getTime());
    rafId = requestAnimationFrame(tick);
  }

  /**
   * Groups a cue's words by their rendered line (via offsetTop) so each visual
   * line can fill independently, splitting the cue's duration between lines
   * proportionally by rendered text width.
   * @param {{ start: number, end: number, text: string }} cue
   * @param {HTMLElement} wordsEl
   */
  function splitLines(cue, wordsEl) {
    const wordEls = /** @type {HTMLElement[]} */ (Array.from(wordsEl.children));
    /** @type {{ words: string[], left: number, right: number }[]} */
    const lineWords = [];
    let lastTop = null;
    for (const w of wordEls) {
      if (lastTop === null || Math.abs(w.offsetTop - lastTop) > 1) {
        lineWords.push({ words: [], left: w.offsetLeft, right: w.offsetLeft + w.offsetWidth });
        lastTop = w.offsetTop;
      }
      const line = lineWords[lineWords.length - 1];
      line.words.push(/** @type {string} */ (w.textContent));
      line.left = Math.min(line.left, w.offsetLeft);
      line.right = Math.max(line.right, w.offsetLeft + w.offsetWidth);
    }
    const availableWidth = containerEl.clientWidth || 1;
    const lines = lineWords.map(line => ({
      text: line.words.join(' '),
      width: line.right - line.left,
      textEnd: Math.min(1, Math.max(0, line.right / availableWidth))
    }));
    const totalWidth = lines.reduce((sum, line) => sum + line.width, 0) || 1;
    const duration = cue.end - cue.start;
    let t = cue.start;
    return lines.map(line => {
      const start = t;
      t += (line.width / totalWidth) * duration;
      return { text: line.text, start, end: t, textEnd: line.textEnd };
    });
  }

  /** @param {{ start: number, end: number, text: string }[]} cuesNext */
  function render(cuesNext) {
    cues = cuesNext;
    activeCueIdx = -1;

    containerEl.innerHTML = cues.map((c, i) => `
      <div class="cue" data-cue="${i}"><div class="cue-measure"><span class="cue-words">${
        c.text.split(/\s+/).filter(Boolean).map(w => `<span>${escapeHtml(w)}</span>`).join(' ')
      }</span></div></div>
    `).join('');
    const measured = cues.map((c, i) => {
      const wordsEl = /** @type {HTMLElement} */ (containerEl.querySelectorAll('.cue')[i].querySelector('.cue-words'));
      return splitLines(c, wordsEl);
    });

    containerEl.innerHTML = cues.map((c, i) => `
      <div class="cue" data-cue="${i}">${measured[i].map(line => `
        <div class="cue-line">
          <span class="cue-base">${escapeHtml(line.text)}</span>
          <span class="cue-fill" style="clip-path: inset(0 100% -1px 0)">${escapeHtml(line.text)}</span>
        </div>
      `).join('')}</div>
    `).join('');
    cueEls = /** @type {HTMLElement[]} */ (Array.from(containerEl.querySelectorAll('.cue')));
    lineGroups = measured.map((lines, i) => {
      const fillEls = Array.from(cueEls[i].querySelectorAll('.cue-fill'));
      return lines.map((line, j) => ({ ...line, el: /** @type {HTMLElement} */ (fillEls[j]) }));
    });

    containerEl.style.transform = 'translateY(0)';
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  /** @param {number} currentTime */
  function update(currentTime) {
    const idx = cues.findIndex(c => currentTime >= c.start && currentTime < c.end);
    if (idx === -1) {
      if (activeCueIdx !== -1 && currentTime >= cues[activeCueIdx].end) {
        for (const line of lineGroups[activeCueIdx]) {
          line.el.style.clipPath = 'inset(0 0% 0 0)';
        }
      }
      return;
    }
    if (idx !== activeCueIdx) {
      if (activeCueIdx !== -1 && idx > activeCueIdx) {
        for (const line of lineGroups[activeCueIdx]) {
          line.el.style.clipPath = 'inset(0 0% 0 0)';
        }
      }
      activeCueIdx = idx;
      cueEls.forEach((el, i) => el.classList.toggle('active', i === idx));
      const dy = cueEls[idx].offsetTop - cueEls[0].offsetTop;
      containerEl.style.transform = `translateY(-${dy}px)`;
    }
    for (const line of lineGroups[idx]) {
      const progress = currentTime < line.start ? 0
        : currentTime >= line.end ? 1
        : (currentTime - line.start) / (line.end - line.start);
      const textPhaseEnd = 0.8;
      const tailProgress = Math.max(0, (progress - textPhaseEnd) / (1 - textPhaseEnd));
      const acceleratedTail = 0.2 * tailProgress + 0.8 * tailProgress * tailProgress;
      const pct = progress <= textPhaseEnd
        ? (progress / textPhaseEnd) * line.textEnd * 100
        : (line.textEnd + (1 - line.textEnd) * acceleratedTail) * 100;
      line.el.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
    }
  }

  function destroy() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  return { render, destroy };
}
