<script>
	import { onMount } from 'svelte';
	import { createInterviewsApp } from '$lib/interviews/app.js';
	import '$lib/interviews/styles.css';

	onMount(() => {
		const app = createInterviewsApp();
		return () => app.destroy();
	});
</script>

<svelte:head>
	<title>Interview With a Human</title>
	<meta name="theme-color" content="#002107">
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link href="https://fonts.googleapis.com/css2?family=Alexandria:wght@100..900&display=swap" rel="stylesheet">
</svelte:head>

<div id="app">
	<header class="page-header">
		<h1 class="title">Interview<br />With a Human</h1>
		<div id="subtitle-language-slot"></div>
	</header>
	<div class="viewport" id="viewport">
		<div class="tip" id="tip">
			<div class="tip-wrapper"></div>
		</div>
	</div>
	<div class="console" id="console">
		<div class="console-left">
			<div class="slot" id="slot" aria-label="Databun slot">
				<div class="slot-label">DATABUN</div>
				<div class="slot-content" id="slot-content"></div>
			</div>
			<button class="hw-btn load-btn" id="load-btn" type="button" aria-label="Load">
				<span class="hw-btn-label">LOAD</span>
				<span class="hw-btn-face"></span>
			</button>
		</div>
		<div class="console-right" id="console-right"></div>
	</div>
</div>

<style>
	:global(html, body) {
		margin: 0;
		padding: 0;
	}
</style>
