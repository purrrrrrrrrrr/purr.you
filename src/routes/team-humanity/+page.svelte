<!-- src/routes/team-humanity/+page.svelte -->
<script>
	import { onMount } from 'svelte';
	import TeamHumanityCard from '$lib/team-humanity/TeamHumanityCard.svelte';

	let people = $state(/** @type {{ id: string, name: string, chapters: { audio: string }[] }[] | null} */ (null));
	let questions = $state(null);

	onMount(async () => {
		const [manifestRes, questionsRes] = await Promise.all([
			fetch('/team-humanity/manifest.json'),
			fetch('/team-humanity/questions.json')
		]);
		const manifest = await manifestRes.json();
		questions = await questionsRes.json();

		people = await Promise.all(
			manifest.order.map(async (/** @type {string} */ uuid) => {
				const res = await fetch(`/team-humanity/${uuid}.json`);
				const data = await res.json();
				return { id: uuid, name: data.name, chapters: data.chapters };
			})
		);
	});
</script>

<svelte:head>
	<title>team humanity</title>
	<meta name="theme-color" content="#572b00" />
	<link rel="icon" href="/team-humanity-favicon.svg" type="image/svg+xml" />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link
		href="https://fonts.googleapis.com/css2?family=Alexandria:wght@100..900&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

{#if people && questions}
	<TeamHumanityCard {people} {questions} />
{/if}
