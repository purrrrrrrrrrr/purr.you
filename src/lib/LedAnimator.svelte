<script lang="ts">
	let { open = false, onclose }: { open?: boolean; onclose: () => void } = $props();

	const SIZE = 8;
	const COLOR = '#ff9dd0';

	function emptyFrame(): boolean[][] {
		return Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
	}

	let frames      = $state<boolean[][][]>([emptyFrame()]);
	let current     = $state(0);
	let playing     = $state(false);
	let fps         = $state(3);
	let drawMode    = $state<boolean | null>(null);
	let copied      = $state(false);

	// play loop
	$effect(() => {
		if (!playing) return;
		const id = setInterval(() => {
			current = (current + 1) % frames.length;
		}, 1000 / fps);
		return () => clearInterval(id);
	});

	function setCell(row: number, col: number, val: boolean) {
		frames = frames.map((fr, fi) =>
			fi === current
				? fr.map((r, ri) => ri === row ? r.map((c, ci) => ci === col ? val : c) : r)
				: fr
		);
	}

	function onCellDown(e: MouseEvent, row: number, col: number) {
		e.preventDefault();
		drawMode = !frames[current][row][col];
		setCell(row, col, drawMode);
	}

	function onCellEnter(row: number, col: number) {
		if (drawMode === null) return;
		setCell(row, col, drawMode);
	}

	function stopDraw() { drawMode = null; }

	function addFrame()  { frames = [...frames, emptyFrame()]; current = frames.length - 1; }
	function dupFrame()  {
		const copy = frames[current].map(r => [...r]);
		const next = [...frames];
		next.splice(current + 1, 0, copy);
		frames = next;
		current = current + 1;
	}
	function delFrame()  {
		if (frames.length === 1) return;
		frames = frames.filter((_, i) => i !== current);
		current = Math.min(current, frames.length - 1);
	}
	function clearFrame() { frames = frames.map((fr, fi) => fi === current ? emptyFrame() : fr); }

	function copyData() {
		const out = frames.map((fr, fi) => {
			const rows = fr.map(row => row.map(c => c ? '1' : '0').join(' '));
			return `// frame ${fi + 1}\n[${fr.map(row => parseInt(row.map(c => c ? '1' : '0').join(''), 2)).join(', ')}]`;
		}).join(',\n');
		navigator.clipboard.writeText(out);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget) onclose();
	}
</script>

{#if open}
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onmousedown={handleBackdrop}>
	<div class="modal" role="dialog" aria-modal="true" aria-label="LED Animator">

		<!-- header -->
		<div class="header">
			<span class="title">LED ANIMATOR 8×8</span>
			<button class="close-btn" onclick={onclose}>×</button>
		</div>

		<!-- frame strip -->
		<div class="frame-strip">
			{#each frames as fr, fi}
				<button
					class="thumb-btn"
					class:active={fi === current}
					onclick={() => { if (!playing) current = fi; }}
					aria-label="Frame {fi + 1}"
				>
					<svg width="40" height="40" viewBox="0 0 8 8">
						{#each fr as row, ri}
							{#each row as cell, ci}
								<rect
									x={ci} y={ri} width="1" height="1"
									fill={COLOR}
									opacity={cell ? 1 : 0.08}
								/>
							{/each}
						{/each}
					</svg>
					<span class="thumb-label">{fi + 1}</span>
				</button>
			{/each}
			<button class="add-frame-btn" onclick={addFrame} aria-label="Add frame">+</button>
		</div>

		<!-- 8×8 grid -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="grid"
			onmouseup={stopDraw}
			onmouseleave={stopDraw}
		>
			{#each frames[current] as row, ri}
				{#each row as cell, ci}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="cell"
						class:on={cell}
						onmousedown={(e) => onCellDown(e, ri, ci)}
						onmouseenter={() => onCellEnter(ri, ci)}
					></div>
				{/each}
			{/each}
		</div>

		<!-- controls -->
		<div class="controls">
			<div class="ctrl-row">
				<button class="ctrl-btn play-btn" onclick={() => (playing = !playing)}>
					{playing ? '⏹ STOP' : '▶ PLAY'}
				</button>
				<button class="ctrl-btn" onclick={dupFrame}>DUP</button>
				<button class="ctrl-btn" onclick={delFrame} disabled={frames.length === 1}>DEL</button>
				<button class="ctrl-btn" onclick={clearFrame}>CLR</button>
				<button class="ctrl-btn copy-btn" class:copied onclick={copyData}>
					{copied ? 'COPIED!' : 'COPY'}
				</button>
			</div>
			<div class="fps-row">
				<span class="fps-label">FPS</span>
				{#each [1, 3, 6, 12] as f}
					<button
						class="fps-btn"
						class:active={fps === f}
						onclick={() => { fps = f; }}
					>{f}</button>
				{/each}
			</div>
		</div>
	</div>
</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 10000;
		background: rgba(0, 0, 0, 0.75);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.modal {
		background: rgb(6, 1, 4);
		border: 1px solid rgba(255, 157, 208, 0.2);
		display: flex;
		flex-direction: column;
		user-select: none;
	}

	/* ── header ── */
	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px 10px;
		border-bottom: 1px solid rgba(255, 157, 208, 0.12);
	}
	.title {
		font-family: monospace;
		font-size: 11px;
		letter-spacing: 0.14em;
		color: rgba(255, 157, 208, 0.45);
	}
	.close-btn {
		background: none;
		border: none;
		color: rgba(255, 157, 208, 0.5);
		font-size: 26px;
		line-height: 1;
		cursor: pointer;
		padding: 0 2px;
		font-weight: 200;
	}
	.close-btn:hover { color: #ff9dd0; }

	/* ── frame strip ── */
	.frame-strip {
		display: flex;
		gap: 6px;
		padding: 10px 14px;
		overflow-x: auto;
		border-bottom: 1px solid rgba(255, 157, 208, 0.12);
	}

	.thumb-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		background: rgba(255, 157, 208, 0.04);
		border: 1px solid rgba(255, 157, 208, 0.1);
		padding: 4px;
		cursor: pointer;
		opacity: 0.6;
		transition: opacity 0.1s, border-color 0.1s;
		flex-shrink: 0;
	}
	.thumb-btn.active {
		border-color: rgba(255, 157, 208, 0.5);
		opacity: 1;
	}
	.thumb-btn:hover { opacity: 0.9; }

	.thumb-label {
		font-family: monospace;
		font-size: 8px;
		color: rgba(255, 157, 208, 0.4);
	}

	.add-frame-btn {
		width: 48px;
		background: none;
		border: 1px dashed rgba(255, 157, 208, 0.2);
		color: rgba(255, 157, 208, 0.35);
		font-size: 20px;
		cursor: pointer;
		flex-shrink: 0;
		transition: color 0.1s, border-color 0.1s;
	}
	.add-frame-btn:hover {
		color: #ff9dd0;
		border-color: rgba(255, 157, 208, 0.5);
	}

	/* ── 8×8 grid ── */
	.grid {
		display: grid;
		grid-template-columns: repeat(8, 36px);
		grid-template-rows: repeat(8, 36px);
		gap: 4px;
		padding: 16px;
		cursor: crosshair;
	}

	.cell {
		border-radius: 50%;
		background: rgba(255, 157, 208, 0.07);
		transition: background 0.05s, box-shadow 0.05s;
	}
	.cell.on {
		background: #ff9dd0;
		box-shadow: 0 0 10px 4px rgba(255, 157, 208, 0.35);
	}
	.cell:hover { background: rgba(255, 157, 208, 0.2); }
	.cell.on:hover { background: #ffb8d8; }

	/* ── controls ── */
	.controls {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 16px 14px;
		border-top: 1px solid rgba(255, 157, 208, 0.12);
	}

	.ctrl-row {
		display: flex;
		gap: 6px;
	}

	.ctrl-btn {
		flex: 1;
		background: rgba(255, 157, 208, 0.06);
		border: 1px solid rgba(255, 157, 208, 0.15);
		color: rgba(255, 157, 208, 0.6);
		font-family: monospace;
		font-size: 10px;
		letter-spacing: 0.08em;
		padding: 7px 4px;
		cursor: pointer;
		transition: background 0.1s, color 0.1s;
	}
	.ctrl-btn:hover:not(:disabled) {
		background: rgba(255, 157, 208, 0.14);
		color: #ff9dd0;
	}
	.ctrl-btn:disabled { opacity: 0.3; cursor: not-allowed; }

	.play-btn {
		flex: 2;
		color: rgba(255, 157, 208, 0.85);
		border-color: rgba(255, 157, 208, 0.3);
	}
	.copy-btn.copied {
		color: #a8f0a8;
		border-color: rgba(168, 240, 168, 0.4);
	}

	.fps-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.fps-label {
		font-family: monospace;
		font-size: 9px;
		color: rgba(255, 157, 208, 0.3);
		letter-spacing: 0.1em;
		margin-right: 2px;
	}
	.fps-btn {
		width: 32px;
		padding: 4px 0;
		background: rgba(255, 157, 208, 0.04);
		border: 1px solid rgba(255, 157, 208, 0.12);
		color: rgba(255, 157, 208, 0.4);
		font-family: monospace;
		font-size: 10px;
		cursor: pointer;
		transition: background 0.1s, color 0.1s;
	}
	.fps-btn.active {
		background: rgba(255, 157, 208, 0.15);
		color: #ff9dd0;
		border-color: rgba(255, 157, 208, 0.4);
	}
	.fps-btn:hover { color: #ff9dd0; }
</style>
