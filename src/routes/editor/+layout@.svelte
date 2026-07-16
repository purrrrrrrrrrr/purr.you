<script lang="ts">
	let { children } = $props();
</script>
{@render children()}
<style>
	:global(html, body) {
		margin: 0; padding: 0;
		width: 100%; height: 100%;
		overflow: hidden;
		background: #0d0d0d;
	}
</style>
