import { describe, it, expect } from 'vitest';
import { insertFrame, removeFrame, onionGhostIndices, ghostAlpha, clampFps, migrateTileFrames } from './animation';

describe('insertFrame', () => {
	it('inserts a frame immediately after the given index', () => {
		const result = insertFrame([['a'], ['b'], ['c']], 1, ['d']);
		expect(result.frames).toEqual([['a'], ['b'], ['d'], ['c']]);
		expect(result.index).toBe(2);
	});

	it('inserts at the end when index is the last frame', () => {
		const result = insertFrame([['a'], ['b']], 1, ['c']);
		expect(result.frames).toEqual([['a'], ['b'], ['c']]);
		expect(result.index).toBe(2);
	});
});

describe('removeFrame', () => {
	it('removes the frame at the given index', () => {
		const result = removeFrame([['a'], ['b'], ['c']], 1);
		expect(result.frames).toEqual([['a'], ['c']]);
		expect(result.index).toBe(1);
	});

	it('clamps the returned index when removing the last frame', () => {
		const result = removeFrame([['a'], ['b'], ['c']], 2);
		expect(result.frames).toEqual([['a'], ['b']]);
		expect(result.index).toBe(1);
	});

	it('is a no-op when only one frame remains', () => {
		const frames = [['a']];
		const result = removeFrame(frames, 0);
		expect(result.frames).toBe(frames);
		expect(result.index).toBe(0);
	});
});

describe('onionGhostIndices', () => {
	it('wraps around circularly at the start of the sequence', () => {
		expect(onionGhostIndices(0, 4, 2)).toEqual([3, 2]);
	});

	it('walks backward without wrapping when not near the start', () => {
		expect(onionGhostIndices(2, 5, 3)).toEqual([1, 0, 4]);
	});
});

describe('ghostAlpha', () => {
	it('is most opaque for the nearest previous frame', () => {
		expect(ghostAlpha(1, 4)).toBeCloseTo(0.35);
	});

	it('fades for frames further back, staying above zero', () => {
		expect(ghostAlpha(4, 4)).toBeCloseTo(0.0875);
	});
});

describe('clampFps', () => {
	it('clamps below the minimum up to 1', () => {
		expect(clampFps(0)).toBe(1);
		expect(clampFps(-5)).toBe(1);
	});

	it('clamps above the maximum down to 60', () => {
		expect(clampFps(999)).toBe(60);
	});

	it('rounds fractional values', () => {
		expect(clampFps(23.6)).toBe(24);
	});
});

describe('migrateTileFrames', () => {
	it('wraps a legacy pixels field into a single-element frames array', () => {
		const raw = { id: 'x', name: 't', w: 2, h: 2, type: 'floor', pixels: ['#fff', '', '', '#000'] };
		const migrated = migrateTileFrames(raw);
		expect(migrated.frames).toEqual([['#fff', '', '', '#000']]);
		expect('pixels' in migrated).toBe(false);
		expect(migrated.id).toBe('x');
	});

	it('passes through tiles that already have frames', () => {
		const raw = { id: 'y', name: 't2', w: 2, h: 2, type: 'floor', frames: [['#111'], ['#222']] };
		const migrated = migrateTileFrames(raw);
		expect(migrated.frames).toBe(raw.frames);
	});
});
