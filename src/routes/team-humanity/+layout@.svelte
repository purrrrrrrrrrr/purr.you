<!-- src/routes/team-humanity/+layout@.svelte -->
<script>
	let { children } = $props();
</script>

{@render children()}

<style>
	:global(html, body) {
		margin: 0;
		padding: 0;
	}
</style>
