import { escapeHtml } from './html.js';

/**
 * @param {HTMLElement} slotEl
 * @param {string} interviewee_name
 */
export function renderDatabunInSlot(slotEl, interviewee_name) {
  slotEl.classList.add('occupied');
  /** @type {HTMLElement} */ (slotEl.querySelector('.slot-label')).textContent = interviewee_name;
}

/** @param {HTMLElement} viewportEl */
export function renderPlaybackViewport(viewportEl) {
  const chapterTitleEl = document.createElement('div');
  chapterTitleEl.className = 'chapter-title';
  chapterTitleEl.id = 'chapter-title';
  const subsEl = document.createElement('div');
  subsEl.className = 'subs';
  subsEl.id = 'subs';
  const subsTrackEl = document.createElement('div');
  subsTrackEl.className = 'subs-track';
  subsTrackEl.id = 'subs-track';
  subsEl.append(subsTrackEl);
  viewportEl.append(chapterTitleEl, subsEl);
}

/**
 * @param {HTMLElement} rightEl
 * @param {{ chapters: { title: string }[] }} databun
 */
export function renderTransport(rightEl, databun) {
  rightEl.innerHTML = `
    <div class="timeline" id="timeline">
      <div class="timeline-label" id="chapter-label">${escapeHtml(databun.chapters[0].title)}</div>
      <div class="timeline-bar" id="timeline-bar">
        <canvas class="timeline-waveform" id="timeline-waveform"></canvas>
        <div class="timeline-flat"></div>
        <div class="timeline-playhead"></div>
      </div>
      <div class="timeline-times">
        <span id="total-time">0 (0)</span>
      </div>
    </div>
    <div class="control-buttons">
      <div class="transport">
        <button class="hw-btn" id="t-back15" type="button"><span class="hw-btn-label">-15 SEC</span><span class="hw-btn-face"></span></button>
        <button class="hw-btn" id="t-prev"   type="button"><span class="hw-btn-label">PREV</span><span class="hw-btn-face"></span></button>
        <button class="hw-btn play-btn" id="t-play" type="button"><span class="hw-btn-label">PLAY / PAUSE</span><span class="hw-btn-face"></span></button>
        <button class="hw-btn" id="t-next"   type="button"><span class="hw-btn-label">NEXT</span><span class="hw-btn-face"></span></button>
        <button class="hw-btn" id="t-fwd15"  type="button"><span class="hw-btn-label">+15 SEC</span><span class="hw-btn-face"></span></button>
      </div>
    </div>
  `;
}
