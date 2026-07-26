import { describe, it, expect } from 'vitest';
import { nextPosition, prevPosition, chapterAudioUrl } from './sequence.js';

const people = [
  { id: 'a', name: 'A', chapters: [{ audio: '1.mp3' }, { audio: '2.mp3' }, { audio: '3.mp3' }] },
  { id: 'b', name: 'B', chapters: [{ audio: '1.mp3' }, { audio: '2.mp3' }, { audio: '3.mp3' }] },
  { id: 'c', name: 'C', chapters: [{ audio: '1.mp3' }, { audio: '2.mp3' }, { audio: '3.mp3' }] }
];

describe('nextPosition', () => {
  it('advances chapter within the same person', () => {
    expect(nextPosition(people, { personIndex: 0, chapterIndex: 0 }))
      .toEqual({ personIndex: 0, chapterIndex: 1 });
  });

  it('moves to next person chapter 0 after the last chapter', () => {
    expect(nextPosition(people, { personIndex: 0, chapterIndex: 2 }))
      .toEqual({ personIndex: 1, chapterIndex: 0 });
  });

  it('wraps from the last person/chapter back to the first person/chapter', () => {
    expect(nextPosition(people, { personIndex: 2, chapterIndex: 2 }))
      .toEqual({ personIndex: 0, chapterIndex: 0 });
  });
});

describe('prevPosition', () => {
  it('goes back a chapter within the same person', () => {
    expect(prevPosition(people, { personIndex: 1, chapterIndex: 2 }))
      .toEqual({ personIndex: 1, chapterIndex: 1 });
  });

  it('moves to the previous person\'s last chapter from chapter 0', () => {
    expect(prevPosition(people, { personIndex: 1, chapterIndex: 0 }))
      .toEqual({ personIndex: 0, chapterIndex: 2 });
  });

  it('wraps from the first person/chapter to the last person/chapter', () => {
    expect(prevPosition(people, { personIndex: 0, chapterIndex: 0 }))
      .toEqual({ personIndex: 2, chapterIndex: 2 });
  });
});

describe('chapterAudioUrl', () => {
  it('builds the static path for a chapter', () => {
    expect(chapterAudioUrl('abc-123', { audio: '2.mp3' }))
      .toBe('/team-humanity/abc-123/2.mp3');
  });
});
