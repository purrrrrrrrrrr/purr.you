<script lang="ts">
	import { onMount } from 'svelte';

	onMount(() => {
		const video = document.querySelector('#app video') as HTMLVideoElement | null;
		if (video) video.playbackRate = 2;
	});
</script>

<svelte:head>
	<title>Wimmy</title>
	<meta name="theme-color" content="#1c0510">
	<link rel="apple-touch-icon" sizes="180x180" href="/wimmy/apple-touch-icon.png">
	<link rel="icon" type="image/png" sizes="32x32" href="/wimmy/favicon-32x32.png">
	<link rel="icon" type="image/png" sizes="16x16" href="/wimmy/favicon-16x16.png">
	<link rel="shortcut icon" href="/wimmy/favicon.ico">
	<link rel="manifest" href="/wimmy/site.webmanifest">
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">
	<link href="https://fonts.googleapis.com/css2?family=Gelasio:ital,wght@0,400..700;1,400..700&display=swap" rel="stylesheet">
	<link rel="stylesheet" href="/wimmy/assets/index-BLrJzbal.css">
	<script>
		// Force HLS.js on all browsers (including Safari which would use native HLS).
		// Native HLS buffers only ~12s; HLS.js is configured for 600s maxBufferLength.
		const _origCanPlayType = HTMLMediaElement.prototype.canPlayType;
		HTMLMediaElement.prototype.canPlayType = function(type) {
			if (type === 'application/vnd.apple.mpegurl' || type === 'application/x-mpegurl') return '';
			return _origCanPlayType.call(this, type);
		};

		// Keep all 117 segments warm in HTTP cache — loops forever
		(function preloadSegments() {
			const base = '/wimmy/assets/hls/';
			const segs = Array.from({ length: 117 }, (_, i) =>
				`${base}seg${String(i).padStart(4, '0')}.m4s`
			);
			async function loop() {
				while (true) {
					for (const url of segs) {
						try { await fetch(url, { priority: 'low' }); } catch (_) {}
					}
					await new Promise(r => setTimeout(r, 2000));
				}
			}
			setTimeout(loop, 1500);
		})();
	</script>
	<script type="module" src="/wimmy/assets/index-9sCg6n4W.js"></script>
</svelte:head>

<div id="app"></div>
<div class="version">wimmy 1.2.1</div>

<style>
	:global(html, body) {
		margin: 0;
		padding: 0;
	}

	.version {
		position: fixed;
		bottom: 6px;
		right: 10px;
		font-family: monospace;
		font-size: 10px;
		color: rgba(0, 0, 0, 0.25);
		pointer-events: none;
		z-index: 9998;
		user-select: none;
	}
</style>
