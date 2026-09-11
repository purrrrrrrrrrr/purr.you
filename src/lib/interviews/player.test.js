import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayer } from './player.js';

class FakeAudio extends EventTarget {
  static lastInstance = null;

  constructor() {
    super();
    FakeAudio.lastInstance = this;
    this.currentTime = 0;
    this.duration = Number.NaN;
    this.readyState = 0;
    this.volume = 1;
    this.src = '';
  }

  load() {}
  pause() {}
  play() { return Promise.resolve(); }
}

describe('player seeking', () => {
  beforeEach(() => {
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('HTMLMediaElement', { HAVE_METADATA: 1, HAVE_FUTURE_DATA: 3 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies a chapter start seek when metadata becomes available', () => {
    createPlayer().load({ audio_url: '/chapter.mp3' }, 15);
    const audio = FakeAudio.lastInstance;

    expect(audio.currentTime).toBe(0);
    audio.duration = 60;
    audio.readyState = 1;
    audio.dispatchEvent(new Event('loadedmetadata'));

    expect(audio.currentTime).toBe(15);
  });

  it('applies an exact seek immediately when metadata is ready', () => {
    const player = createPlayer();
    const audio = FakeAudio.lastInstance;
    audio.duration = 60;
    audio.readyState = 1;

    player.seek(22.5);

    expect(audio.currentTime).toBe(22.5);
  });
});
