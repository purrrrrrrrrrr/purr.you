// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { seekBy, prevChapter, nextChapter, isLastChapter } from './transport.js';

describe('seekBy', () => {
  it('seeks forward within chapter', () => {
    expect(seekBy({ currentTime: 5, chapterDuration: 60 }, 15)).toBe(20);
  });
  it('clamps forward seek at chapter end', () => {
    expect(seekBy({ currentTime: 50, chapterDuration: 60 }, 15)).toBe(60);
  });
  it('seeks backward within chapter', () => {
    expect(seekBy({ currentTime: 20, chapterDuration: 60 }, -15)).toBe(5);
  });
  it('clamps backward seek at chapter start', () => {
    expect(seekBy({ currentTime: 5, chapterDuration: 60 }, -15)).toBe(0);
  });
});

describe('prevChapter', () => {
  it('returns previous index', () => {
    expect(prevChapter(2, 5)).toBe(1);
  });
  it('clamps at 0', () => {
    expect(prevChapter(0, 5)).toBe(0);
  });
});

describe('nextChapter', () => {
  it('returns next index', () => {
    expect(nextChapter(2, 5)).toBe(3);
  });
  it('clamps at last index', () => {
    expect(nextChapter(4, 5)).toBe(4);
  });
});

describe('isLastChapter', () => {
  it('true when at last', () => {
    expect(isLastChapter(4, 5)).toBe(true);
  });
  it('false otherwise', () => {
    expect(isLastChapter(3, 5)).toBe(false);
  });
});
