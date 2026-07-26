<script>
	import './styles.css';

	/** @type {{ people: { id: string, name: string, chapters: { audio: string }[] }[], questions: string[] }} */
	let { people, questions } = $props();

	let position = $state({ personIndex: 0, chapterIndex: 0 });

	let currentPerson = $derived(people[position.personIndex]);
	let currentQuestion = $derived(questions[position.chapterIndex]);
</script>

<div class="team-humanity-page">
	<div class="card">
		<h1 class="card-title">team humanity</h1>
		<hr class="card-divider" />
		<p class="card-subtitle">humans are asked 3 simple questions{'\n'}about humans and themselves</p>
		<hr class="card-divider" />

		<p class="card-speaker">
			<span class="card-speaker-name">{currentPerson.name}</span>
			<span class="card-speaker-label">answering</span>
		</p>

		<div class="question-box">{currentQuestion}</div>

		<div class="chapters">
			{#each currentPerson.chapters as _, i (i)}
				<button
					type="button"
					class="chapter-btn"
					class:active={i === position.chapterIndex}
				>
					{i + 1}
				</button>
			{/each}
		</div>

		<div class="progress-track">
			<div class="progress-dot" style="left: 0%"></div>
		</div>
	</div>
</div>
