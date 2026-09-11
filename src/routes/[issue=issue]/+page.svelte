<script lang="ts">
	import PurrHome from '../+page.svelte';

	let { data }: { data: { issue: '001' | '002' } } = $props();
</script>

<PurrHome initialIssue={data.issue} />
