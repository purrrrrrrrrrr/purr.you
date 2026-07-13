<script lang="ts">
	import { FONT, CHAR_W, FONT_H } from './led-font.js';

	let { open = false, onclose }: { open?: boolean; onclose: () => void } = $props();

	const color = '#ff9dd0';
	const LED_PX = 10;          // pixels per LED dot
	const GAP    = 20;          // px between character cells
	const LABEL_H = 18;         // px reserved below each cell for the char label

	const CELL_W = CHAR_W * LED_PX;
	const CELL_H = FONT_H * LED_PX;

	const GROUPS = [
		{ label: 'Letters',     chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('') },
		{ label: 'Digits',      chars: '0123456789'.split('') },
		{ label: 'Punctuation', chars: ['.', ',', '!', '?', ':', ';', '-', '+', '=',
		                                '/', '\\', '(', ')', '[', ']', "'", '"',
		                                '@', '#', '$', '%', '&', '*', '_',
		                                '<', '>', '^', '~'] },
	];

	function isLit(rows: number[], col: number, row: number): boolean {
		return !!(rows[row] & (1 << (CHAR_W - 1 - col)));
	}

	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget) onclose();
	}
</script>

{#if open}
<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="backdrop" onclick={handleBackdrop}>
	<div class="modal" role="dialog" aria-modal="true" aria-label="LED font preview">
		<div class="modal-header">
			<span class="modal-title">LED FONT 5×7</span>
			<button class="close-btn" onclick={onclose}>×</button>
		</div>
		<div class="modal-body">
			{#each GROUPS as group}
				<div class="group">
					<p class="group-label">{group.label}</p>
					<div class="char-row">
						{#each group.chars as ch}
							{@const rows = FONT[ch] ?? FONT[' ']}
							<div class="char-cell">
								<svg
									width={CELL_W}
									height={CELL_H}
									viewBox="0 0 {CHAR_W} {FONT_H}"
									xmlns="http://www.w3.org/2000/svg"
								>
									{#each Array(FONT_H) as _, row}
										{#each Array(CHAR_W) as _, col}
											<circle
												cx={col + 0.5}
												cy={row + 0.5}
												r="0.36"
												fill={color}
												opacity={isLit(rows, col, row) ? 1 : 0.1}
											/>
										{/each}
									{/each}
								</svg>
								<span class="char-label">{ch === ' ' ? 'SPC' : ch === '\\' ? '\\' : ch}</span>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 10000;
		background: rgba(0, 0, 0, 0.72);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.modal {
		background: rgb(6, 1, 4);
		border: 1px solid rgba(255, 157, 208, 0.25);
		max-width: min(96vw, 900px);
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px 12px;
		border-bottom: 1px solid rgba(255, 157, 208, 0.15);
		flex-shrink: 0;
	}

	.modal-title {
		font-family: monospace;
		font-size: 12px;
		letter-spacing: 0.15em;
		color: rgba(255, 157, 208, 0.5);
	}

	.close-btn {
		background: none;
		border: none;
		color: rgba(255, 157, 208, 0.6);
		font-size: 28px;
		line-height: 1;
		cursor: pointer;
		padding: 0 2px;
		font-weight: 200;
		transition: color 0.15s;
	}
	.close-btn:hover { color: #ff9dd0; }

	.modal-body {
		overflow-y: auto;
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 28px;
	}

	.group-label {
		font-family: monospace;
		font-size: 10px;
		letter-spacing: 0.12em;
		color: rgba(255, 157, 208, 0.3);
		margin-bottom: 12px;
		text-transform: uppercase;
	}

	.char-row {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
	}

	.char-cell {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 5px;
	}

	.char-label {
		font-family: monospace;
		font-size: 9px;
		color: rgba(255, 157, 208, 0.4);
		letter-spacing: 0.05em;
		line-height: 1;
	}
</style>
