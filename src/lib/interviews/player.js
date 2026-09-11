export function createPlayer() {
  const audio = new Audio();
  audio.preload = 'auto';

  /** @type {{ time: ((t: number) => void)[], ended: (() => void)[], ready: (() => void)[] }} */
  const cbs = { time: [], ended: [], ready: [] };
	/** @type {number | null} */
	let pendingSeek = null;

	function applyPendingSeek() {
		if (pendingSeek === null || audio.readyState < HTMLMediaElement.HAVE_METADATA) return;
		const target = Math.min(Math.max(0, pendingSeek), Number.isFinite(audio.duration) ? audio.duration : pendingSeek);
		pendingSeek = null;
		audio.currentTime = target;
	}

  audio.addEventListener('timeupdate', () => cbs.time.forEach(fn => fn(audio.currentTime)));
  audio.addEventListener('seeked', () => cbs.time.forEach(fn => fn(audio.currentTime)));
	audio.addEventListener('loadedmetadata', applyPendingSeek);
  audio.addEventListener('ended', () => cbs.ended.forEach(fn => fn()));
  audio.addEventListener('canplaythrough', () => cbs.ready.forEach(fn => fn()));

  return {
    /**
	 * @param {{ audio_url: string }} chapter
	 * @param {number} [startAt]
	 */
    load(chapter, startAt = 0) {
	  pendingSeek = Number.isFinite(startAt) ? Math.max(0, startAt) : 0;
      audio.src = chapter.audio_url;
      audio.load();
    },
    play() { return audio.play(); },
    pause() { audio.pause(); },
    /** @param {number} t */
    seek(t) {
      if (!Number.isFinite(t)) return audio.currentTime;
	  const target = Math.max(0, t);
	  pendingSeek = target;
	  applyPendingSeek();
      // Browsers may defer `timeupdate` until playback resumes. Update consumers
      // immediately as well so paused seeks are reflected in the interface.
      cbs.time.forEach(fn => fn(target));
      return target;
    },
    get volume() { return audio.volume; },
    /** @param {number} value */
    set volume(value) { audio.volume = Math.min(1, Math.max(0, value)); },
    get ready() { return audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA; },
    get currentTime() { return audio.currentTime; },
    get duration() { return isFinite(audio.duration) ? audio.duration : 0; },
    /** @param {(t: number) => void} fn */
    onTime(fn) { cbs.time.push(fn); },
    /** @param {() => void} fn */
    onEnded(fn) { cbs.ended.push(fn); },
    /** @param {() => void} fn */
    onReady(fn) { cbs.ready.push(fn); },
    /** @returns {HTMLAudioElement} */
    getElement() { return audio; },
    destroy() { audio.pause(); }
  };
}
