<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';

	let { glowColor = '#ff9dd0', children }: { glowColor?: string; children: Snippet } = $props();

	let el: HTMLElement | null = $state(null);
	let glowing = $state(false);
	let outlined = $state(false);

	onMount(() => {
		const outlineTimer = setTimeout(() => { outlined = true; }, 50);

		let tiltReady = false;
		const tiltTimer = setTimeout(() => {
			tiltReady = true;
			el!.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
			el!.style.transform = 'translate(-50%, -50%) perspective(600px) rotateX(4deg) rotateY(-7deg)';
			setTimeout(() => { el!.style.transition = 'none'; }, 550);
		}, 350);

		function onMouseMove(e: MouseEvent) {
			if (!tiltReady) return;
			const dx = (e.clientX - window.innerWidth  / 2) / (window.innerWidth  / 2);
			const dy = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
			const rx = -dy * 20;
			const ry =  dx * 20;
			el!.style.transition = 'none';
			el!.style.transform = `translate(-50%, -50%) perspective(600px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
		}

		window.addEventListener('mousemove', onMouseMove);
		return () => {
			clearTimeout(outlineTimer);
			clearTimeout(tiltTimer);
			window.removeEventListener('mousemove', onMouseMove);
		};
	});
</script>

<div
	class="floating-card"
	class:glowing
	class:outlined
	bind:this={el}
	style="--glow-color: {glowColor}"
	onmouseenter={() => (glowing = true)}
	onmouseleave={() => (glowing = false)}
>
	{@render children()}
	<div class="card-outline" aria-hidden="true">
		<div class="ol-top"></div>
		<div class="ol-right"></div>
		<div class="ol-bottom"></div>
		<div class="ol-left"></div>
	</div>
</div>

<style>
	@import './env-effects.css';

	.floating-card {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 420px;
		height: 420px;
		cursor: pointer;
		box-shadow: 0 0 9px 2px transparent;
		transition: box-shadow 0.8s ease;
	}

	@media screen and (max-width: 699px) {
		.floating-card {
			width: 300px;
			height: 300px;
		}
	}

	.floating-card.glowing {
		animation: backlight-pulse 4.2s ease-in-out infinite;
	}

	/* ── outline ── */
	.card-outline {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.card-outline > div {
		position: absolute;
		background: var(--glow-color);
	}

	.ol-top    { top: 0;    left: 0;   height: 2px; width: 0;   transition: width  0.1s ease-in 0s; }
	.ol-right  { top: 0;    right: 0;  width: 2px;  height: 0;  transition: height 0.1s ease-in 0s; }
	.ol-bottom { bottom: 0; right: 0;  height: 2px; width: 0;   transition: width  0.1s ease-in 0s; }
	.ol-left   { bottom: 0; left: 0;   width: 2px;  height: 0;  transition: height 0.1s ease-in 0s; }

	.floating-card.outlined .ol-top    { width: 100%;  transition: width  0.06s linear 0s; }
	.floating-card.outlined .ol-right  { height: 100%; transition: height 0.05s linear 0.06s; }
	.floating-card.outlined .ol-bottom { width: 100%;  transition: width  0.06s linear 0.11s; }
	.floating-card.outlined .ol-left   { height: 100%; transition: height 0.05s linear 0.17s; }
</style>
