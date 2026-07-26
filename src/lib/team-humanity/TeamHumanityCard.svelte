<script>
	import { onMount } from 'svelte';
	import './styles.css';
	import { nextPosition, chapterAudioUrl } from './sequence.js';

	/** @type {{ people: { id: string, name: string, chapters: { audio: string }[] }[], questions: string[] }} */
	let { people, questions } = $props();

	let position = $state({ personIndex: 0, chapterIndex: 0 });
	let progress = $state(0); // 0..1
	let autoplayBlocked = $state(false);

	/** @type {HTMLAudioElement} */
	let audioEl;

	let currentPerson = $derived(people[position.personIndex]);
	let currentQuestion = $derived(questions[position.chapterIndex]);
	let currentAudioUrl = $derived(
		chapterAudioUrl(currentPerson.id, currentPerson.chapters[position.chapterIndex])
	);

	/** @param {{personIndex: number, chapterIndex: number}} newPosition */
	function goTo(newPosition) {
		position = newPosition;
		progress = 0;
		const person = people[newPosition.personIndex];
		const chapter = person.chapters[newPosition.chapterIndex];
		// Set src imperatively rather than relying on the reactive `src={currentAudioUrl}`
		// binding to flush before play() runs — avoids a timing race between Svelte's
		// effect scheduling and this function.
		audioEl.src = chapterAudioUrl(person.id, chapter);
		audioEl.currentTime = 0;
		audioEl.play().catch(() => {
			autoplayBlocked = true;
		});
	}

	function handleEnded() {
		goTo(nextPosition(people, position));
	}

	function handleTimeUpdate() {
		if (audioEl.duration > 0) {
			progress = audioEl.currentTime / audioEl.duration;
		}
	}

	function handleOverlayClick() {
		autoplayBlocked = false;
		audioEl.play().catch(() => {
			autoplayBlocked = true;
		});
	}

	onMount(() => {
		audioEl.play().catch(() => {
			autoplayBlocked = true;
		});
	});
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
			<div class="progress-dot" style="left: {progress * 100}%"></div>
		</div>

		{#if autoplayBlocked}
			<button type="button" class="tap-overlay" onclick={handleOverlayClick}>
				tap to begin
			</button>
		{/if}
	</div>

	<audio
		bind:this={audioEl}
		src={currentAudioUrl}
		onended={handleEnded}
		ontimeupdate={handleTimeUpdate}
	></audio>
</div>
