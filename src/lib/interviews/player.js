// @ts-nocheck
export function createPlayer() {
  const audio = new Audio();
  audio.preload = 'auto';

  const cbs = { time: [], ended: [], ready: [] };

  audio.addEventListener('timeupdate', () => cbs.time.forEach(fn => fn(audio.currentTime)));
  audio.addEventListener('ended', () => cbs.ended.forEach(fn => fn()));
  audio.addEventListener('canplaythrough', () => cbs.ready.forEach(fn => fn()));

  return {
    load(chapter) {
      audio.src = chapter.audio_url;
      audio.load();
    },
    play() { return audio.play(); },
    pause() { audio.pause(); },
    seek(t) { audio.currentTime = t; },
    get currentTime() { return audio.currentTime; },
    get duration() { return isFinite(audio.duration) ? audio.duration : 0; },
    onTime(fn) { cbs.time.push(fn); },
    onEnded(fn) { cbs.ended.push(fn); },
    onReady(fn) { cbs.ready.push(fn); },
    destroy() { audio.pause(); }
  };
}
