import { escapeHtml } from './html.js';

export function renderDatabunInSlot(slotEl, interviewee_name) {
  slotEl.classList.add('occupied');
  slotEl.querySelector('.slot-label').textContent = interviewee_name;
}

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

export function renderTransport(rightEl, databun) {
  rightEl.innerHTML = `
    <div class="timeline" id="timeline">
      <div class="timeline-label" id="chapter-label">${escapeHtml(databun.chapters[0].title)}</div>
      <div class="timeline-bar">
        ${databun.chapters.map((_, i) => `<span class="timeline-marker" data-idx="${i}"></span>`).join('')}
        <span class="timeline-cursor" id="timeline-cursor"></span>
      </div>
      <div class="timeline-times">
        <span id="elapsed">00:00</span>
        <span id="remaining">-00:00</span>
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

export function fmtTime(seconds) {
  if (!isFinite(seconds)) return '00:00';
  const total = Math.max(0, Math.floor(seconds));
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}
