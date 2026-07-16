<script lang="ts">
	import { onMount } from 'svelte';

	// ─── Isometric constants ─────────────────────────────────────────────────────
	const ISO_W = 64;
	const ISO_H = 32;
	const ISO_BOX = 40;

	// ─── Palette: 32 colors ──────────────────────────────────────────────────────
	const PALETTE = [
		'#000000','#1a1a1a','#333333','#555555','#777777','#999999','#bbbbbb','#ffffff',
		'#ff0000','#ff5500','#ff9900','#ffcc00','#ffff00','#aaff00','#00ff44','#00ff99',
		'#00ffff','#00aaff','#0055ff','#2200ff','#7700ff','#cc00ff','#ff00cc','#ff0055',
		'#6b2100','#6b4400','#556b00','#006b33','#00446b','#00006b','#3d006b','#6b003d',
	];

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
		pixels: string[];
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

	// ─── App state ───────────────────────────────────────────────────────────────
	let tiles    = $state<TileDef[]>([]);
	let selectedId  = $state<string | null>(null);
	let activeType  = $state<TileType>('floor');
	let paintColor    = $state(PALETTE[7]);
	let activeTool    = $state<'paint' | 'erase' | 'fill'>('paint');
	let brushSize     = $state(1);
	let recentColors  = $state<string[]>([]);

	function pickColor(color: string) {
		paintColor = color;
		if (activeTool === 'erase') activeTool = 'paint';
		// push to front, dedupe, cap at 3
		recentColors = [color, ...recentColors.filter(c => c !== color)].slice(0, 3);
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

	// ─── Derived ─────────────────────────────────────────────────────────────────
	let selectedTile = $derived(tiles.find(t => t.id === selectedId) ?? null);
	let typedTiles   = $derived(tiles.filter(t => t.type === activeType));
	let editScale    = $derived(
		selectedTile ? Math.max(4, Math.floor(360 / Math.max(selectedTile.w, selectedTile.h))) : 20
	);

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
			for (let y = 0; y < tile.h; y++)
				for (let x = 0; x < tile.w; x++) {
					const col = tile.pixels[y * tile.w + x];
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

		// pixels
		for (let y = 0; y < tile.h; y++)
			for (let x = 0; x < tile.w; x++) {
				const c = tile.pixels[y * tile.w + x];
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
		void selectedTile?.pixels.join('');
		void editScale;
		redrawEdit();
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

		let newPixels: string[];

		if (activeTool === 'fill') {
			const target = tile.pixels[y * tile.w + x];
			const color  = paintColor;
			newPixels = [...tile.pixels];
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
			newPixels   = [...tile.pixels];
			for (let dy = -half; dy < brushSize - half; dy++) {
				for (let dx = -half; dx < brushSize - half; dx++) {
					const bx = x + dx, by = y + dy;
					if (bx < 0 || bx >= tile.w || by < 0 || by >= tile.h) continue;
					newPixels[by * tile.w + bx] = color;
				}
			}
		}

		tiles = tiles.map(t => t.id === tile.id ? { ...t, pixels: newPixels } : t);
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
			pixels: new Array(w * h).fill(''),
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

	function setTileType(type: TileType) {
		if (!selectedId) return;
		tiles = tiles.map(t => t.id === selectedId ? { ...t, type } : t);
		requestRender();
		debounceSave();
	}

	function resizeTile(w: number, h: number) {
		if (!selectedId) return;
		tiles = tiles.map(t => t.id === selectedId
			? { ...t, w, h, pixels: new Array(w * h).fill('') } : t);
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
	function thumb(node: HTMLCanvasElement, tile: TileDef) {
		function draw(t: TileDef) {
			const ctx = node.getContext('2d')!;
			ctx.clearRect(0, 0, t.w, t.h);
			for (let y = 0; y < t.h; y++)
				for (let x = 0; x < t.w; x++) {
					const c = t.pixels[y * t.w + x];
					if (c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
				}
		}
		draw(tile);
		return { update: draw };
	}

	// ─── Persistence ──────────────────────────────────────────────────────────────
	let saveHandle = 0;
	function debounceSave() {
		clearTimeout(saveHandle);
		saveHandle = setTimeout(() => {
			try {
				localStorage.setItem('editor-tiles', JSON.stringify(tiles));
				localStorage.setItem('editor-level', JSON.stringify(level));
			} catch {}
		}, 600) as unknown as number;
	}

	function load() {
		try {
			const t = localStorage.getItem('editor-tiles');
			const l = localStorage.getItem('editor-level');
			if (t) tiles = JSON.parse(t);
			if (l) {
				const raw = JSON.parse(l) as Level;
				// normalise any legacy string cells
				level = {
					...raw,
					floor:   raw.floor.map(row   => row.map(c => parseCell(c))),
					objects: raw.objects.map(row => row.map(c => parseCell(c))),
				};
			}
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
				if (data.tiles) tiles = data.tiles;
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
		if (e.target instanceof HTMLInputElement) return;
		const i = parseInt(e.key) - 1;
		if (i >= 0 && i < 3 && recentColors[i]) pickColor(recentColors[i]);
		if (e.key === 'r' || e.key === 'R') rotateSelectedCell();
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

			<!-- edit canvas -->
			<div class="canvas-scroll">
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<canvas bind:this={editCanvas} class="edit-canvas"
					onmousedown={onEditDown}
					onmousemove={onEditMove}
					onmouseup={onEditUp}
					onmouseleave={onEditUp}></canvas>
			</div>

			<!-- recent colors -->
			<div class="recent-row">
				{#each [0, 1, 2] as i}
					<button class="recent-slot" class:sel={recentColors[i] === paintColor}
						style={recentColors[i] ? `background:${recentColors[i]}` : ''}
						title="slot {i+1} — press {i+1}"
						disabled={!recentColors[i]}
						onclick={() => recentColors[i] && pickColor(recentColors[i])}>
						<span class="recent-key">{i + 1}</span>
					</button>
				{/each}
			</div>

			<!-- palette -->
			<div class="palette">
				{#each PALETTE as color}
					<button class="pswatch" class:sel={paintColor === color}
						style="background:{color}"
						aria-label={color}
						onclick={() => pickColor(color)}>
					</button>
				{/each}
				<button class="pswatch eraser" class:sel={activeTool === 'erase'}
					title="erase"
					onclick={() => activeTool = 'erase'}>∅</button>
			</div>
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
		background: none; border: 1px solid transparent; border-radius: 3px;
		color: #555; font-family: monospace; font-size: 10px; padding: 3px 6px;
		cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em;
	}
	.ttab.active { border-color: #444; color: #ccc; }

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
		background: none; border: 1px solid #222; border-radius: 2px;
		color: #444; font-family: monospace; font-size: 10px; padding: 2px 4px;
		cursor: pointer; text-transform: uppercase;
	}
	.ttab-mini.active { border-color: #555; color: #ccc; }

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

	.palette {
		display: flex; flex-wrap: wrap; gap: 3px;
		padding: 8px; border-top: 1px solid #1e1e1e; flex-shrink: 0;
	}

	.pswatch {
		width: 18px; height: 18px; border-radius: 2px;
		border: 2px solid transparent; cursor: pointer; padding: 0; flex-shrink: 0;
	}
	.pswatch.sel { border-color: #fff; }
	.recent-row {
		display: flex; gap: 6px; padding: 6px 8px 2px;
		border-top: 1px solid #1e1e1e;
	}

	.recent-slot {
		width: 36px; height: 36px; border-radius: 4px;
		border: 2px solid #2a2a2a; cursor: pointer; padding: 0;
		background: #111; position: relative;
		display: flex; align-items: flex-end; justify-content: flex-end;
	}
	.recent-slot:disabled { opacity: 0.3; cursor: default; }
	.recent-slot.sel { border-color: #fff; }
	.recent-slot:not(:disabled):hover { border-color: #666; }

	.recent-key {
		font-size: 9px; font-family: monospace; color: rgba(255,255,255,0.5);
		line-height: 1; padding: 1px 2px;
		text-shadow: 0 0 3px #000;
	}

	.pswatch.eraser {
		background: #111; color: #555; font-size: 11px;
		border-color: #333; display: flex; align-items: center; justify-content: center;
	}
	.pswatch.eraser.sel { border-color: #e74c3c; color: #e74c3c; }

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
		background: none; border: 1px solid #1e1e1e; border-radius: 4px;
		color: #444; font-family: monospace; font-size: 11px;
		padding: 3px 8px; cursor: pointer;
		display: flex; align-items: center; gap: 4px;
	}
	.place-tab:hover { border-color: #444; color: #999; }
	.place-tab.active { border-color: #3a7a3a; color: #6ddb6d; background: #0f1f0f; }

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
