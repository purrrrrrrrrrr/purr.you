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
import { seekAcrossChapters, prevChapter, nextChapter, isLastChapter } from './transport.js';
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
  let subtitleLanguage = '';
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

  /** @param {any} chapter */
  function getSubtitleUrl(chapter) {
    if (typeof chapter.subs_url === 'string') return chapter.subs_url;
    if (chapter.subs_url?.[subtitleLanguage]) return chapter.subs_url[subtitleLanguage];
    for (const language of currentDatabun.languages || []) {
      if (chapter.subs_url?.[language]) return chapter.subs_url[language];
    }
    const fallback = Object.values(chapter.subs_url || {})[0];
    if (typeof fallback === 'string') return fallback;
    throw new Error(`No subtitles configured for chapter ${chapter.id}`);
  }

  /**
   * @param {any} chapter
   * @param {string} [language]
   */
  function getChapterTitle(chapter, language = subtitleLanguage) {
    if (typeof chapter.title === 'string') return chapter.title;
    if (chapter.title?.[language]) return chapter.title[language];
    for (const language of currentDatabun.languages || []) {
      if (chapter.title?.[language]) return chapter.title[language];
    }
    const fallback = Object.values(chapter.title || {})[0];
    return typeof fallback === 'string' ? fallback : '';
  }

  /**
   * @param {any} chapter
   * @param {string} [language]
   */
  function renderChapterTitle(chapter, language = subtitleLanguage) {
    const ctEl = document.getElementById('chapter-title');
    if (ctEl) ctEl.textContent = getChapterTitle(chapter, language) || chapterCues[0]?.text || '';
  }

  /**
   * @param {any} chapter
   * @param {number} loadId
   */
  async function fetchChapterCues(chapter, loadId) {
    const subtitleUrl = getSubtitleUrl(chapter);
    const response = await fetch(subtitleUrl);
    if (!response.ok) throw new Error(`Failed to load subtitles ${subtitleUrl}: ${response.status}`);
    const cues = parseVTT(await response.text());
    if (loadId !== chapterLoadId || destroyed) return null;
    return cues;
  }

  function bindSubtitleLanguageSwitcher() {
    const inputs = /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="subtitle-language"]'));
    inputs.forEach((input, index) => {
      input.checked = input.value === subtitleLanguage;
      input.onkeydown = (event) => {
        const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
          : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1
          : 0;
        if (!direction) return;
        event.preventDefault();
        event.stopPropagation();
        const nextIndex = (index + direction + inputs.length) % inputs.length;
        const nextInput = inputs[nextIndex];
        nextInput.focus();
        nextInput.click();
      };
      input.onchange = async () => {
        if (!input.checked || input.value === subtitleLanguage) return;
        subtitleLanguage = input.value;
        const loadId = ++chapterLoadId;
        const chapter = currentDatabun.chapters[chapterIndex];
        renderChapterTitle(chapter, input.value);
        const cues = await fetchChapterCues(chapter, loadId);
        if (!cues) return;
        await document.fonts?.ready;
        if (loadId !== chapterLoadId || destroyed) return;
        chapterCues = cues;
        renderChapterTitle(chapter, input.value);
        karaoke?.destroy();
        karaoke = createKaraoke(/** @type {HTMLElement} */ (document.getElementById('subs-track')), () => player.currentTime);
        karaoke.render(chapterCues);
      };
    });
  }

  /** @param {number} t */
  function updateTotalTime(t) {
    const totalEl = document.getElementById('total-time');
    if (!totalEl || !currentDatabun) return;
    const chapters = currentDatabun.chapters;
    let elapsedTotal = t;
    for (let i = 0; i < chapterIndex; i++) elapsedTotal += chapters[i]._audio_duration_s || 0;
    const grandTotal = chapters.reduce((/** @type {number} */ s, /** @type {any} */ c) => s + (c._audio_duration_s || 0), 0);
    totalEl.textContent = `${Math.floor(elapsedTotal)} (${Math.floor(grandTotal)}) seconds`;
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
    const cues = await fetchChapterCues(chapter, loadId);
    if (!cues) return;
    chapterCues = cues;
    const isFirstLoad = firstChapterLoad;
    if (isFirstLoad) {
      firstChapterLoad = false;
      renderPlaybackViewport(viewportEl, currentDatabun.languages || [subtitleLanguage]);
      bindSubtitleLanguageSwitcher();
    }
    const ctEl = /** @type {HTMLElement} */ (document.getElementById('chapter-title'));
    renderChapterTitle(chapter);
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
    const volumeWheel = /** @type {HTMLElement} */ (document.getElementById('t-volume'));
    let dragStartY = 0;
    let dragStartVolume = player.volume;
    let draggingVolume = false;
    /** @param {number} value */
    const setVolume = (value) => {
      player.volume = Math.min(1, Math.max(0, value));
      volumeWheel.style.setProperty('--volume-angle', `${-135 + player.volume * 270}deg`);
      volumeWheel.setAttribute('aria-valuenow', String(Math.round(player.volume * 100)));
    };
    setVolume(player.volume);
    volumeWheel.onpointerdown = (event) => {
      draggingVolume = true;
      dragStartY = event.clientY;
      dragStartVolume = player.volume;
      volumeWheel.setPointerCapture(event.pointerId);
      volumeWheel.classList.add('dragging');
    };
    volumeWheel.onpointermove = (event) => {
      if (!draggingVolume) return;
      setVolume(dragStartVolume + (dragStartY - event.clientY) / 120);
    };
    const endVolumeDrag = () => {
      draggingVolume = false;
      volumeWheel.classList.remove('dragging');
    };
    volumeWheel.onpointerup = endVolumeDrag;
    volumeWheel.onpointercancel = endVolumeDrag;
    volumeWheel.onkeydown = (event) => {
      if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
        event.preventDefault();
        setVolume(player.volume + 0.05);
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
        event.preventDefault();
        setVolume(player.volume - 0.05);
      } else if (event.key === 'Home') {
        event.preventDefault();
        setVolume(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        setVolume(1);
      }
    };
    /** @param {number} delta */
    const seekPlaybackBy = async (delta) => {
      const chapterDurations = currentDatabun.chapters.map(
        (/** @type {any} */ chapter, index) => index === chapterIndex
          ? player.duration || chapter._audio_duration_s || 0
          : chapter._audio_duration_s || 0
      );
      const target = seekAcrossChapters({
        chapterIndex,
        currentTime: player.currentTime,
        chapterDurations
      }, delta);
      if (target.chapterIndex === chapterIndex) {
        player.seek(target.currentTime);
        karaoke?.resetAfterSeek(target.currentTime);
        waveform?.reset();
      } else {
        await loadChapter(target.chapterIndex, target.currentTime);
        karaoke?.resetAfterSeek(target.currentTime);
      }
    };
    /** @type {HTMLElement} */ (document.getElementById('t-back15')).onclick = () => {
      void seekPlaybackBy(-15);
    };
    /** @type {HTMLElement} */ (document.getElementById('t-fwd15')).onclick = () => {
      void seekPlaybackBy(15);
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
    document.getElementById('console')?.classList.add('playback-loaded');
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
    subtitleLanguage = currentDatabun.languages?.[0] || 'en';

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
