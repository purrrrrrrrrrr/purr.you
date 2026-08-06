export function insertFrame(frames: string[][], index: number, frame: string[]): { frames: string[][]; index: number } {
	const next = [...frames.slice(0, index + 1), frame, ...frames.slice(index + 1)];
	return { frames: next, index: index + 1 };
}

export function removeFrame(frames: string[][], index: number): { frames: string[][]; index: number } {
	if (frames.length <= 1) return { frames, index };
	const next = frames.filter((_, i) => i !== index);
	return { frames: next, index: Math.min(index, next.length - 1) };
}

// Circular: frame 0's "previous" frames wrap around to the end of the sequence.
export function onionGhostIndices(frameIndex: number, totalFrames: number, depth: number): number[] {
	const indices: number[] = [];
	for (let rank = 1; rank <= depth; rank++) {
		indices.push(((frameIndex - rank) % totalFrames + totalFrames) % totalFrames);
	}
	return indices;
}

// rank 1 = nearest previous frame (most opaque, alpha 0.35), rank === depth = furthest (faintest, still > 0).
export function ghostAlpha(rank: number, depth: number): number {
	return 0.35 * (1 - (rank - 1) / depth);
}

export function clampFps(fps: number): number {
	return Math.min(60, Math.max(1, Math.round(fps)));
}

export interface RawTile {
	id: string;
	name: string;
	w: number;
	h: number;
	type: string;
	group?: string;
	variant?: 'center' | 'edge';
	fps?: number;
	pixels?: string[];
	frames?: string[][];
}

// Old saved tiles have `pixels` and no `frames` — wrap that single pixel array into a
// one-element frames list. Tiles that already have `frames` pass through unchanged.
export function migrateTileFrames(raw: RawTile): RawTile & { frames: string[][] } {
	if (raw.frames) return raw as RawTile & { frames: string[][] };
	const { pixels, ...rest } = raw;
	return { ...rest, frames: [pixels ?? []] };
}
