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
  let activeLineIdx = 0;
  /** @type {{ cueIdx: number, lineIdx: number, time: number } | null} */
  let seekOrigin = null;
  /** @type {number | null} */
  let rafId = null;

  function tick() {
    update(getTime());
    rafId = requestAnimationFrame(tick);
  }

  /**
   * Center the line currently being filled within the visible subtitle area.
   * @param {number} idx
   * @param {number} [lineIdx]
   */
  function positionActiveCue(idx, lineIdx = 0) {
    const chapterLineIdx = lineGroups
      .slice(0, idx)
      .reduce((count, lines) => count + lines.length, 0) + lineIdx;
    if (chapterLineIdx < 2) {
      containerEl.style.transform = 'translateY(0)';
      return;
    }
    const firstRow = /** @type {HTMLElement | null} */ (cueEls[idx]?.querySelector('.cue-line'));
    const rowHeight = firstRow?.offsetHeight || 0;
    const cueOffset = cueEls[idx].offsetTop - cueEls[0].offsetTop;
    const lineOffset = cueOffset + lineIdx * rowHeight;
    const visibleHeight = containerEl.parentElement?.clientHeight || rowHeight;
    const centeredRowOffset = Math.max(0, (visibleHeight - rowHeight) / 2);
    const dy = lineOffset - centeredRowOffset;
    containerEl.style.transform = `translateY(${-dy}px)`;
  }

  /** Place a line at the top of the subtitle viewport after a transport seek. */
  function positionLineAtTop(idx, lineIdx) {
    const firstRow = /** @type {HTMLElement | null} */ (cueEls[idx]?.querySelector('.cue-line'));
    const rowHeight = firstRow?.offsetHeight || 0;
    const cueOffset = cueEls[idx].offsetTop - cueEls[0].offsetTop;
    containerEl.style.transform = `translateY(${-Math.max(0, cueOffset + lineIdx * rowHeight)}px)`;
  }

  function onResize() {
    if (activeCueIdx !== -1) positionActiveCue(activeCueIdx, activeLineIdx);
  }

  window.addEventListener('resize', onResize);

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
    activeLineIdx = 0;
    seekOrigin = null;

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
      activeLineIdx = 0;
      seekOrigin = null;
      cueEls.forEach((el, i) => el.classList.toggle('active', i === idx));
      positionActiveCue(idx);
    }
    const currentLineIdx = Math.max(0, lineGroups[idx].findIndex(line => currentTime < line.end));
    if (currentLineIdx !== activeLineIdx) {
      activeLineIdx = currentLineIdx;
      positionActiveCue(idx, activeLineIdx);
    }
    for (const line of lineGroups[idx]) {
      const lineIdx = lineGroups[idx].indexOf(line);
      const resetStart = seekOrigin?.cueIdx === idx && seekOrigin.lineIdx === lineIdx
        ? Math.max(line.start, seekOrigin.time)
        : line.start;
      const beforeResetLine = seekOrigin?.cueIdx === idx && lineIdx < seekOrigin.lineIdx;
      const progress = beforeResetLine || currentTime < resetStart ? 0
        : currentTime >= line.end ? 1
        : (currentTime - resetStart) / Math.max(0.001, line.end - resetStart);
      const textPhaseEnd = 0.8;
      const tailProgress = Math.max(0, (progress - textPhaseEnd) / (1 - textPhaseEnd));
      const acceleratedTail = 0.2 * tailProgress + 0.8 * tailProgress * tailProgress;
      const pct = progress <= textPhaseEnd
        ? (progress / textPhaseEnd) * line.textEnd * 100
        : (line.textEnd + (1 - line.textEnd) * acceleratedTail) * 100;
      line.el.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
    }
  }

  /**
   * Clear all fills and restart karaoke at the line reached by a transport seek.
   * @param {number} currentTime
   */
  function resetAfterSeek(currentTime) {
    lineGroups.flat().forEach(line => {
      line.el.style.clipPath = 'inset(0 100% 0 0)';
    });
    let idx = cues.findIndex(cue => currentTime >= cue.start && currentTime < cue.end);
    if (idx === -1) idx = cues.findIndex(cue => cue.start >= currentTime);
    if (idx === -1) idx = Math.max(0, cues.length - 1);
    const lines = lineGroups[idx] || [];
    let lineIdx = lines.findIndex(line => currentTime < line.end);
    if (lineIdx === -1) lineIdx = Math.max(0, lines.length - 1);
    activeCueIdx = idx;
    activeLineIdx = lineIdx;
    seekOrigin = { cueIdx: idx, lineIdx, time: Math.max(currentTime, lines[lineIdx]?.start || currentTime) };
    cueEls.forEach((el, i) => el.classList.toggle('active', i === idx));
    if (cueEls[idx]) positionLineAtTop(idx, lineIdx);
  }

  function destroy() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    window.removeEventListener('resize', onResize);
  }

  return { render, resetAfterSeek, destroy };
}
