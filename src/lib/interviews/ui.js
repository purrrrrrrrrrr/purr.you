import { escapeHtml } from './html.js';
import { isMac } from './platform.js';

const jumpKeyLabel = isMac ? '⌘' : 'Ctrl+';

/**
 * @param {HTMLElement} slotEl
 * @param {string} interviewee_name
 */
export function renderDatabunInSlot(slotEl, interviewee_name) {
  slotEl.classList.add('occupied');
  /** @type {HTMLElement} */ (slotEl.querySelector('.slot-label')).textContent = interviewee_name;
}

/**
 * @param {HTMLElement} viewportEl
 * @param {string[]} languages
 */
export function renderPlaybackViewport(viewportEl, languages) {
  const chapterTitleEl = document.createElement('div');
  chapterTitleEl.className = 'chapter-title';
  chapterTitleEl.id = 'chapter-title';
  const languageEl = document.createElement('fieldset');
  languageEl.className = 'subtitle-languages';
  languageEl.setAttribute('aria-label', 'Subtitle language');
  languageEl.innerHTML = languages.map((language, index) => `
    <input type="radio" name="subtitle-language" id="subtitle-language-${escapeHtml(language)}" value="${escapeHtml(language)}" ${index === 0 ? 'checked' : ''}>
    <label for="subtitle-language-${escapeHtml(language)}">${escapeHtml(language.toUpperCase())}</label>
  `).join('');
  const languageSlotEl = document.getElementById('subtitle-language-slot');
  languageSlotEl?.replaceChildren(languageEl);
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
 * @param {{ chapters: { title: string | Record<string, string> }[] }} databun
 */
export function renderTransport(rightEl, databun) {
  rightEl.innerHTML = `
    <div class="playback-panel" id="playback-panel" tabindex="-1" aria-label="Playback controls">
      <div class="playback-main">
        <div class="timeline" id="timeline">
          <div class="timeline-bar" id="timeline-bar">
            <canvas class="timeline-waveform" id="timeline-waveform"></canvas>
            <div class="timeline-flat"></div>
            <div class="timeline-playhead"></div>
          </div>
          <div class="timeline-times">
            <span id="total-time">0 (0) seconds</span>
          </div>
        </div>
        <div class="control-buttons">
          <div class="transport">
            <div class="hw-btn-wrap"><button class="hw-btn" id="t-back15" type="button"><span class="hw-btn-label">-15 SEC</span><span class="hw-btn-face"></span></button><span class="hw-btn-shortcut">←</span></div>
            <div class="hw-btn-wrap"><button class="hw-btn" id="t-prev"   type="button"><span class="hw-btn-label">PREV</span><span class="hw-btn-face"></span></button><span class="hw-btn-shortcut">${jumpKeyLabel}←</span></div>
            <div class="hw-btn-wrap"><button class="hw-btn play-btn" id="t-play" type="button"><span class="hw-btn-label">PLAY / PAUSE</span><span class="hw-btn-face"></span></button><span class="hw-btn-shortcut">␣</span></div>
            <div class="hw-btn-wrap"><button class="hw-btn" id="t-next"   type="button"><span class="hw-btn-label">NEXT</span><span class="hw-btn-face"></span></button><span class="hw-btn-shortcut">${jumpKeyLabel}→</span></div>
            <div class="hw-btn-wrap"><button class="hw-btn" id="t-fwd15"  type="button"><span class="hw-btn-label">+15 SEC</span><span class="hw-btn-face"></span></button><span class="hw-btn-shortcut">→</span></div>
          </div>
        </div>
      </div>
    </div>
    <div id="t-volume" class="volume-wheel" role="slider" tabindex="0"
      aria-label="Volume" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100">
      <span class="volume-wheel-indicator" aria-hidden="true"></span>
      <span class="volume-label">VOL</span>
    </div>
  `;
}
