import { createTip } from './tip.js';
import { createMachine } from './state.js';
import { createCursor } from './cursor.js';
import { createPlacementHand } from './drag.js';
import { renderDatabunInSlot, renderPlaybackViewport, renderTransport } from './ui.js';
import { createWaveform } from './waveform.js';
import { loadDatabun } from './databun.js';
import { createPlayer } from './player.js';
import { createKaraoke } from './karaoke.js';
import { parseVTT } from './vtt.js';
import { seekBy, prevChapter, nextChapter, isLastChapter } from './transport.js';
import { bindKeyboard } from './keyboard.js';
import { saveProgress, loadProgress } from './persistence.js';
import { createDebugPlacement } from './debug-placement.js';

const MOBILE_MAX = 899;
const isDesktop = () => window.innerWidth > MOBILE_MAX;

export function createInterviewsApp() {
  const machine = createMachine();
  const tip = createTip(/** @type {HTMLElement} */ (document.getElementById('tip')));
  const app = /** @type {HTMLElement} */ (document.getElementById('app'));
  const cursor = createCursor(app);
  const viewportEl = /** @type {HTMLElement} */ (document.getElementById('viewport'));
  const slotEl = /** @type {HTMLElement} */ (document.getElementById('slot'));
  const debugPlacement = createDebugPlacement(app);
  const player = createPlayer();

  let lastSaveAt = 0;
  /** @type {any} */
  let currentDatabun = null;
  /** @type {ReturnType<typeof createKaraoke> | null} */
  let karaoke = null;
  let chapterIndex = 0;
  /** @type {ReturnType<typeof parseVTT>} */
  let chapterCues = [];
  let chapterContentReady = false;
  let firstChapterLoad = true;
  let chapterLoadId = 0;
  let destroyed = false;
  /** @type {ReturnType<typeof setTimeout>[]} */
  const revealTimers = [];
  /** @type {ReturnType<typeof createPlacementHand> | null} */
  let placementHand = null;
  /** @type {(() => void) | null} */
  let unbindKeyboard = null;
  /** @type {ReturnType<typeof createWaveform> | null} */
  let waveform = null;

  /** @param {number} t */
  function updateTotalTime(t) {
    const totalEl = document.getElementById('total-time');
    if (!totalEl || !currentDatabun) return;
    const chapters = currentDatabun.chapters;
    let elapsedTotal = t;
    for (let i = 0; i < chapterIndex; i++) elapsedTotal += chapters[i]._audio_duration_s || 0;
    const grandTotal = chapters.reduce((/** @type {number} */ s, /** @type {any} */ c) => s + (c._audio_duration_s || 0), 0);
    totalEl.textContent = `${Math.floor(elapsedTotal)} (${Math.floor(grandTotal)})`;
  }

  function maybeSave() {
    const now = performance.now();
    if (now - lastSaveAt < 1000) return;
    lastSaveAt = now;
    saveProgress(currentDatabun.id, {
      chapterIndex,
      currentTime: player.currentTime
    });
  }

  cursor.attach();

  const unsubscribe = machine.subscribe(state => {
    if (state === 'tipShown') { tip.show('insert'); cursor.setPose('holding'); cursor.unfreeze(); }
    if (state === 'placing')  { tip.setKey('click'); cursor.setPose('placing'); cursor.freeze(); }
    if (state === 'placed')   {
      tip.setKey('load');
      cursor.setPose('pointing');
      cursor.unfreeze();
      renderDatabunInSlot(slotEl, currentDatabun.interviewee_name);
      /** @type {HTMLElement} */ (document.getElementById('load-btn')).classList.add('pulsing');
      placementHand?.destroy();
      placementHand = null;
    }
    if (state === 'loading') {
      /** @type {HTMLElement} */ (document.getElementById('load-btn')).classList.remove('pulsing');
      tip.hide();
    }
    if (state === 'playing') player.play();
  });

  /** @param {PointerEvent} e */
  function onPointerMove(e) {
    if (!isDesktop()) return;
    if (machine.state === 'tipShown' && debugPlacement.contains(e)) {
      machine.send('HOVER_SLOT');
    } else if (machine.state === 'placing' && !debugPlacement.contains(e)) {
      machine.send('LEAVE_SLOT');
    }
  }
  window.addEventListener('pointermove', onPointerMove);

  function onDocumentClick() {
    if (machine.state === 'placing') machine.send('PLACE');
    else if (!isDesktop() && machine.state === 'tipShown') machine.send('PLACE');
  }
  document.addEventListener('click', onDocumentClick);

  /**
   * @param {number} idx
   * @param {number} [startAt]
   */
  async function loadChapter(idx, startAt = 0) {
    const loadId = ++chapterLoadId;
    chapterContentReady = false;
    chapterIndex = idx;
    const chapter = currentDatabun.chapters[idx];
    player.load(chapter);
    const response = await fetch(chapter.subs_url);
    if (!response.ok) throw new Error(`Failed to load subtitles ${chapter.subs_url}: ${response.status}`);
    const vttText = await response.text();
    if (loadId !== chapterLoadId || destroyed) return;
    chapterCues = parseVTT(vttText);
    const isFirstLoad = firstChapterLoad;
    if (isFirstLoad) {
      firstChapterLoad = false;
      renderPlaybackViewport(viewportEl);
    }
    const ctEl = /** @type {HTMLElement} */ (document.getElementById('chapter-title'));
    ctEl.textContent = chapter.title || chapterCues[0]?.text || '';
    if (isFirstLoad) {
      await tip.ready();
      if (loadId !== chapterLoadId || destroyed) return;
      tip.showText(currentDatabun.interviewee_name, () => {
        if (destroyed) return;
        requestAnimationFrame(() => {
          if (destroyed) return;
          let subtitlesRevealed = false;
          const revealSubtitles = () => {
            if (subtitlesRevealed || destroyed) return;
            subtitlesRevealed = true;
            const subsEl = /** @type {HTMLElement} */ (document.getElementById('subs'));
            subsEl.classList.add('visible');
            /** @type {HTMLElement} */ (document.querySelector('.tip-wrapper')).classList.add('line-shown');
            let consoleRevealed = false;
            const revealConsole = () => {
              if (consoleRevealed || destroyed) return;
              consoleRevealed = true;
              /** @type {HTMLElement} */ (document.getElementById('console-right')).classList.add('active');
            };
            subsEl.addEventListener('transitionend', revealConsole, { once: true });
            revealTimers.push(setTimeout(revealConsole, 500));
          };
          ctEl.addEventListener('transitionend', revealSubtitles, { once: true });
          ctEl.classList.add('shown');
          revealTimers.push(setTimeout(revealSubtitles, 1100));
        });
      });
    }
    await document.fonts?.ready;
    if (loadId !== chapterLoadId || destroyed) return;
    if (karaoke) karaoke.destroy();
    karaoke = createKaraoke(/** @type {HTMLElement} */ (document.getElementById('subs-track')), () => player.currentTime);
    karaoke.render(chapterCues);
    player.seek(startAt);
    chapterContentReady = true;
    if (machine.state === 'loading' && player.ready) machine.send('READY');
    waveform?.reset();
    updateTotalTime(startAt);
    if (machine.state === 'playing') {
      player.play();
      waveform?.start();
    }
  }

  function bindTransport() {
    /** @type {HTMLElement} */ (document.getElementById('t-back15')).onclick = () => {
      player.seek(seekBy({ currentTime: player.currentTime, chapterDuration: player.duration }, -15));
      waveform?.reset();
    };
    /** @type {HTMLElement} */ (document.getElementById('t-fwd15')).onclick = () => {
      player.seek(seekBy({ currentTime: player.currentTime, chapterDuration: player.duration }, 15));
      waveform?.reset();
    };
    /** @type {HTMLElement} */ (document.getElementById('t-play')).onclick = () => {
      if (machine.state === 'playing') { player.pause(); machine.send('TOGGLE_PLAY'); waveform?.pause(); }
      else if (machine.state === 'paused') { player.play(); machine.send('TOGGLE_PLAY'); waveform?.start(); }
    };
    /** @type {HTMLElement} */ (document.getElementById('t-prev')).onclick = async () => {
      const next = prevChapter(chapterIndex, currentDatabun.chapters.length);
      if (next !== chapterIndex) { await loadChapter(next); }
    };
    /** @type {HTMLElement} */ (document.getElementById('t-next')).onclick = async () => {
      const next = nextChapter(chapterIndex, currentDatabun.chapters.length);
      if (next !== chapterIndex) { await loadChapter(next); }
    };
  }

  function bindPlayback() {
    player.onTime((t) => {
      maybeSave();
      updateTotalTime(t);
    });
    player.onEnded(async () => {
      if (isLastChapter(chapterIndex, currentDatabun.chapters.length)) {
        machine.send('ENDED');
        waveform?.pause();
      } else {
        await loadChapter(chapterIndex + 1);
      }
    });
    player.onReady(() => {
      if (machine.state === 'loading' && chapterContentReady) machine.send('READY');
    });
  }

  async function onLoadClick() {
    if (machine.state !== 'placed') return;
    machine.send('LOAD_PRESSED');
    const consoleRight = /** @type {HTMLElement} */ (document.getElementById('console-right'));
    renderTransport(consoleRight, currentDatabun);
    bindTransport();
    const waveformCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('timeline-waveform'));
    waveform = createWaveform(player.getElement(), waveformCanvas);
    const saved = loadProgress(currentDatabun.id);
    bindPlayback();
    await loadChapter(saved?.chapterIndex ?? 0, saved?.currentTime ?? 0);
    unbindKeyboard = bindKeyboard(machine, {
      toggle: () => /** @type {HTMLElement} */ (document.getElementById('t-play')).click(),
      back15: () => /** @type {HTMLElement} */ (document.getElementById('t-back15')).click(),
      fwd15:  () => /** @type {HTMLElement} */ (document.getElementById('t-fwd15')).click(),
      prev:   () => /** @type {HTMLElement} */ (document.getElementById('t-prev')).click(),
      next:   () => /** @type {HTMLElement} */ (document.getElementById('t-next')).click()
    });
  }
  /** @type {HTMLElement} */ (document.getElementById('load-btn')).addEventListener('click', onLoadClick);

  /** @type {ReturnType<typeof setTimeout> | null} */
  let tipReadyTimer = null;
  (async () => {
    currentDatabun = await loadDatabun('luna');

    if (!isDesktop()) {
      placementHand = createPlacementHand(app);
    }

    tipReadyTimer = setTimeout(() => machine.send('TIP_READY'), 1000);
  })();

  return {
    destroy() {
      destroyed = true;
      chapterLoadId++;
      if (tipReadyTimer) clearTimeout(tipReadyTimer);
      revealTimers.forEach(clearTimeout);
      unsubscribe();
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('click', onDocumentClick);
      document.getElementById('load-btn')?.removeEventListener('click', onLoadClick);
      unbindKeyboard?.();
      cursor.detach();
      debugPlacement.destroy();
      placementHand?.destroy();
      karaoke?.destroy();
      waveform?.destroy();
      player.destroy();
    }
  };
}
