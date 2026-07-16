import { createTip } from './tip.js';
import { createMachine } from './state.js';
import { createCursor } from './cursor.js';
import { createDrag } from './drag.js';
import { renderDatabunInSlot, renderPlaybackViewport, renderTransport, fmtTime } from './ui.js';
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
  let firstChapterLoad = true;
  /** @type {ReturnType<typeof createDrag> | null} */
  let drag = null;
  /** @type {(() => void) | null} */
  let unbindKeyboard = null;

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
    }
    if (state === 'loading') {
      /** @type {HTMLElement} */ (document.getElementById('load-btn')).classList.remove('pulsing');
      cursor.detach();
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
  }
  document.addEventListener('click', onDocumentClick);

  /**
   * @param {number} idx
   * @param {number} [startAt]
   */
  async function loadChapter(idx, startAt = 0) {
    chapterIndex = idx;
    const chapter = currentDatabun.chapters[idx];
    player.load(chapter);
    const vttText = await fetch(chapter.subs_url).then(r => r.text());
    chapterCues = parseVTT(vttText);
    /** @type {HTMLElement} */ (document.getElementById('chapter-label')).textContent = chapter.title;
    if (firstChapterLoad) {
      firstChapterLoad = false;
      renderPlaybackViewport(viewportEl);
      const ctEl = /** @type {HTMLElement} */ (document.getElementById('chapter-title'));
      ctEl.textContent = chapter.title;
      await tip.ready();
      tip.showText(currentDatabun.interviewee_name, () => {
        requestAnimationFrame(() => {
          ctEl.classList.add('shown');
          ctEl.addEventListener('transitionend', () => {
            const subsEl = /** @type {HTMLElement} */ (document.getElementById('subs'));
            subsEl.classList.add('visible');
            /** @type {HTMLElement} */ (document.querySelector('.tip-wrapper')).classList.add('line-shown');
            subsEl.addEventListener('transitionend', () => {
              /** @type {HTMLElement} */ (document.getElementById('console-right')).classList.add('active');
            }, { once: true });
          }, { once: true });
        });
      });
    }
    if (karaoke) karaoke.destroy();
    karaoke = createKaraoke(/** @type {HTMLElement} */ (document.getElementById('subs-track')), () => player.currentTime);
    karaoke.render(chapterCues);
    player.seek(startAt);
  }

  function bindTransport() {
    /** @type {HTMLElement} */ (document.getElementById('t-back15')).onclick = () => {
      player.seek(seekBy({ currentTime: player.currentTime, chapterDuration: player.duration }, -15));
    };
    /** @type {HTMLElement} */ (document.getElementById('t-fwd15')).onclick = () => {
      player.seek(seekBy({ currentTime: player.currentTime, chapterDuration: player.duration }, 15));
    };
    /** @type {HTMLElement} */ (document.getElementById('t-play')).onclick = () => {
      if (machine.state === 'playing') { player.pause(); machine.send('TOGGLE_PLAY'); }
      else if (machine.state === 'paused') { player.play(); machine.send('TOGGLE_PLAY'); }
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
      const elapsed = document.getElementById('elapsed');
      const remaining = document.getElementById('remaining');
      if (elapsed) elapsed.textContent = fmtTime(t);
      if (remaining) remaining.textContent = `-${fmtTime(player.duration - t)}`;
      const tc = document.getElementById('timeline-cursor');
      if (tc && player.duration > 0) tc.style.left = `${(t / player.duration) * 100}%`;
    });
    player.onEnded(async () => {
      if (isLastChapter(chapterIndex, currentDatabun.chapters.length)) {
        machine.send('ENDED');
      } else {
        await loadChapter(chapterIndex + 1);
      }
    });
    player.onReady(() => {
      if (machine.state === 'loading') machine.send('READY');
    });
  }

  async function onLoadClick() {
    if (machine.state !== 'placed') return;
    machine.send('LOAD_PRESSED');
    const consoleRight = /** @type {HTMLElement} */ (document.getElementById('console-right'));
    renderTransport(consoleRight, currentDatabun);
    bindTransport();
    const saved = loadProgress(currentDatabun.id);
    await loadChapter(saved?.chapterIndex ?? 0, saved?.currentTime ?? 0);
    bindPlayback();
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
    currentDatabun = await loadDatabun('frank-luna');

    if (!isDesktop()) {
      drag = createDrag(app, slotEl, () => machine.send('PLACE'), (e) => debugPlacement.contains(e));
    }

    tipReadyTimer = setTimeout(() => machine.send('TIP_READY'), 1000);
  })();

  return {
    destroy() {
      if (tipReadyTimer) clearTimeout(tipReadyTimer);
      unsubscribe();
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('click', onDocumentClick);
      document.getElementById('load-btn')?.removeEventListener('click', onLoadClick);
      unbindKeyboard?.();
      cursor.detach();
      debugPlacement.destroy();
      drag?.destroy();
      karaoke?.destroy();
      player.destroy();
    }
  };
}
