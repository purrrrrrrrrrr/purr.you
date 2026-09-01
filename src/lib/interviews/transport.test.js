import { describe, it, expect } from 'vitest';
import { seekBy, seekAcrossChapters, prevChapter, nextChapter, isLastChapter } from './transport.js';

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
  it('does not snap to 0 when chapter duration is unknown', () => {
    expect(seekBy({ currentTime: 5, chapterDuration: 0 }, 15)).toBe(20);
  });
});

describe('seekAcrossChapters', () => {
  const chapterDurations = [10, 20, 30];

  it('carries a forward seek into the next chapter', () => {
    expect(seekAcrossChapters({ chapterIndex: 0, currentTime: 4, chapterDurations }, 15))
      .toEqual({ chapterIndex: 1, currentTime: 9 });
  });

  it('carries a backward seek into the previous chapter', () => {
    expect(seekAcrossChapters({ chapterIndex: 1, currentTime: 4, chapterDurations }, -15))
      .toEqual({ chapterIndex: 0, currentTime: 0 });
  });

  it('crosses multiple short chapters', () => {
    expect(seekAcrossChapters({ chapterIndex: 0, currentTime: 8, chapterDurations }, 30))
      .toEqual({ chapterIndex: 2, currentTime: 8 });
  });

  it('clamps at the beginning and end of the databun', () => {
    expect(seekAcrossChapters({ chapterIndex: 0, currentTime: 2, chapterDurations }, -15))
      .toEqual({ chapterIndex: 0, currentTime: 0 });
    expect(seekAcrossChapters({ chapterIndex: 2, currentTime: 25, chapterDurations }, 15))
      .toEqual({ chapterIndex: 2, currentTime: 30 });
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
