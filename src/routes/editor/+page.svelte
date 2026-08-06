<script lang="ts">
	import { onMount } from 'svelte';
	import { insertFrame, removeFrame, onionGhostIndices, ghostAlpha, clampFps, migrateTileFrames, type RawTile } from './animation';

	// ─── Isometric constants ─────────────────────────────────────────────────────
	const ISO_W = 64;
	const ISO_H = 32;
	const ISO_BOX = 40;

	const SIZES = [
		{ label: '8×8',   w: 8,  h: 8  },
		{ label: '16×16', w: 16, h: 16 },
		{ label: '8×16',  w: 8,  h: 16 },
		{ label: '16×8',  w: 16, h: 8  },
		{ label: '32×32', w: 32, h: 32 },
	];

	type TileType = 'floor' | 'wall' | 'object';

	interface TileDef {
		id: string;
		name: string;
		w: number;
		h: number;
		frames: string[][];          // one pixel array (length w*h) per animation frame; frames[0] is what the level canvas, tile library, and wall preview render
		fps?: number;                // playback speed for the pixel-editor's animation preview; defaults to 8 when absent
		type: TileType;
		group?: string;              // biome family id, e.g. "grass" | "forest" | "lake" — floor tiles only
		variant?: 'center' | 'edge'; // role within the group — floor tiles only
	}

	interface Cell {
		id: string;
		rot: number; // 0-3 (×90° CW)
		faces?: { top?: string; left?: string; right?: string };
	}

	interface Level {
		w: number;
		h: number;
		floor: (Cell | null)[][];
		objects: (Cell | null)[][];
	}

	// normalise legacy string cells and plain objects from JSON
	function parseCell(raw: unknown): Cell | null {
		if (!raw) return null;
		if (typeof raw === 'string') return { id: raw, rot: 0 };
		const r = raw as Cell;
		return { id: r.id, rot: r.rot ?? 0, faces: r.faces };
	}

	// A cardinal neighbor is "foreign" for autotile purposes if it's off the map,
	// empty, or belongs to a different biome group than `group`.
	function isForeignEdge(tx: number, ty: number, dx: number, dy: number, group: string): boolean {
		const nx = tx + dx, ny = ty + dy;
		if (nx < 0 || nx >= level.w || ny < 0 || ny >= level.h) return true;
		const cell = parseCell(level.floor[ny]?.[nx]);
		if (!cell) return true;
		const tile = tiles.find(t => t.id === cell.id);
		return !tile || tile.type !== 'floor' || tile.group !== group;
	}

	// The "edge" tile is painted depicting a foreign neighbor to its south (bottom).
	// Rotating it via the existing rot=0..3 (CW 90° steps, same as getRotatedTex)
	// repositions which side shows the foreign edge.
	const EDGE_ROT: Record<'N' | 'E' | 'S' | 'W', number> = { S: 0, W: 1, N: 2, E: 3 };

	function hexToRgb(hex: string): { r: number; g: number; b: number } {
		const n = hex.replace('#', '');
		return {
			r: parseInt(n.slice(0, 2), 16),
			g: parseInt(n.slice(2, 4), 16),
			b: parseInt(n.slice(4, 6), 16),
		};
	}

	function rgbToHex(r: number, g: number, b: number): string {
		const toHex = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
		return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
	}

	// ─── Color cube geometry ──────────────────────────────────────────────────
	// Same 3-face iso-cube shape as drawIsoFloor's `asWall` branch (top diamond +
	// left/right parallelograms), scaled down for a compact picker.
	const CUBE_TW = 90, CUBE_TH = 45, CUBE_BH = 56;
	const CUBE_OX = 10, CUBE_OY = CUBE_BH + 10; // sx, sy — top-left origin within the picker canvas
	const CUBE_W = CUBE_TW + CUBE_OX * 2;
	const CUBE_H = CUBE_BH + CUBE_TH + CUBE_OY - CUBE_BH + CUBE_OX; // canvas height, generous padding

	type Vec = { x: number; y: number };
	interface CubeFace { P00: Vec; edgeU: Vec; edgeV: Vec; poly: [number, number][]; uChannel: 'r' | 'g'; vChannel: 'g' | 'b'; fixedChannel: 'r' | 'g' | 'b'; }

	function cubeFaces(): { top: CubeFace; left: CubeFace; right: CubeFace } {
		const sx = CUBE_OX, sy = CUBE_OY, TW = CUBE_TW, TH = CUBE_TH, BH = CUBE_BH;

		const topP = { x: sx + TW / 2, y: sy - BH };
		const rightP = { x: sx + TW, y: sy + TH / 2 - BH };
		const leftP = { x: sx, y: sy + TH / 2 - BH };
		const bottomP = { x: sx + TW / 2, y: sy + TH - BH };

		const top: CubeFace = {
			P00: topP,
			edgeU: { x: rightP.x - topP.x, y: rightP.y - topP.y },
			edgeV: { x: leftP.x - topP.x, y: leftP.y - topP.y },
			poly: [[topP.x, topP.y], [rightP.x, rightP.y], [bottomP.x, bottomP.y], [leftP.x, leftP.y]],
			uChannel: 'r', vChannel: 'g', fixedChannel: 'b',
		};

		const leftTopLeft = leftP;
		const leftTopRight = bottomP;
		const leftBottomLeft = { x: sx, y: sy + TH / 2 };
		const leftBottomRight = { x: sx + TW / 2, y: sy + TH };
		const left: CubeFace = {
			P00: leftTopLeft,
			edgeU: { x: leftTopRight.x - leftTopLeft.x, y: leftTopRight.y - leftTopLeft.y },
			edgeV: { x: leftBottomLeft.x - leftTopLeft.x, y: leftBottomLeft.y - leftTopLeft.y },
			poly: [[leftTopLeft.x, leftTopLeft.y], [leftTopRight.x, leftTopRight.y], [leftBottomRight.x, leftBottomRight.y], [leftBottomLeft.x, leftBottomLeft.y]],
			uChannel: 'g', vChannel: 'b', fixedChannel: 'r',
		};

		const rightTopLeft = bottomP;
		const rightTopRight = rightP;
		const rightBottomLeft = { x: sx + TW / 2, y: sy + TH };
		const right: CubeFace = {
			P00: rightTopLeft,
			edgeU: { x: rightTopRight.x - rightTopLeft.x, y: rightTopRight.y - rightTopLeft.y },
			edgeV: { x: rightBottomLeft.x - rightTopLeft.x, y: rightBottomLeft.y - rightTopLeft.y },
			poly: [[rightTopLeft.x, rightTopLeft.y], [rightTopRight.x, rightTopRight.y], [{ x: sx + TW, y: sy + TH / 2 }.x, { x: sx + TW, y: sy + TH / 2 }.y], [rightBottomLeft.x, rightBottomLeft.y]],
			uChannel: 'r', vChannel: 'b', fixedChannel: 'g',
		};

		return { top, left, right };
	}

	function facePoint(face: CubeFace, u: number, v: number): Vec {
		return {
			x: face.P00.x + u * face.edgeU.x + v * face.edgeV.x,
			y: face.P00.y + u * face.edgeU.y + v * face.edgeV.y,
		};
	}

	const CUBE_TEX_N = 24;

	function buildFaceTexture(face: CubeFace, rgb: { r: number; g: number; b: number }): OffscreenCanvas {
		const tex = new OffscreenCanvas(CUBE_TEX_N, CUBE_TEX_N);
		const tctx = tex.getContext('2d')!;
		const img = tctx.createImageData(CUBE_TEX_N, CUBE_TEX_N);
		for (let j = 0; j < CUBE_TEX_N; j++) {
			for (let i = 0; i < CUBE_TEX_N; i++) {
				const u = i / (CUBE_TEX_N - 1), v = j / (CUBE_TEX_N - 1);
				const channels = { r: rgb.r, g: rgb.g, b: rgb.b };
				channels[face.uChannel] = Math.round(u * 255);
				channels[face.vChannel] = Math.round(v * 255);
				const idx = (j * CUBE_TEX_N + i) * 4;
				img.data[idx] = channels.r; img.data[idx + 1] = channels.g; img.data[idx + 2] = channels.b; img.data[idx + 3] = 255;
			}
		}
		tctx.putImageData(img, 0, 0);
		return tex;
	}

	function drawCubeFace(ctx: CanvasRenderingContext2D, face: CubeFace, rgb: { r: number; g: number; b: number }) {
		const tex = buildFaceTexture(face, rgb);
		ctx.save();
		ctx.beginPath();
		const [p0, p1, p2, p3] = face.poly;
		ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]);
		ctx.closePath(); ctx.clip();
		ctx.transform(
			face.edgeU.x / (CUBE_TEX_N - 1), face.edgeU.y / (CUBE_TEX_N - 1),
			face.edgeV.x / (CUBE_TEX_N - 1), face.edgeV.y / (CUBE_TEX_N - 1),
			face.P00.x, face.P00.y
		);
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(tex, 0, 0);
		ctx.restore();

		const channels = { r: rgb.r, g: rgb.g, b: rgb.b };
		const u = channels[face.uChannel] / 255, v = channels[face.vChannel] / 255;
		const m = facePoint(face, u, v);
		ctx.save();
		ctx.beginPath();
		ctx.arc(m.x, m.y, 4, 0, Math.PI * 2);
		ctx.fillStyle = '#fff';
		ctx.fill();
		ctx.lineWidth = 1.5;
		ctx.strokeStyle = '#000';
		ctx.stroke();
		ctx.restore();
	}

	function drawColorCube() {
		if (!cubeCanvas) return;
		cubeCanvas.width = CUBE_W;
		cubeCanvas.height = CUBE_H;
		const ctx = cubeCanvas.getContext('2d')!;
		ctx.clearRect(0, 0, CUBE_W, CUBE_H);
		const rgb = hexToRgb(paintColor);
		const faces = cubeFaces();
		drawCubeFace(ctx, faces.top, rgb);
		drawCubeFace(ctx, faces.left, rgb);
		drawCubeFace(ctx, faces.right, rgb);
	}

	// Inverts a face's affine mapping: given a screen point known to be inside
	// the face's polygon, recovers (u,v) in [0,1] via the standard parallelogram
	// linear-system solve (P - P00 = u*edgeU + v*edgeV).
	function faceUV(face: CubeFace, px: number, py: number): { u: number; v: number } {
		const dx = px - face.P00.x, dy = py - face.P00.y;
		const det = face.edgeU.x * face.edgeV.y - face.edgeU.y * face.edgeV.x;
		const u = (dx * face.edgeV.y - dy * face.edgeV.x) / det;
		const v = (face.edgeU.x * dy - face.edgeU.y * dx) / det;
		return { u: Math.max(0, Math.min(1, u)), v: Math.max(0, Math.min(1, v)) };
	}

	let cubeDragFace: CubeFace | null = null;

	function pickCubeFaceAt(px: number, py: number): CubeFace | null {
		const faces = cubeFaces();
		for (const face of [faces.top, faces.left, faces.right]) {
			if (pointInPoly(px, py, face.poly)) return face;
		}
		return null;
	}

	function setFromCubeEvent(e: PointerEvent, face: CubeFace) {
		const rect = cubeCanvas.getBoundingClientRect();
		const px = (e.clientX - rect.left) * (cubeCanvas.width / rect.width);
		const py = (e.clientY - rect.top) * (cubeCanvas.height / rect.height);
		const { u, v } = faceUV(face, px, py);
		const rgb = hexToRgb(paintColor);
		const channels = { r: rgb.r, g: rgb.g, b: rgb.b };
		channels[face.uChannel] = Math.round(u * 255);
		channels[face.vChannel] = Math.round(v * 255);
		pickColor(rgbToHex(channels.r, channels.g, channels.b));
	}

	function onCubeDown(e: PointerEvent) {
		const rect = cubeCanvas.getBoundingClientRect();
		const px = (e.clientX - rect.left) * (cubeCanvas.width / rect.width);
		const py = (e.clientY - rect.top) * (cubeCanvas.height / rect.height);
		const face = pickCubeFaceAt(px, py);
		if (!face) return;
		cubeDragFace = face;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		setFromCubeEvent(e, face);
	}
	function onCubeMove(e: PointerEvent) {
		if (!cubeDragFace) return;
		setFromCubeEvent(e, cubeDragFace);
	}
	function onCubeUp() { cubeDragFace = null; }

	// ─── App state ───────────────────────────────────────────────────────────────
	let tiles    = $state<TileDef[]>([]);
	let selectedId  = $state<string | null>(null);
	let activeType  = $state<TileType>('floor');
	let paintColor    = $state('#ffffff');
	let activeTool    = $state<'paint' | 'erase' | 'fill'>('paint');
	let brushSize     = $state(1);

	const DEFAULT_COLOR_GRID = [
		'#000000','#1a1a1a','#333333','#555555','#777777','#999999','#bbbbbb','#ffffff','#ff0000',
		'#ff5500','#ff9900','#ffcc00','#ffff00','#aaff00','#00ff44','#00ff99','#00ffff','#00aaff',
		'#0055ff','#2200ff','#7700ff','#cc00ff','#ff00cc','#ff0055','#6b2100','#6b4400','#556b00',
		'#006b33','#00446b','#00006b','#3d006b','#6b003d','#804000','#408000','#004080','#800040',
	];
	let colorGrid = $state<string[]>([...DEFAULT_COLOR_GRID]);

	let editingSlot = $state<number | null>(null);
	let popupPos = $state<{ x: number; y: number }>({ x: 0, y: 0 });
	const POPUP_W = 220, POPUP_H = 220;

	function openSwatchEditor(i: number, e: MouseEvent) {
		editingSlot = editingSlot === i ? null : i;
		if (editingSlot === null) return;
		pickColor(colorGrid[i]);
		const x = Math.max(8, Math.min(e.clientX, window.innerWidth - POPUP_W - 8));
		const y = Math.max(8, Math.min(e.clientY, window.innerHeight - POPUP_H - 8));
		popupPos = { x, y };
	}

	function closeSwatchEditor() {
		editingSlot = null;
	}

	function onHexInput(value: string) {
		if (/^#[0-9a-fA-F]{6}$/.test(value)) pickColor(value);
	}

	$effect(() => {
		if (editingSlot !== null) {
			colorGrid[editingSlot] = paintColor;
			debounceSave();
		}
	});

	function pickColor(color: string) {
		paintColor = color;
		if (activeTool === 'erase') activeTool = 'paint';
	}
	let activeLayer = $state<'floor' | 'objects'>('floor');
	let placeMode   = $state<TileType>('floor');
	let levelSel    = $state<{ tx: number; ty: number; layer: 'floor' | 'objects' } | null>(null);
	let hoverCoord  = $state<[number, number] | null>(null);
	let hoverFace   = $state<'top' | 'left' | 'right' | null>(null);

	function setPlaceMode(mode: TileType) {
		placeMode   = mode;
		activeType  = mode;
		activeLayer = mode === 'object' ? 'objects' : 'floor';
		if (selectedTile?.type !== mode)
			selectedId = tiles.find(t => t.type === mode)?.id ?? null;
	}

	let level = $state<Level>({
		w: 10, h: 10,
		floor:   Array.from({ length: 10 }, () => Array(10).fill(null)),
		objects: Array.from({ length: 10 }, () => Array(10).fill(null)),
	});

	let renderTick = $state(0);
	function requestRender() { renderTick++; }

	// ─── Canvas elements ─────────────────────────────────────────────────────────
	let editCanvas  = $state<HTMLCanvasElement>(null!);
	let levelCanvas = $state<HTMLCanvasElement>(null!);
	let cubeCanvas  = $state<HTMLCanvasElement>(null!);
	let wallPreviewCanvas = $state<HTMLCanvasElement>(null!);

	// ─── Derived ─────────────────────────────────────────────────────────────────
	let selectedTile = $derived(tiles.find(t => t.id === selectedId) ?? null);
	let typedTiles   = $derived(tiles.filter(t => t.type === activeType));
	let editScale    = $derived(
		selectedTile ? Math.max(4, Math.floor(360 / Math.max(selectedTile.w, selectedTile.h))) : 20
	);
	let knownGroups = $derived([...new Set(tiles.map(t => t.group).filter((g): g is string => !!g))]);

	// ─── Frame animation state ──────────────────────────────────────────────────
	let frameIndex = $state(0);
	let isPlaying  = $state(false);
	let onionDepth = $state(1);

	$effect(() => {
		void selectedId;
		frameIndex = 0;
		isPlaying = false;
	});

	// ─── Texture cache ────────────────────────────────────────────────────────────
	const texCache = new Map<string, OffscreenCanvas>();

	function invalidateTex(id: string) {
		for (const key of [...texCache.keys()])
			if (key === id || key.startsWith(`${id}-r`)) texCache.delete(key);
	}

	function getTex(tile: TileDef): OffscreenCanvas {
		let c = texCache.get(tile.id);
		if (!c) {
			c = new OffscreenCanvas(tile.w, tile.h);
			const ctx = c.getContext('2d')!;
			const restFrame = tile.frames[0];
			for (let y = 0; y < tile.h; y++)
				for (let x = 0; x < tile.w; x++) {
					const col = restFrame[y * tile.w + x];
					if (col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }
				}
			texCache.set(tile.id, c);
		}
		return c;
	}

	function getRotatedTex(tile: TileDef, rot: number): { tex: OffscreenCanvas; dim: number } {
		if (rot === 0) return { tex: getTex(tile), dim: tile.w };
		const key = `${tile.id}-r${rot}`;
		let c = texCache.get(key);
		if (!c) {
			const dim = Math.max(tile.w, tile.h);
			c = new OffscreenCanvas(dim, dim);
			const ctx = c.getContext('2d')!;
			ctx.imageSmoothingEnabled = false;
			ctx.translate(dim / 2, dim / 2);
			ctx.rotate(rot * Math.PI / 2);
			ctx.drawImage(getTex(tile), -tile.w / 2, -tile.h / 2);
			texCache.set(key, c);
		}
		return { tex: c, dim: Math.max(tile.w, tile.h) };
	}

	// ─── Pixel editor rendering ───────────────────────────────────────────────────
	function redrawEdit() {
		if (!editCanvas || !selectedTile) return;
		const tile = selectedTile, s = editScale;
		const framePixels = tile.frames[frameIndex];
		editCanvas.width  = tile.w * s;
		editCanvas.height = tile.h * s;
		const ctx = editCanvas.getContext('2d')!;
		ctx.clearRect(0, 0, editCanvas.width, editCanvas.height);

		// checkerboard for transparency
		for (let y = 0; y < tile.h; y++)
			for (let x = 0; x < tile.w; x++) {
				ctx.fillStyle = (x + y) % 2 ? '#1c1c1c' : '#252525';
				ctx.fillRect(x * s, y * s, s, s);
			}

		// onion skin: fading ghosts of previous frames, skipped while playing
		if (!isPlaying && onionDepth > 0 && tile.frames.length > 1) {
			const ghosts = onionGhostIndices(frameIndex, tile.frames.length, onionDepth);
			for (let rank = ghosts.length; rank >= 1; rank--) {
				const ghostPixels = tile.frames[ghosts[rank - 1]];
				ctx.globalAlpha = ghostAlpha(rank, onionDepth);
				for (let y = 0; y < tile.h; y++)
					for (let x = 0; x < tile.w; x++) {
						const c = ghostPixels[y * tile.w + x];
						if (c) { ctx.fillStyle = c; ctx.fillRect(x * s, y * s, s, s); }
					}
			}
			ctx.globalAlpha = 1;
		}

		// pixels
		for (let y = 0; y < tile.h; y++)
			for (let x = 0; x < tile.w; x++) {
				const c = framePixels[y * tile.w + x];
				if (c) { ctx.fillStyle = c; ctx.fillRect(x * s, y * s, s, s); }
			}

		// grid lines
		ctx.strokeStyle = '#2e2e2e';
		ctx.lineWidth = 0.5;
		for (let x = 0; x <= tile.w; x++) {
			ctx.beginPath(); ctx.moveTo(x * s, 0); ctx.lineTo(x * s, tile.h * s); ctx.stroke();
		}
		for (let y = 0; y <= tile.h; y++) {
			ctx.beginPath(); ctx.moveTo(0, y * s); ctx.lineTo(tile.w * s, y * s); ctx.stroke();
		}
	}

	$effect(() => {
		void selectedTile?.frames[frameIndex]?.join('');
		void editScale;
		void onionDepth;
		void isPlaying;
		redrawEdit();
	});

	$effect(() => {
		void paintColor;
		drawColorCube();
	});

	function drawWallPreview() {
		if (!wallPreviewCanvas || !selectedTile || selectedTile.type !== 'wall') return;
		wallPreviewCanvas.width = CUBE_W;
		wallPreviewCanvas.height = CUBE_H;
		const ctx = wallPreviewCanvas.getContext('2d')!;
		ctx.clearRect(0, 0, CUBE_W, CUBE_H);
		drawIsoFloor(ctx, selectedTile, CUBE_OX, CUBE_OY, true, 0);
	}

	$effect(() => {
		void renderTick;
		void selectedTile?.type;
		drawWallPreview();
	});

	// ─── Edit canvas interaction ──────────────────────────────────────────────────
	let isDrawing = false;

	function editCoord(e: MouseEvent): [number, number] | null {
		if (!editCanvas || !selectedTile) return null;
		const rect = editCanvas.getBoundingClientRect();
		const scaleX = editCanvas.width  / rect.width;
		const scaleY = editCanvas.height / rect.height;
		const x = Math.floor((e.clientX - rect.left) * scaleX / editScale);
		const y = Math.floor((e.clientY - rect.top)  * scaleY / editScale);
		if (x < 0 || x >= selectedTile.w || y < 0 || y >= selectedTile.h) return null;
		return [x, y];
	}

	function paintPixel(x: number, y: number) {
		if (!selectedTile) return;
		const tile = selectedTile;
		const framePixels = tile.frames[frameIndex];

		let newPixels: string[];

		if (activeTool === 'fill') {
			const target = framePixels[y * tile.w + x];
			const color  = paintColor;
			newPixels = [...framePixels];
			const stack = [y * tile.w + x];
			const visited = new Set<number>();
			while (stack.length) {
				const i = stack.pop()!;
				if (i < 0 || i >= newPixels.length || visited.has(i)) continue;
				if (newPixels[i] !== target) continue;
				visited.add(i);
				newPixels[i] = color;
				const cx = i % tile.w, cy = Math.floor(i / tile.w);
				if (cx > 0) stack.push(i - 1);
				if (cx < tile.w - 1) stack.push(i + 1);
				stack.push(i - tile.w, i + tile.w);
			}
		} else {
			const color = activeTool === 'erase' ? '' : paintColor;
			const half  = Math.floor(brushSize / 2);
			newPixels   = [...framePixels];
			for (let dy = -half; dy < brushSize - half; dy++) {
				for (let dx = -half; dx < brushSize - half; dx++) {
					const bx = x + dx, by = y + dy;
					if (bx < 0 || bx >= tile.w || by < 0 || by >= tile.h) continue;
					newPixels[by * tile.w + bx] = color;
				}
			}
		}

		const newFrames = tile.frames.map((f, i) => i === frameIndex ? newPixels : f);
		tiles = tiles.map(t => t.id === tile.id ? { ...t, frames: newFrames } : t);
		invalidateTex(tile.id);
		requestRender();
	}

	function onEditDown(e: MouseEvent) {
		e.preventDefault();
		isDrawing = true;
		const coord = editCoord(e);
		if (coord) { paintPixel(...coord); if (activeTool === 'fill') isDrawing = false; }
	}
	function onEditMove(e: MouseEvent) {
		if (!isDrawing || activeTool === 'fill') return;
		const coord = editCoord(e);
		if (coord) paintPixel(...coord);
	}
	function onEditUp() {
		isDrawing = false;
		debounceSave();
	}

	// ─── Level rendering ──────────────────────────────────────────────────────────
	function levelOffsets(cw: number, ch: number) {
		const offX = cw / 2 - level.w * ISO_W / 2;
		const offY = Math.max(
			ISO_BOX + 8,
			(ch - (level.w + level.h) * ISO_H / 2) / 2 + ISO_BOX
		);
		return { offX, offY };
	}

	function drawIsoFloor(
		ctx: CanvasRenderingContext2D,
		tile: TileDef,
		sx: number, sy: number,
		asWall: boolean,
		rot = 0,
		faceTiles?: { top?: TileDef; left?: TileDef; right?: TileDef }
	) {
		const TW = ISO_W, TH = ISO_H, BH = ISO_BOX;

		if (asWall) {
			// ── top face ──
			const topT = faceTiles?.top ?? tile;
			const { tex: topTex, dim: topDim } = getRotatedTex(topT, rot);
			const at = TW / (2 * topDim), bt = TH / (2 * topDim);
			ctx.save();
			ctx.beginPath();
			ctx.moveTo(sx + TW/2, sy - BH);
			ctx.lineTo(sx + TW,   sy + TH/2 - BH);
			ctx.lineTo(sx + TW/2, sy + TH - BH);
			ctx.lineTo(sx,        sy + TH/2 - BH);
			ctx.closePath(); ctx.clip();
			ctx.transform(at, bt, -at, bt, sx + TW/2, sy - BH);
			ctx.imageSmoothingEnabled = false;
			ctx.drawImage(topTex, 0, 0);
			ctx.restore();

			// ── left face ──
			// Transform maps tile pixels to the left-face parallelogram:
			//   (0,0)→top-left  (N,0)→top-right  (0,N)→bot-left  (N,N)→bot-right
			const leftT = faceTiles?.left ?? tile;
			const { tex: leftTex, dim: leftDim } = getRotatedTex(leftT, rot);
			ctx.save();
			ctx.beginPath();
			ctx.moveTo(sx,        sy + TH/2 - BH);
			ctx.lineTo(sx + TW/2, sy + TH - BH);
			ctx.lineTo(sx + TW/2, sy + TH);
			ctx.lineTo(sx,        sy + TH/2);
			ctx.closePath(); ctx.clip();
			ctx.fillStyle = 'rgba(0,0,0,0.5)';
			ctx.fill();
			ctx.globalAlpha = 0.5;
			ctx.transform(TW / (2 * leftDim), TH / (2 * leftDim), 0, BH / leftDim,
				sx, sy + TH/2 - BH);
			ctx.imageSmoothingEnabled = false;
			ctx.drawImage(leftTex, 0, 0);
			ctx.restore();

			// ── right face ──
			// Transform maps tile pixels to the right-face parallelogram:
			//   (0,0)→top-left  (N,0)→top-right  (0,N)→bot-left  (N,N)→bot-right
			const rightT = faceTiles?.right ?? tile;
			const { tex: rightTex, dim: rightDim } = getRotatedTex(rightT, rot);
			ctx.save();
			ctx.beginPath();
			ctx.moveTo(sx + TW/2, sy + TH - BH);
			ctx.lineTo(sx + TW,   sy + TH/2 - BH);
			ctx.lineTo(sx + TW,   sy + TH/2);
			ctx.lineTo(sx + TW/2, sy + TH);
			ctx.closePath(); ctx.clip();
			ctx.fillStyle = 'rgba(0,0,0,0.68)';
			ctx.fill();
			ctx.globalAlpha = 0.32;
			ctx.transform(TW / (2 * rightDim), -TH / (2 * rightDim), 0, BH / rightDim,
				sx + TW/2, sy + TH - BH);
			ctx.imageSmoothingEnabled = false;
			ctx.drawImage(rightTex, 0, 0);
			ctx.restore();
		} else {
			const { tex, dim } = getRotatedTex(tile, rot);
			const a = TW / (2 * dim), b = TH / (2 * dim);
			ctx.save();
			ctx.beginPath();
			ctx.moveTo(sx + TW/2, sy);
			ctx.lineTo(sx + TW,   sy + TH/2);
			ctx.lineTo(sx + TW/2, sy + TH);
			ctx.lineTo(sx,        sy + TH/2);
			ctx.closePath(); ctx.clip();
			ctx.transform(a, b, -a, b, sx + TW/2, sy);
			ctx.imageSmoothingEnabled = false;
			ctx.drawImage(tex, 0, 0);
			ctx.restore();
		}
	}

	function drawObject(ctx: CanvasRenderingContext2D, tile: TileDef, cx: number, baseY: number, rot = 0) {
		const { tex, dim } = getRotatedTex(tile, rot);
		const scale = Math.max(2, Math.floor(ISO_W / Math.max(tile.w, tile.h)));
		const dw = dim * scale, dh = dim * scale;
		ctx.save();
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(tex, cx - dw / 2, baseY - dh, dw, dh);
		ctx.restore();
	}

	function pointInPoly(x: number, y: number, poly: [number, number][]): boolean {
		let inside = false;
		for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
			const [xi, yi] = poly[i], [xj, yj] = poly[j];
			if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi)
				inside = !inside;
		}
		return inside;
	}

	function detectFace(cx: number, cy: number, sx: number, sy: number): 'top' | 'left' | 'right' {
		const TW = ISO_W, TH = ISO_H, BH = ISO_BOX;
		if (pointInPoly(cx, cy, [
			[sx + TW/2, sy - BH], [sx + TW, sy + TH/2 - BH],
			[sx + TW/2, sy + TH - BH], [sx, sy + TH/2 - BH]
		])) return 'top';
		if (pointInPoly(cx, cy, [
			[sx, sy + TH/2 - BH], [sx + TW/2, sy + TH - BH],
			[sx + TW/2, sy + TH], [sx, sy + TH/2]
		])) return 'left';
		return 'right';
	}

	function redrawLevel() {
		if (!levelCanvas) return;
		const parent = levelCanvas.parentElement;
		const cw = levelCanvas.width  = parent?.clientWidth  ?? 600;
		const ch = levelCanvas.height = parent?.clientHeight ?? 500;
		const ctx = levelCanvas.getContext('2d')!;
		ctx.clearRect(0, 0, cw, ch);

		const { offX, offY } = levelOffsets(cw, ch);
		const TW = ISO_W, TH = ISO_H;

		type Item = { depth: number; fn: () => void };
		const items: Item[] = [];

		for (let ty = 0; ty < level.h; ty++) {
			for (let tx = 0; tx < level.w; tx++) {
				const sx = offX + (tx - ty) * TW / 2;
				const sy = offY + (tx + ty) * TH / 2;
				const depth = tx + ty;

				const floorCell = parseCell(level.floor[ty]?.[tx]);
				const objCell   = parseCell(level.objects[ty]?.[tx]);
				const floorTile = floorCell ? tiles.find(t => t.id === floorCell.id) : null;
				const objTile   = objCell   ? tiles.find(t => t.id === objCell.id)   : null;

				if (!floorTile) {
					items.push({ depth: depth - 0.1, fn: () => {
						ctx.strokeStyle = '#1e1e1e';
						ctx.lineWidth = 0.5;
						ctx.beginPath();
						ctx.moveTo(sx + TW/2, sy);
						ctx.lineTo(sx + TW,   sy + TH/2);
						ctx.lineTo(sx + TW/2, sy + TH);
						ctx.lineTo(sx,        sy + TH/2);
						ctx.closePath();
						ctx.stroke();
					}});
				} else if (floorTile.type === 'floor' && floorTile.group) {
					const group = floorTile.group;
					const centerTile = tiles.find(t => t.type === 'floor' && t.group === group && t.variant === 'center') ?? floorTile;
					const edgeTile   = tiles.find(t => t.type === 'floor' && t.group === group && t.variant === 'edge');
					const tileX = tx, tileY = ty;
					items.push({ depth, fn: () => {
						drawIsoFloor(ctx, centerTile, sx, sy, false, 0);
						if (!edgeTile) return;
						if (isForeignEdge(tileX, tileY, 0, -1, group)) drawIsoFloor(ctx, edgeTile, sx, sy, false, EDGE_ROT.N);
						if (isForeignEdge(tileX, tileY, 1, 0, group))  drawIsoFloor(ctx, edgeTile, sx, sy, false, EDGE_ROT.E);
						if (isForeignEdge(tileX, tileY, 0, 1, group))  drawIsoFloor(ctx, edgeTile, sx, sy, false, EDGE_ROT.S);
						if (isForeignEdge(tileX, tileY, -1, 0, group)) drawIsoFloor(ctx, edgeTile, sx, sy, false, EDGE_ROT.W);
					}});
				} else {
					const rot = floorCell!.rot;
					const cellFaces = floorCell!.faces;
					const wallFaceTiles = (floorTile.type === 'wall' && cellFaces) ? {
						top:   cellFaces.top   ? tiles.find(t => t.id === cellFaces.top)   : undefined,
						left:  cellFaces.left  ? tiles.find(t => t.id === cellFaces.left)  : undefined,
						right: cellFaces.right ? tiles.find(t => t.id === cellFaces.right) : undefined,
					} : undefined;
					items.push({ depth, fn: () =>
						drawIsoFloor(ctx, floorTile, sx, sy, floorTile.type === 'wall', rot, wallFaceTiles)
					});
				}

				if (objTile) {
					const rot = objCell!.rot;
					items.push({ depth: depth + 0.5, fn: () =>
						drawObject(ctx, objTile, sx + TW/2, sy + TH, rot)
					});
				}
			}
		}

		items.sort((a, b) => a.depth - b.depth);
		for (const { fn } of items) fn();

		// selection outline
		if (levelSel) {
			const { tx, ty, layer } = levelSel;
			const sx = offX + (tx - ty) * TW / 2;
			const sy = offY + (tx + ty) * TH / 2;
			const selCell = parseCell((layer === 'floor' ? level.floor : level.objects)[ty]?.[tx]);
			const selTile = selCell ? tiles.find(t => t.id === selCell.id) : null;
			ctx.save();
			ctx.lineWidth = 1.5;
			ctx.shadowBlur = 6;

			if (selTile?.type === 'wall') {
				// Cyan cube-edge outline for wall tiles
				const BH = ISO_BOX;
				ctx.strokeStyle = '#00e5ff';
				ctx.shadowColor  = '#00e5ff';
				ctx.setLineDash([]);
				ctx.beginPath();
				// top-face diamond (elevated)
				ctx.moveTo(sx + TW/2, sy - BH);
				ctx.lineTo(sx + TW,   sy + TH/2 - BH);
				ctx.lineTo(sx + TW/2, sy + TH - BH);
				ctx.lineTo(sx,        sy + TH/2 - BH);
				ctx.closePath();
				// three vertical edges
				ctx.moveTo(sx + TW/2, sy - BH);       ctx.lineTo(sx + TW/2, sy);        // front-top edge
				ctx.moveTo(sx + TW,   sy + TH/2 - BH); ctx.lineTo(sx + TW,   sy + TH/2); // right edge
				ctx.moveTo(sx,        sy + TH/2 - BH); ctx.lineTo(sx,        sy + TH/2); // left edge
				// floor-level base diamond
				ctx.moveTo(sx + TW/2, sy);
				ctx.lineTo(sx + TW,   sy + TH/2);
				ctx.lineTo(sx + TW/2, sy + TH);
				ctx.lineTo(sx,        sy + TH/2);
				ctx.closePath();
				ctx.stroke();
			} else {
				// Yellow dashed diamond for floor / object tiles
				ctx.strokeStyle = '#ffe44e';
				ctx.shadowColor  = '#ffe44e';
				ctx.setLineDash([5, 3]);
				ctx.beginPath();
				ctx.moveTo(sx + TW/2, sy);
				ctx.lineTo(sx + TW,   sy + TH/2);
				ctx.lineTo(sx + TW/2, sy + TH);
				ctx.lineTo(sx,        sy + TH/2);
				ctx.closePath();
				ctx.stroke();
			}
			ctx.restore();
		}

		// ghost preview on empty hover cell
		if (hoverCoord && !isPainting && selectedId) {
			const [htx, hty] = hoverCoord;
			const layerArr = activeLayer === 'floor' ? level.floor : level.objects;
			if (!parseCell(layerArr[hty]?.[htx])) {
				const ghostTile = tiles.find(t => t.id === selectedId);
				if (ghostTile) {
					const sx = offX + (htx - hty) * TW / 2;
					const sy = offY + (htx + hty) * TH / 2;
					ctx.save();
					ctx.globalAlpha = 0.4;
					if (activeLayer === 'floor') {
						drawIsoFloor(ctx, ghostTile, sx, sy, ghostTile.type === 'wall', 0);
					} else {
						drawObject(ctx, ghostTile, sx + TW/2, sy + TH, 0);
					}
					ctx.restore();
				}
			}
		}

		// wall face highlight
		if (hoverFace && hoverCoord) {
			const [htx, hty] = hoverCoord;
			const sx = offX + (htx - hty) * TW / 2;
			const sy = offY + (htx + hty) * TH / 2;
			const BH = ISO_BOX;
			const faceColors: Record<string, string> = {
				top:   'rgba(255,220,60,0.32)',
				left:  'rgba(255,220,60,0.22)',
				right: 'rgba(255,220,60,0.14)',
			};
			ctx.save();
			ctx.fillStyle = faceColors[hoverFace];
			ctx.strokeStyle = 'rgba(255,220,60,0.8)';
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			if (hoverFace === 'top') {
				ctx.moveTo(sx + TW/2, sy - BH);
				ctx.lineTo(sx + TW,   sy + TH/2 - BH);
				ctx.lineTo(sx + TW/2, sy + TH - BH);
				ctx.lineTo(sx,        sy + TH/2 - BH);
			} else if (hoverFace === 'left') {
				ctx.moveTo(sx,        sy + TH/2 - BH);
				ctx.lineTo(sx + TW/2, sy + TH - BH);
				ctx.lineTo(sx + TW/2, sy + TH);
				ctx.lineTo(sx,        sy + TH/2);
			} else {
				ctx.moveTo(sx + TW/2, sy + TH - BH);
				ctx.lineTo(sx + TW,   sy + TH/2 - BH);
				ctx.lineTo(sx + TW,   sy + TH/2);
				ctx.lineTo(sx + TW/2, sy + TH);
			}
			ctx.closePath();
			ctx.fill();
			ctx.stroke();
			ctx.restore();
		}
	}

	$effect(() => {
		void renderTick;
		redrawLevel();
	});

	// ─── Level canvas interaction ─────────────────────────────────────────────────
	let isPainting = false;
	let dragMoved  = false;
	let downCoord: [number, number] | null = null;

	function updateHover(e: MouseEvent) {
		const coord = screenToTile(e);
		hoverCoord = coord;
		hoverFace = null;

		if (!levelCanvas) { requestRender(); return; }

		const rect = levelCanvas.getBoundingClientRect();
		const cx = (e.clientX - rect.left) * (levelCanvas.width  / rect.width);
		const cy = (e.clientY - rect.top)  * (levelCanvas.height / rect.height);
		const { offX, offY } = levelOffsets(levelCanvas.width, levelCanvas.height);
		const TW = ISO_W, TH = ISO_H, BH = ISO_BOX;

		// Wall faces are elevated above the floor plane, so screenToTile (floor-level
		// projection) maps most of a face to an adjacent tile. Check the floor-projected
		// tile plus its three "uphill" neighbours — those are the only candidates whose
		// faces could visually cover the cursor.
		const base = coord ?? [0, 0];
		const candidates: [number, number][] = coord
			? [[base[0], base[1]], [base[0]+1, base[1]], [base[0], base[1]+1], [base[0]+1, base[1]+1]]
			: [];

		for (const [wtx, wty] of candidates) {
			if (wtx < 0 || wtx >= level.w || wty < 0 || wty >= level.h) continue;
			const cell = parseCell(level.floor[wty]?.[wtx]);
			const tile = cell ? tiles.find(t => t.id === cell.id) : null;
			if (tile?.type !== 'wall') continue;

			const sx = offX + (wtx - wty) * TW / 2;
			const sy = offY + (wtx + wty) * TH / 2;

			if (pointInPoly(cx, cy, [
				[sx+TW/2, sy-BH], [sx+TW, sy+TH/2-BH],
				[sx+TW/2, sy+TH-BH], [sx, sy+TH/2-BH]
			])) { hoverCoord = [wtx, wty]; hoverFace = 'top'; break; }

			if (pointInPoly(cx, cy, [
				[sx, sy+TH/2-BH], [sx+TW/2, sy+TH-BH],
				[sx+TW/2, sy+TH], [sx, sy+TH/2]
			])) { hoverCoord = [wtx, wty]; hoverFace = 'left'; break; }

			if (pointInPoly(cx, cy, [
				[sx+TW/2, sy+TH-BH], [sx+TW, sy+TH/2-BH],
				[sx+TW, sy+TH/2], [sx+TW/2, sy+TH]
			])) { hoverCoord = [wtx, wty]; hoverFace = 'right'; break; }
		}

		requestRender();
	}

	function screenToTile(e: MouseEvent): [number, number] | null {
		if (!levelCanvas) return null;
		const rect = levelCanvas.getBoundingClientRect();
		const cx = (e.clientX - rect.left) * (levelCanvas.width  / rect.width);
		const cy = (e.clientY - rect.top)  * (levelCanvas.height / rect.height);
		const { offX, offY } = levelOffsets(levelCanvas.width, levelCanvas.height);
		const u = (cx - offX - ISO_W / 2) * 2 / ISO_W;
		const v = (cy - offY)             * 2 / ISO_H;
		const tx = Math.floor((u + v) / 2);
		const ty = Math.floor((v - u) / 2);
		if (tx < 0 || tx >= level.w || ty < 0 || ty >= level.h) return null;
		return [tx, ty];
	}

	function setCell(tx: number, ty: number, layer: 'floor' | 'objects', val: Cell | null) {
		if (layer === 'floor') {
			level.floor = level.floor.map((row, r) =>
				r !== ty ? row : row.map((c, col) => col === tx ? val : c)
			);
		} else {
			level.objects = level.objects.map((row, r) =>
				r !== ty ? row : row.map((c, col) => col === tx ? val : c)
			);
		}
	}

	function handleLevelClick(tx: number, ty: number) {
		// Wall faces are elevated above the floor — screenToTile maps them to adjacent
		// tiles. updateHover corrects hoverCoord to the actual wall tile, so use that
		// when a face is highlighted rather than the floor-projected click coord.
		if (hoverFace && hoverCoord) { [tx, ty] = hoverCoord; }

		const layer = activeLayer;
		const arr   = layer === 'floor' ? level.floor : level.objects;
		const cell  = parseCell(arr[ty]?.[tx]);

		// face-paint: clicking a highlighted wall face applies selected tile to that face
		if (hoverFace && cell && selectedId) {
			setCell(tx, ty, layer, { ...cell, faces: { ...cell.faces, [hoverFace]: selectedId } });
			levelSel = { tx, ty, layer };
			requestRender();
			debounceSave();
			return;
		}

		const isSel = levelSel?.tx === tx && levelSel?.ty === ty && levelSel?.layer === layer;
		if (isSel) {
			setCell(tx, ty, layer, null);
			levelSel = null;
		} else if (cell) {
			levelSel = { tx, ty, layer };
		} else if (selectedId) {
			setCell(tx, ty, layer, { id: selectedId, rot: 0 });
			levelSel = { tx, ty, layer };
		}
		requestRender();
		debounceSave();
	}

	function rotateSelectedCell() {
		if (!levelSel) return;
		const { tx, ty, layer } = levelSel;
		const arr  = layer === 'floor' ? level.floor : level.objects;
		const cell = parseCell(arr[ty]?.[tx]);
		if (!cell) return;
		const next = { ...cell, rot: (cell.rot + 1) % 4 };
		setCell(tx, ty, layer, next);
		requestRender();
		debounceSave();
	}

	function onLevelDown(e: MouseEvent) {
		e.preventDefault();
		isPainting = true;
		dragMoved  = false;
		downCoord  = screenToTile(e);
	}

	function onLevelMove(e: MouseEvent) {
		updateHover(e);
		if (!isPainting || !downCoord) return;
		const coord = screenToTile(e);
		if (!coord) return;
		if (!dragMoved && (coord[0] !== downCoord[0] || coord[1] !== downCoord[1]))
			dragMoved = true;
		if (dragMoved && selectedId) {
			setCell(coord[0], coord[1], activeLayer, { id: selectedId, rot: 0 });
			requestRender();
		}
	}

	function onLevelUp() {
		if (!dragMoved && downCoord) handleLevelClick(downCoord[0], downCoord[1]);
		if (dragMoved) debounceSave();
		isPainting = false;
		dragMoved  = false;
		downCoord  = null;
	}

	function onLevelLeave() {
		hoverCoord = null; hoverFace = null;
		onLevelUp();
		requestRender();
	}

	function onLevelCtx(e: MouseEvent) { e.preventDefault(); }

	// ─── Tile management ──────────────────────────────────────────────────────────
	function newTile(opts?: { name?: string; group?: string; variant?: 'center' | 'edge' }) {
		const w = 16, h = 16;
		const tile: TileDef = {
			id: crypto.randomUUID(),
			name: opts?.name ?? `${activeType} ${typedTiles.length + 1}`,
			w, h, type: activeType,
			frames: [new Array(w * h).fill('')],
			group: opts?.group,
			variant: opts?.variant,
		};
		tiles = [...tiles, tile];
		selectedId = tile.id;
		requestRender();
		return tile;
	}

	function deleteTile() {
		if (!selectedId) return;
		const id = selectedId;
		tiles = tiles.filter(t => t.id !== id);
		invalidateTex(id);
		level.floor   = level.floor.map(row => row.map(c => parseCell(c)?.id === id ? null : c));
		level.objects = level.objects.map(row => row.map(c => parseCell(c)?.id === id ? null : c));
		if (levelSel && (level.floor[levelSel.ty]?.[levelSel.tx] == null &&
		                 level.objects[levelSel.ty]?.[levelSel.tx] == null)) levelSel = null;
		selectedId = tiles[0]?.id ?? null;
		requestRender();
		debounceSave();
	}

	function renameTile(name: string) {
		if (!selectedId) return;
		tiles = tiles.map(t => t.id === selectedId ? { ...t, name } : t);
		debounceSave();
	}

	function setTileFps(fps: number) {
		if (!selectedId) return;
		const clamped = clampFps(fps);
		tiles = tiles.map(t => t.id === selectedId ? { ...t, fps: clamped } : t);
		debounceSave();
	}

	function setTileType(type: TileType) {
		if (!selectedId) return;
		tiles = tiles.map(t => t.id === selectedId
			? { ...t, type, group: type === 'floor' ? t.group : undefined, variant: type === 'floor' ? t.variant : undefined }
			: t);
		requestRender();
		debounceSave();
	}

	function setTileGroup(group: string) {
		if (!selectedId) return;
		tiles = tiles.map(t => t.id === selectedId ? { ...t, group: group || undefined } : t);
		requestRender();
		debounceSave();
	}

	function setTileVariant(variant: 'center' | 'edge') {
		if (!selectedId) return;
		tiles = tiles.map(t => t.id === selectedId ? { ...t, variant } : t);
		requestRender();
		debounceSave();
	}

	function resizeTile(w: number, h: number) {
		if (!selectedId) return;
		tiles = tiles.map(t => t.id === selectedId
			? { ...t, w, h, frames: t.frames.map(() => new Array(w * h).fill('')) } : t);
		invalidateTex(selectedId);
		requestRender();
		debounceSave();
	}

	function resizeLevel(w: number, h: number) {
		w = Math.max(2, Math.min(32, w));
		h = Math.max(2, Math.min(32, h));
		level = {
			w, h,
			floor:   Array.from({ length: h }, (_, r) => Array.from({ length: w }, (_, c) => parseCell(level.floor[r]?.[c])   ?? null)),
			objects: Array.from({ length: h }, (_, r) => Array.from({ length: w }, (_, c) => parseCell(level.objects[r]?.[c]) ?? null)),
		};
		requestRender();
		debounceSave();
	}

	// ─── Thumbnail action ─────────────────────────────────────────────────────────
	function groupColor(group: string): string {
		let h = 0;
		for (let i = 0; i < group.length; i++) h = (h * 31 + group.charCodeAt(i)) >>> 0;
		return `hsl(${h % 360}, 65%, 55%)`;
	}

	function thumb(node: HTMLCanvasElement, tile: TileDef) {
		function draw(t: TileDef) {
			const ctx = node.getContext('2d')!;
			ctx.clearRect(0, 0, t.w, t.h);
			const restFrame = t.frames[0];
			for (let y = 0; y < t.h; y++)
				for (let x = 0; x < t.w; x++) {
					const c = restFrame[y * t.w + x];
					if (c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
				}
		}
		draw(tile);
		return { update: draw };
	}

	function frameThumb(node: HTMLCanvasElement, frame: { pixels: string[]; w: number; h: number }) {
		function draw(f: { pixels: string[]; w: number; h: number }) {
			const ctx = node.getContext('2d')!;
			ctx.clearRect(0, 0, f.w, f.h);
			for (let y = 0; y < f.h; y++)
				for (let x = 0; x < f.w; x++) {
					const c = f.pixels[y * f.w + x];
					if (c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
				}
		}
		draw(frame);
		return { update: draw };
	}

	function selectFrame(i: number) {
		if (isPlaying) return;
		frameIndex = i;
	}

	function addFrame() {
		if (!selectedTile || isPlaying) return;
		const tile = selectedTile;
		const blank = new Array(tile.w * tile.h).fill('');
		const { frames, index } = insertFrame(tile.frames, frameIndex, blank);
		tiles = tiles.map(t => t.id === tile.id ? { ...t, frames } : t);
		frameIndex = index;
		invalidateTex(tile.id);
		requestRender();
		debounceSave();
	}

	function duplicateFrame() {
		if (!selectedTile || isPlaying) return;
		const tile = selectedTile;
		const { frames, index } = insertFrame(tile.frames, frameIndex, [...tile.frames[frameIndex]]);
		tiles = tiles.map(t => t.id === tile.id ? { ...t, frames } : t);
		frameIndex = index;
		invalidateTex(tile.id);
		requestRender();
		debounceSave();
	}

	function removeCurrentFrame() {
		if (!selectedTile || isPlaying || selectedTile.frames.length <= 1) return;
		const tile = selectedTile;
		const { frames, index } = removeFrame(tile.frames, frameIndex);
		tiles = tiles.map(t => t.id === tile.id ? { ...t, frames } : t);
		frameIndex = index;
		invalidateTex(tile.id);
		requestRender();
		debounceSave();
	}

	// ─── Persistence ──────────────────────────────────────────────────────────────
	let saveHandle = 0;
	function debounceSave() {
		clearTimeout(saveHandle);
		saveHandle = setTimeout(() => {
			try {
				localStorage.setItem('editor-tiles', JSON.stringify(tiles));
				localStorage.setItem('editor-level', JSON.stringify(level));
				localStorage.setItem('editor-colorgrid', JSON.stringify(colorGrid));
				localStorage.setItem('editor-oniondepth', JSON.stringify(onionDepth));
			} catch {}
		}, 600) as unknown as number;
	}

	function load() {
		try {
			const t = localStorage.getItem('editor-tiles');
			const l = localStorage.getItem('editor-level');
			const cg = localStorage.getItem('editor-colorgrid');
			const od = localStorage.getItem('editor-oniondepth');
			if (t) tiles = (JSON.parse(t) as RawTile[]).map(migrateTileFrames) as unknown as TileDef[];
			if (l) {
				const raw = JSON.parse(l) as Level;
				// normalise any legacy string cells
				level = {
					...raw,
					floor:   raw.floor.map(row   => row.map(c => parseCell(c))),
					objects: raw.objects.map(row => row.map(c => parseCell(c))),
				};
			}
			if (cg) colorGrid = JSON.parse(cg);
			if (od) onionDepth = Math.max(0, Math.min(8, JSON.parse(od)));
			selectedId = tiles[0]?.id ?? null;
		} catch {}
	}

	function scaffoldDefaults() {
		const savedType = activeType;

		activeType = 'floor';
		for (const group of ['grass', 'forest', 'lake'] as const) {
			newTile({ name: `${group} center`, group, variant: 'center' });
			newTile({ name: `${group} edge`, group, variant: 'edge' });
		}

		activeType = 'wall';
		newTile({ name: 'mountain' });

		activeType = savedType;
		selectedId = tiles[0]?.id ?? null;
	}

	// ─── Export / import ──────────────────────────────────────────────────────────
	function exportJSON() {
		const blob = new Blob([JSON.stringify({ tiles, level }, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = Object.assign(document.createElement('a'), { href: url, download: 'level.json' });
		a.click(); URL.revokeObjectURL(url);
	}

	let fileInput: HTMLInputElement;
	function importJSON() { fileInput?.click(); }
	function onImport(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		file.text().then(text => {
			try {
				const data = JSON.parse(text);
				if (data.tiles) tiles = (data.tiles as RawTile[]).map(migrateTileFrames) as unknown as TileDef[];
				if (data.level) level = data.level;
				texCache.clear();
				selectedId = tiles[0]?.id ?? null;
				requestRender();
				debounceSave();
			} catch { alert('invalid JSON'); }
		});
	}

	// ─── Init ────────────────────────────────────────────────────────────────────
	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape' && editingSlot !== null) { closeSwatchEditor(); return; }
		if (e.target instanceof HTMLInputElement) return;
		if (e.key === 'r' || e.key === 'R') { rotateSelectedCell(); return; }
		if (e.metaKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && selectedTile) {
			e.preventDefault();
			setTileFps((selectedTile.fps ?? 8) + (e.key === 'ArrowUp' ? 1 : -1));
		}
	}

	onMount(() => {
		load();
		if (tiles.length === 0) scaffoldDefaults();
		requestRender();
		window.addEventListener('keydown', onKeyDown);
		const ro = new ResizeObserver(requestRender);
		if (levelCanvas?.parentElement) ro.observe(levelCanvas.parentElement);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			ro.disconnect();
		};
	});
</script>

<!-- hidden file input for import -->
<input bind:this={fileInput} type="file" accept=".json" style="display:none" onchange={onImport} />

<div class="editor">

	<!-- ═══════════════════════════ LEFT: tile library ═══════════════════════════ -->
	<aside class="lib">
		<div class="lib-top">
			<div class="type-tabs">
				{#each ['floor','wall','object'] as t}
					<button class="ttab" class:active={activeType === t}
						onclick={() => activeType = t as TileType}>{t}</button>
				{/each}
			</div>
			<button class="icon-btn" onclick={() => newTile()} title="new tile">+</button>
		</div>

		<div class="tile-list">
			{#each typedTiles as tile (tile.id)}
				<button class="tile-item" class:active={selectedId === tile.id}
					onclick={() => { selectedId = tile.id; activeLayer = tile.type === 'object' ? 'objects' : 'floor'; }}>
					<canvas class="thumb" width={tile.w} height={tile.h}
						style="image-rendering:pixelated; width:32px; height:32px"
						use:thumb={tile}></canvas>
					<span class="tile-name-label">{tile.name}</span>
					{#if tile.group}
						<span class="group-dot" style="background:{groupColor(tile.group)}" title="{tile.group} ({tile.variant})"></span>
					{/if}
				</button>
			{/each}
			{#if typedTiles.length === 0}
				<div class="empty-lib">no {activeType} tiles<br/>press + to create</div>
			{/if}
		</div>

		{#if selectedId}
			<button class="del-btn" onclick={deleteTile}>delete tile</button>
		{/if}
	</aside>

	<!-- ═══════════════════════════ CENTER: pixel editor ════════════════════════ -->
	<main class="pixel-panel">
		{#if selectedTile}
			<!-- tile meta row -->
			<div class="meta-row">
				<input class="name-input" value={selectedTile.name}
					oninput={(e) => renameTile((e.target as HTMLInputElement).value)} />
				<select class="size-select"
					onchange={(e) => {
						const s = SIZES.find(s => s.label === (e.target as HTMLSelectElement).value);
						if (s) resizeTile(s.w, s.h);
					}}>
					{#each SIZES as s}
						<option value={s.label}
							selected={selectedTile.w === s.w && selectedTile.h === s.h}>{s.label}</option>
					{/each}
				</select>
				<!-- tile type toggle -->
				<div class="type-mini">
					{#each ['floor','wall','object'] as t}
						<button class="ttab-mini" class:active={selectedTile.type === t}
							onclick={() => setTileType(t as TileType)}>{t[0]}</button>
					{/each}
				</div>
			</div>

			{#if selectedTile.type === 'wall'}
				<div class="wall-preview-row">
					<canvas bind:this={wallPreviewCanvas} class="wall-preview"></canvas>
				</div>
			{/if}

			{#if selectedTile.type === 'floor'}
				<!-- biome group row -->
				<div class="meta-row group-row">
					<input class="name-input" list="group-suggestions"
						placeholder="group (e.g. grass)"
						value={selectedTile.group ?? ''}
						oninput={(e) => setTileGroup((e.target as HTMLInputElement).value)} />
					<datalist id="group-suggestions">
						{#each knownGroups as g}<option value={g}></option>{/each}
					</datalist>
					<div class="type-mini">
						{#each ['center','edge'] as v}
							<button class="ttab-mini" class:active={selectedTile.variant === v}
								disabled={!selectedTile.group}
								onclick={() => setTileVariant(v as 'center' | 'edge')}>{v}</button>
						{/each}
					</div>
				</div>
			{/if}

			<!-- tools -->
			<div class="tools">
				{#each [['paint','✏','paint'],['erase','⌫','erase'],['fill','◆','fill']] as [id, icon, label]}
					<button class="tool" class:active={activeTool === id}
						title={label}
						onclick={() => activeTool = id as typeof activeTool}>{icon}</button>
				{/each}
				<div class="tool-sep"></div>
				{#each [1,2,3,4,5] as b}
					<button class="brush-btn" class:active={brushSize === b}
						title="brush {b}×{b}"
						onclick={() => brushSize = b}>
						<span class="brush-dot" style="width:{b*3}px;height:{b*3}px"></span>
					</button>
				{/each}
			</div>

			<!-- frame strip -->
			<div class="frame-strip">
				<div class="frame-thumbs">
					{#each selectedTile.frames as frame, i (i)}
						<button class="frame-thumb" class:active={frameIndex === i}
							disabled={isPlaying}
							title="frame {i + 1}"
							onclick={() => selectFrame(i)}>
							<canvas width={selectedTile.w} height={selectedTile.h}
								style="image-rendering:pixelated; width:24px; height:24px"
								use:frameThumb={{ pixels: frame, w: selectedTile.w, h: selectedTile.h }}></canvas>
						</button>
					{/each}
				</div>
				<div class="frame-actions">
					<button class="icon-btn" disabled={isPlaying} title="add frame" onclick={addFrame}>+</button>
					<button class="icon-btn" disabled={isPlaying} title="duplicate frame" onclick={duplicateFrame}>⧉</button>
					<button class="icon-btn" disabled={isPlaying || selectedTile.frames.length === 1} title="remove frame" onclick={removeCurrentFrame}>✕</button>
				</div>
			</div>

			<div class="anim-controls">
				<label class="anim-field" title="onion skin depth (previous frames shown while editing)">
					<span>onion</span>
					<input type="number" min="0" max="8" value={onionDepth}
						onchange={(e) => onionDepth = Math.max(0, Math.min(8, +(e.target as HTMLInputElement).value))} />
				</label>
				<label class="anim-field" title="frames per second (Cmd+Up / Cmd+Down)">
					<span>fps</span>
					<input type="number" min="1" max="60" value={selectedTile.fps ?? 8}
						onchange={(e) => setTileFps(+(e.target as HTMLInputElement).value)} />
				</label>
			</div>

			<!-- edit canvas -->
			<div class="canvas-scroll">
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<canvas bind:this={editCanvas} class="edit-canvas"
					onmousedown={onEditDown}
					onmousemove={onEditMove}
					onmouseup={onEditUp}
					onmouseleave={onEditUp}></canvas>
			</div>

			<!-- color grid -->
			<div class="color-grid">
				{#each colorGrid as color, i (i)}
					<button class="grid-swatch" class:sel={paintColor === color}
						style="background:{color}"
						title={color}
						onclick={() => pickColor(color)}
						ondblclick={(e) => openSwatchEditor(i, e)}>
					</button>
				{/each}
			</div>

			{#if editingSlot !== null}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="popup-backdrop" onclick={closeSwatchEditor}></div>
				<div class="swatch-popup" style="left:{popupPos.x}px; top:{popupPos.y}px;">
					<canvas bind:this={cubeCanvas} class="color-cube"
						onpointerdown={onCubeDown}
						onpointermove={onCubeMove}
						onpointerup={onCubeUp}
						onpointercancel={onCubeUp}></canvas>
					<input class="hex-input" value={paintColor}
						oninput={(e) => onHexInput((e.target as HTMLInputElement).value)} />
				</div>
			{/if}
		{:else}
			<div class="placeholder">select a tile from the library<br/>or press + to create one</div>
		{/if}
	</main>

	<!-- ═══════════════════════════ RIGHT: level editor ═════════════════════════ -->
	<aside class="level-panel">
		<div class="level-top">
			<div class="place-tabs">
				{#each [['floor','▭'],['wall','▣'],['object','◈']] as [mode, icon]}
					<button class="place-tab" class:active={placeMode === mode}
						onclick={() => setPlaceMode(mode as TileType)}>
						<span class="place-icon">{icon}</span>{mode}
					</button>
				{/each}
			</div>
			{#if placeMode === 'wall' && hoverFace}
				<span class="face-badge face-{hoverFace}">{hoverFace} face</span>
			{/if}
			<div class="level-spacer"></div>
			<div class="size-inputs">
				<input type="number" min="2" max="32" value={level.w}
					onchange={(e) => resizeLevel(+(e.target as HTMLInputElement).value, level.h)} />
				<span>×</span>
				<input type="number" min="2" max="32" value={level.h}
					onchange={(e) => resizeLevel(level.w, +(e.target as HTMLInputElement).value)} />
			</div>
			<button class="action-btn" onclick={exportJSON}>export</button>
			<button class="action-btn" onclick={importJSON}>import</button>
		</div>

		<div class="level-canvas-wrap">
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<canvas bind:this={levelCanvas} class="level-canvas"
				onmousedown={onLevelDown}
				onmousemove={onLevelMove}
				onmouseup={onLevelUp}
				onmouseleave={onLevelLeave}
				oncontextmenu={onLevelCtx}
			></canvas>
		</div>

		<div class="level-hint">click to place / erase · drag to paint</div>
	</aside>

</div>

<style>
	:global(*) { box-sizing: border-box; }

	.editor {
		display: grid;
		grid-template-columns: 180px 1fr 1.4fr;
		height: 100vh;
		background: #0d0d0d;
		color: #ddd;
		font-family: monospace;
		font-size: 12px;
		overflow: hidden;
	}

	/* ── shared panel chrome ── */
	aside, main { border-right: 1px solid #1e1e1e; overflow: hidden; display: flex; flex-direction: column; }

	.section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #555; }

	/* ═══════════ LEFT: tile library ═══════════ */
	.lib { background: #0d0d0d; }

	.lib-top {
		display: flex; align-items: center; justify-content: space-between;
		padding: 8px 8px 6px;
		border-bottom: 1px solid #1e1e1e;
		gap: 4px;
	}

	.type-tabs { display: flex; gap: 2px; }

	.ttab {
		background: none; border: none; border-bottom: 2px solid transparent;
		color: #555; font-family: monospace; font-size: 10px; padding: 3px 6px;
		cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em;
	}
	.ttab:hover { color: #999; }
	.ttab.active { border-bottom-color: #6ddb6d; color: #ccc; }

	.icon-btn {
		background: none; border: 1px solid #333; border-radius: 3px;
		color: #aaa; width: 22px; height: 22px; cursor: pointer;
		font-size: 16px; display: flex; align-items: center; justify-content: center;
		flex-shrink: 0;
	}
	.icon-btn:hover { border-color: #888; color: #fff; }

	.tile-list { flex: 1; overflow-y: auto; padding: 4px; display: flex; flex-direction: column; gap: 2px; }

	.tile-item {
		display: flex; align-items: center; gap: 6px;
		padding: 4px 6px; border-radius: 4px; cursor: pointer;
		background: none; border: 1px solid transparent;
		color: #aaa; text-align: left; width: 100%;
	}
	.tile-item:hover { background: #161616; }
	.tile-item.active { background: #1a1a2e; border-color: #2a2a6e; color: #fff; }

	.thumb { flex-shrink: 0; border: 1px solid #222; border-radius: 2px; }

	.tile-name-label { font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	.group-dot {
		width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
		margin-left: auto;
	}

	.empty-lib { padding: 16px 8px; color: #333; text-align: center; line-height: 1.6; }

	.del-btn {
		margin: 8px; padding: 5px 8px; background: none;
		border: 1px solid #3a1515; border-radius: 4px;
		color: #6b2020; font-family: monospace; font-size: 11px;
		cursor: pointer;
	}
	.del-btn:hover { border-color: #c0392b; color: #e74c3c; }

	/* ═══════════ CENTER: pixel editor ═══════════ */
	.pixel-panel { background: #111; align-items: stretch; }

	.meta-row {
		display: flex; align-items: center; gap: 6px;
		padding: 8px; border-bottom: 1px solid #1e1e1e; flex-shrink: 0;
	}

	.group-row { border-top: 1px solid #1a1a1a; }

	.name-input {
		flex: 1; background: #0d0d0d; border: 1px solid #2a2a2a; border-radius: 3px;
		color: #eee; font-family: monospace; font-size: 12px; padding: 4px 6px;
		outline: none; min-width: 0;
	}
	.name-input:focus { border-color: #555; }

	.size-select {
		background: #0d0d0d; border: 1px solid #2a2a2a; border-radius: 3px;
		color: #aaa; font-family: monospace; font-size: 11px; padding: 4px 4px;
		cursor: pointer; outline: none;
	}

	.type-mini { display: flex; gap: 2px; }
	.ttab-mini {
		background: none; border: none; border-bottom: 2px solid transparent;
		color: #444; font-family: monospace; font-size: 10px; padding: 2px 4px;
		cursor: pointer; text-transform: uppercase;
	}
	.ttab-mini:hover { color: #999; }
	.ttab-mini.active { border-bottom-color: #6ddb6d; color: #ccc; }

	.tools {
		display: flex; gap: 4px; padding: 6px 8px; flex-shrink: 0;
		border-bottom: 1px solid #1a1a1a;
	}

	.tool {
		background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 4px;
		color: #888; font-size: 14px; padding: 4px 10px;
		cursor: pointer;
	}
	.tool.active { background: #1e1e3e; border-color: #4444aa; color: #aaaaff; }
	.tool:hover:not(.active) { background: #222; color: #ccc; }

	.tool-sep { width: 1px; background: #2a2a2a; margin: 2px 2px; align-self: stretch; }

	.brush-btn {
		background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 4px;
		padding: 4px 6px; cursor: pointer;
		display: flex; align-items: center; justify-content: center;
		min-width: 28px; min-height: 28px;
	}
	.brush-btn.active { background: #1e1e3e; border-color: #4444aa; }
	.brush-btn:hover:not(.active) { background: #222; }

	.brush-dot {
		display: block; background: #aaa; border-radius: 1px;
	}
	.brush-btn.active .brush-dot { background: #aaaaff; }

	.frame-strip {
		display: flex; align-items: center; justify-content: space-between; gap: 8px;
		padding: 6px 8px; border-bottom: 1px solid #1a1a1a; flex-shrink: 0;
	}
	.frame-thumbs { display: flex; gap: 4px; overflow-x: auto; flex: 1; }
	.frame-thumb {
		background: none; border: 1px solid #2a2a2a; border-radius: 3px;
		padding: 2px; cursor: pointer; flex-shrink: 0; line-height: 0;
	}
	.frame-thumb.active { border-color: #6ddb6d; }
	.frame-thumb:disabled { cursor: default; opacity: 0.6; }
	.frame-actions { display: flex; gap: 4px; flex-shrink: 0; }
	.icon-btn:disabled { opacity: 0.35; cursor: default; }

	.anim-controls { display: flex; align-items: center; gap: 10px; padding: 4px 8px 8px; flex-shrink: 0; }
	.anim-field { display: flex; align-items: center; gap: 4px; color: #666; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
	.anim-field input {
		width: 40px; background: #0d0d0d; border: 1px solid #2a2a2a; border-radius: 3px;
		color: #aaa; font-family: monospace; font-size: 11px; padding: 3px 4px; text-align: center; outline: none;
	}

	.canvas-scroll {
		flex: 1; overflow: auto; display: flex;
		align-items: center; justify-content: center;
		padding: 16px;
	}

	.edit-canvas {
		cursor: crosshair;
		image-rendering: pixelated;
		display: block;
	}

	.color-cube {
		display: block;
		cursor: crosshair;
		touch-action: none;
	}

	.popup-backdrop {
		position: fixed; inset: 0; background: transparent; border: none; padding: 0;
		z-index: 40; cursor: default;
	}
	.swatch-popup {
		position: fixed; z-index: 41; background: #161616; border: 1px solid #333;
		border-radius: 6px; padding: 10px; box-shadow: 0 4px 16px rgba(0,0,0,0.6);
		display: flex; flex-direction: column; align-items: center; gap: 8px;
	}
	.hex-input {
		width: 100px; background: #0d0d0d; border: 1px solid #2a2a2a; border-radius: 3px;
		color: #eee; font-family: monospace; font-size: 12px; padding: 4px 6px;
		text-align: center; outline: none;
	}

	.wall-preview-row {
		display: flex; justify-content: center; padding: 6px;
		border-bottom: 1px solid #1a1a1a; flex-shrink: 0;
	}
	.wall-preview {
		display: block;
	}

	.color-grid {
		display: grid; grid-template-columns: repeat(9, 1fr); gap: 4px;
		padding: 8px; border-top: 1px solid #1e1e1e; flex-shrink: 0;
	}

	.grid-swatch {
		width: 100%; aspect-ratio: 1; border-radius: 3px;
		border: 2px solid #2a2a2a; cursor: pointer; padding: 0;
	}
	.grid-swatch.sel { border-color: #fff; }
	.grid-swatch:hover { border-color: #666; }

	.placeholder {
		flex: 1; display: flex; align-items: center; justify-content: center;
		color: #333; text-align: center; line-height: 1.8;
	}

	/* ═══════════ RIGHT: level editor ═══════════ */
	.level-panel { background: #0a0a0a; border-right: none; }

	.level-top {
		display: flex; align-items: center; gap: 8px; flex-shrink: 0;
		padding: 8px 10px; border-bottom: 1px solid #1e1e1e; flex-wrap: wrap;
	}

	.size-inputs { display: flex; align-items: center; gap: 4px; }
	.size-inputs input {
		width: 42px; background: #0d0d0d; border: 1px solid #2a2a2a; border-radius: 3px;
		color: #aaa; font-family: monospace; font-size: 11px; padding: 3px 4px;
		text-align: center; outline: none;
	}
	.size-inputs span { color: #333; }

	.layer-tabs { display: flex; gap: 2px; }
	.layer-tabs button {
		background: none; border: 1px solid #222; border-radius: 3px;
		color: #444; font-family: monospace; font-size: 10px; padding: 3px 7px;
		cursor: pointer; text-transform: uppercase;
	}
	.layer-tabs button.active { border-color: #555; color: #ccc; }

	.action-btn {
		background: none; border: 1px solid #2a2a2a; border-radius: 3px;
		color: #666; font-family: monospace; font-size: 10px; padding: 3px 8px;
		cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em;
	}
	.action-btn:hover { border-color: #666; color: #ccc; }

	.level-canvas-wrap { flex: 1; overflow: hidden; position: relative; }

	.level-canvas {
		display: block; width: 100%; height: 100%; cursor: crosshair;
	}

	.level-hint {
		padding: 4px 10px; color: #2a2a2a; font-size: 10px; flex-shrink: 0;
	}

	.place-tabs { display: flex; gap: 2px; }

	.place-tab {
		background: none; border: none; border-bottom: 2px solid transparent;
		color: #444; font-family: monospace; font-size: 11px;
		padding: 3px 8px; cursor: pointer;
		display: flex; align-items: center; gap: 4px;
	}
	.place-tab:hover { color: #999; }
	.place-tab.active { border-bottom-color: #6ddb6d; color: #6ddb6d; }

	.place-icon { font-size: 10px; opacity: 0.7; }

	.face-badge {
		font-size: 10px; font-family: monospace;
		padding: 2px 6px; border-radius: 3px; font-weight: bold;
		letter-spacing: 0.05em;
	}
	.face-top   { background: rgba(255,220,60,0.25); color: #ffe44e; }
	.face-left  { background: rgba(255,220,60,0.18); color: #d4be3a; }
	.face-right { background: rgba(255,220,60,0.12); color: #aa9830; }

	.level-spacer { flex: 1; }
</style>
