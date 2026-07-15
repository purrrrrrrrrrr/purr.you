import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveProgress, loadProgress, clearProgress } from './persistence.js';

const mockLocalStorage = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value.toString(); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
  configurable: true
});

beforeEach(() => {
  localStorage.clear();
});

describe('persistence', () => {
  it('returns null when nothing saved', () => {
    expect(loadProgress('frank-luna')).toBeNull();
  });

  it('round-trips chapterIndex + currentTime', () => {
    saveProgress('frank-luna', { chapterIndex: 2, currentTime: 123.45 });
    expect(loadProgress('frank-luna')).toEqual({
      chapterIndex: 2,
      currentTime: 123.45
    });
  });

  it('scopes per databun id', () => {
    saveProgress('a', { chapterIndex: 0, currentTime: 1 });
    saveProgress('b', { chapterIndex: 1, currentTime: 2 });
    expect(loadProgress('a')).toEqual({ chapterIndex: 0, currentTime: 1 });
    expect(loadProgress('b')).toEqual({ chapterIndex: 1, currentTime: 2 });
  });

  it('clearProgress removes saved state', () => {
    saveProgress('frank-luna', { chapterIndex: 0, currentTime: 5 });
    clearProgress('frank-luna');
    expect(loadProgress('frank-luna')).toBeNull();
  });

  it('returns null on corrupt data', () => {
    localStorage.setItem('interviews:frank-luna', 'not json');
    expect(loadProgress('frank-luna')).toBeNull();
  });
});
