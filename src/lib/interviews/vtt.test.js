import { describe, it, expect } from 'vitest';
import { parseVTT } from './vtt.js';

describe('parseVTT', () => {
  it('parses a single cue', () => {
    const input = `WEBVTT

00:00:00.000 --> 00:00:03.000
Hello world`;
    expect(parseVTT(input)).toEqual([
      { start: 0, end: 3, text: 'Hello world' }
    ]);
  });

  it('parses multiple cues with multiline text', () => {
    const input = `WEBVTT

00:00:00.000 --> 00:00:03.000
First line
second line

00:00:03.500 --> 00:00:07.250
Second cue`;
    expect(parseVTT(input)).toEqual([
      { start: 0, end: 3, text: 'First line\nsecond line' },
      { start: 3.5, end: 7.25, text: 'Second cue' }
    ]);
  });

  it('handles hours in timestamp', () => {
    const input = `WEBVTT

01:02:03.456 --> 01:02:04.000
Late cue`;
    expect(parseVTT(input)).toEqual([
      { start: 3723.456, end: 3724, text: 'Late cue' }
    ]);
  });

  it('ignores cue identifiers (numeric or named)', () => {
    const input = `WEBVTT

1
00:00:00.000 --> 00:00:01.000
First

named-cue
00:00:01.000 --> 00:00:02.000
Second`;
    expect(parseVTT(input)).toEqual([
      { start: 0, end: 1, text: 'First' },
      { start: 1, end: 2, text: 'Second' }
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(parseVTT('WEBVTT\n\n')).toEqual([]);
  });
});
