<script lang="ts">
	import { onMount } from 'svelte';
	import { FONT, CHAR_W, FONT_H } from './led-font.js';

	let {
		text  = 'WIMMY THE SCROLL',
		color = '#ff9dd0',
	}: { text?: string; color?: string } = $props();

	let canvas: HTMLCanvasElement;

	// 128×16 grid in 420×64px panel
	const COLS    = 128;
	const ROWS    = 16;
	const PAD     = 8;            // dead LED columns on each side
	const TEXT_W  = COLS - PAD * 2; // 89 active columns
	const SPACE_W = 3;
	const ROW_OFF = Math.floor((ROWS - FONT_H) / 2); // center text vertically

	function buildBitmap(str: string): boolean[][] {
		const grid: boolean[][] = Array.from({ length: FONT_H }, () => []);
		for (const ch of str.toUpperCase()) {
			const rows = FONT[ch] ?? FONT[' '];
			const w    = ch === ' ' ? SPACE_W : CHAR_W;
			for (let r = 0; r < FONT_H; r++) {
				for (let c = 0; c < w; c++) {
					grid[r].push(!!(rows[r] & (1 << (CHAR_W - 1 - c))));
				}
				grid[r].push(false); // 1-col gap between characters
			}
		}
		return grid;
	}

	type ArrowLevel = 'bright' | 'medium' | 'dim' | null;

	// pian animation loaded from localStorage at mount time
	// 8×8 grid: cols 1-5 map to the 5-wide (CHAR_W) arrow column (lc=0→col1 … lc=4→col5)
	// rows 0-7 map to LED grid rows starting at ANIM_TOP
	const ANIM_TOP = 4; // align with text baseline (ROW_OFF)
	const ANIM_PIAN_KEY = 'pian-anim-v2';

	// default: chevrons cascade downward — see animations/arrows-running.txt
	const _Z = [0,0,0,0,0,0,0,0];
	const _T = [0,0,0,1,0,0,0,0];
	const _M = [0,0,1,0,1,0,0,0];
	const _B = [0,1,0,0,0,1,0,0];
	const DEFAULT_ANIM_FRAMES: number[][][] = [
		[_T,_Z,_Z,_Z,_Z,_Z,_Z,_Z], // F01
		[_M,_T,_Z,_Z,_Z,_Z,_Z,_Z], // F02
		[_B,_M,_T,_Z,_Z,_Z,_Z,_Z], // F03
		[_Z,_B,_M,_T,_Z,_Z,_Z,_Z], // F04
		[_T,_Z,_B,_M,_T,_Z,_Z,_Z], // F05
		[_M,_T,_Z,_B,_M,_T,_Z,_Z], // F06
		[_B,_M,_T,_Z,_B,_M,_T,_Z], // F07
		[_Z,_B,_M,_T,_Z,_B,_M,_T], // F08 ← loopFrom
		[_T,_Z,_B,_M,_T,_Z,_B,_M], // F09
		[_M,_T,_Z,_B,_M,_T,_Z,_B], // F10
		[_B,_M,_T,_Z,_B,_M,_T,_Z], // F11
	];
	const DEFAULT_ANIM_LOOP_FROM = 7;
	const DEFAULT_ANIM_FPS = 3;

	let animFrames:   number[][][] = DEFAULT_ANIM_FRAMES;
	let animLoopFrom: number = DEFAULT_ANIM_LOOP_FROM;
	let animFps:      number = DEFAULT_ANIM_FPS;

	function arrowFill(col: number, row: number, frameIdx: number, ac: number): ArrowLevel | null {
		const lc = col - ac;
		if (lc < 0 || lc >= CHAR_W) return null;
		if (animFrames.length === 0) return null;
		const frame = animFrames[frameIdx];
		if (!frame) return null;
		const pr = row - ANIM_TOP; // pian row (0-7)
		if (pr < 0 || pr >= frame.length) return null;
		const pc = lc + 1;         // pian col (cols 1-5 of the 8-wide grid)
		const val = frame[pr]?.[pc] ?? 0;
		if (val === 0) return null;
		if (val === 2) return 'medium';
		return 'bright';
	}

	const arrowLeft  = arrowFill;
	const arrowRight = arrowFill;

	onMount(() => {
		// load pian animation from localStorage
		try {
			const raw = localStorage.getItem(ANIM_PIAN_KEY);
			if (raw) {
				const p = JSON.parse(raw);
				if (Array.isArray(p.frames) && p.frames.length > 0) {
					animFrames   = p.frames;
					animLoopFrom = typeof p.loopFrom === 'number' && p.loopFrom >= 0 ? p.loopFrom : 0;
					animFps      = typeof p.fps      === 'number' && p.fps      >  0 ? p.fps      : 3;
				}
			}
		} catch { /* no animation stored yet */ }

		const r16 = parseInt(color.slice(1, 3), 16);
		const g16 = parseInt(color.slice(3, 5), 16);
		const b16 = parseInt(color.slice(5, 7), 16);
		const glowRgba     = `rgba(${r16},${g16},${b16},0.14)`;
		const offRgba      = `rgba(${r16},${g16},${b16},0.07)`;
		const arrowMedRgba = `rgba(${r16},${g16},${b16},0.55)`;
		const arrowDimRgba = `rgba(${r16},${g16},${b16},0.22)`;

		const updateSize = () => {
			canvas.width  = canvas.offsetWidth  * devicePixelRatio;
			canvas.height = canvas.offsetHeight * devicePixelRatio;
		};
		updateSize();
		const ro = new ResizeObserver(updateSize);
		ro.observe(canvas);

		const bitmap   = buildBitmap(text);
		const textCols = bitmap[0].length;

		const target = (TEXT_W - textCols + 1) / 2; // +1 accounts for trailing gap col

		// arrows fixed 4 LEDs from each edge of the board
		const arrowColLeft  = 4;
		const arrowColRight = COLS - CHAR_W - 4;

		let offset        = TEXT_W;
		let stopped       = false;
		let arrowStarted  = false;
		let arrowFrame    = 0;
		let arrowTimer: ReturnType<typeof setInterval> | null = null;
		let lastTime      = 0;
		let raf: number;

		function isOn(taCol: number, row: number): boolean {
			const fr = row - ROW_OFF;
			if (fr < 0 || fr >= FONT_H) return false;
			const sc = taCol - Math.round(offset);
			if (sc < 0 || sc >= textCols) return false;
			return bitmap[fr][sc];
		}

		function draw(time: number) {
			const dt = Math.min((time - lastTime) / 1000, 0.05);
			lastTime = time;

			if (!stopped) {
				offset -= 33 * dt;
				if (offset <= target) { offset = target; stopped = true; }
			} else if (!arrowStarted) {
				arrowStarted = true;
				arrowTimer = setInterval(() => {
					const total = animFrames.length;
					const loopFrom = Math.min(animLoopFrom, total - 1);
					arrowFrame = total > 0
						? (arrowFrame + 1 >= total ? loopFrom : arrowFrame + 1)
						: 0;
				}, Math.round(1000 / animFps));
			}

			const ctx = canvas.getContext('2d')!;
			const W   = canvas.width;
			const H   = canvas.height;
			const cW  = W / COLS;
			const cH  = H / ROWS;
			const rad = Math.min(cW, cH) * 0.38;

			ctx.clearRect(0, 0, W, H);

			for (let row = 0; row < ROWS; row++) {
				for (let col = 0; col < COLS; col++) {
					const inZone = col >= PAD && col < COLS - PAD;
					const on     = inZone && isOn(col - PAD, row);
					const arrow  = stopped
						? (arrowLeft(col, row, arrowFrame, arrowColLeft) ?? arrowRight(col, row, arrowFrame, arrowColRight))
						: null;
					const x      = (col + 0.5) * cW;
					const y      = (row + 0.5) * cH;

					if (on || arrow === 'bright') {
						ctx.beginPath();
						ctx.arc(x, y, rad * 2.6, 0, Math.PI * 2);
						ctx.fillStyle = glowRgba;
						ctx.fill();
						ctx.beginPath();
						ctx.arc(x, y, rad, 0, Math.PI * 2);
						ctx.fillStyle = color;
						ctx.fill();
					} else if (arrow === 'medium') {
						ctx.beginPath();
						ctx.arc(x, y, rad * 1.6, 0, Math.PI * 2);
						ctx.fillStyle = glowRgba;
						ctx.fill();
						ctx.beginPath();
						ctx.arc(x, y, rad, 0, Math.PI * 2);
						ctx.fillStyle = arrowMedRgba;
						ctx.fill();
					} else if (arrow === 'dim') {
						ctx.beginPath();
						ctx.arc(x, y, rad, 0, Math.PI * 2);
						ctx.fillStyle = arrowDimRgba;
						ctx.fill();
					} else {
						ctx.beginPath();
						ctx.arc(x, y, rad, 0, Math.PI * 2);
						ctx.fillStyle = offRgba;
						ctx.fill();
					}
				}
			}

			raf = requestAnimationFrame(draw);
		}

		raf = requestAnimationFrame(t => { lastTime = t; draw(t); });
		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
			if (arrowTimer) clearInterval(arrowTimer);
		};
	});
</script>

<canvas bind:this={canvas} class="led-display"></canvas>

<style>
	.led-display {
		position: absolute;
		top: 32px;
		left: 50%;
		transform: translateX(-50%);
		width: 420px;
		height: 64px;
		display: block;
		background: rgb(6, 1, 4);
	}

	@media screen and (max-width: 699px) {
		.led-display {
			width: 300px;
			height: 53px;
		}
	}
</style>
