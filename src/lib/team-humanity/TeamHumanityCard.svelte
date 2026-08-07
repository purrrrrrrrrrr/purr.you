<script>
	import { onMount } from 'svelte';
	import './styles.css';
	import { nextPosition, prevPosition, chapterAudioUrl } from './sequence.js';

	/** @type {{ people: { id: string, name: string, chapters: { audio: string }[] }[], questions: string[] }} */
	let { people, questions } = $props();

	let position = $state({ personIndex: 0, chapterIndex: 0 });
	let progress = $state(0); // 0..1
	let autoplayBlocked = $state(false);
	let isPlaying = $state(false);
	let dragging = $state(false);

	/** @type {HTMLAudioElement} */
	let audioEl;

	/** @type {HTMLDivElement} */
	let progressTrackEl;

	let currentPerson = $derived(people[position.personIndex]);
	let currentQuestion = $derived(questions[position.chapterIndex]);
	let currentAudioUrl = $derived(
		chapterAudioUrl(currentPerson.id, currentPerson.chapters[position.chapterIndex])
	);

	/** @param {{personIndex: number, chapterIndex: number}} newPosition */
	function goTo(newPosition) {
		position = newPosition;
		consecutiveErrors = 0;
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

	let consecutiveErrors = 0;

	function handleError() {
		consecutiveErrors += 1;
		if (consecutiveErrors > people.reduce((sum, p) => sum + p.chapters.length, 0)) {
			// Every chapter in the whole sequence has failed — stop retrying, just show the block overlay.
			autoplayBlocked = true;
			return;
		}
		goTo(nextPosition(people, position));
	}

	function handleNext() {
		goTo(nextPosition(people, position));
	}

	function handlePrev() {
		goTo(prevPosition(people, position));
	}

	function handlePlay() {
		if (audioEl.paused) {
			audioEl.play().catch(() => {
				autoplayBlocked = true;
			});
		} else {
			audioEl.pause();
		}
	}

	/** @param {number} chapterIndex */
	function handleChapterClick(chapterIndex) {
		goTo({ personIndex: position.personIndex, chapterIndex });
	}

	function handleTimeUpdate() {
		if (dragging) return;
		if (audioEl.duration > 0) {
			progress = audioEl.currentTime / audioEl.duration;
		}
	}

	/** @param {PointerEvent} e */
	function seekFromPointer(e) {
		if (!progressTrackEl) return;
		const rect = progressTrackEl.getBoundingClientRect();
		const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
		progress = ratio;
		if (audioEl.duration > 0) {
			audioEl.currentTime = ratio * audioEl.duration;
		}
	}

	/** @param {PointerEvent} e */
	function handleProgressPointerDown(e) {
		dragging = true;
		/** @type {HTMLElement} */ (e.currentTarget).setPointerCapture(e.pointerId);
		seekFromPointer(e);
	}

	/** @param {PointerEvent} e */
	function handleProgressPointerMove(e) {
		if (!dragging) return;
		seekFromPointer(e);
	}

	/** @param {PointerEvent} e */
	function handleProgressPointerUp(e) {
		if (!dragging) return;
		dragging = false;
		/** @type {HTMLElement} */ (e.currentTarget).releasePointerCapture(e.pointerId);
	}

	function handleOverlayClick() {
		autoplayBlocked = false;
		audioEl.play().catch(() => {
			autoplayBlocked = true;
		});
	}

	function handleAudioPlay() {
		isPlaying = true;
	}

	function handleAudioPause() {
		isPlaying = false;
	}

	/** @param {KeyboardEvent} e */
	function handleKeydown(e) {
		if (e.code === 'Space') {
			e.preventDefault();
			handlePlay();
		} else if (e.code === 'ArrowRight') {
			e.preventDefault();
			handleNext();
		} else if (e.code === 'ArrowLeft') {
			e.preventDefault();
			handlePrev();
		}
	}

	onMount(() => {
		// Set src imperatively before play(), mirroring goTo's approach — waiting on the
		// reactive `src={currentAudioUrl}` binding alone races with this play() call, and
		// the binding's later src write can abort the in-flight play() with AbortError,
		// which gets misread as autoplay being blocked (NotAllowedError).
		audioEl.src = currentAudioUrl;
		audioEl.play().catch(() => {
			autoplayBlocked = true;
		});

		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});
</script>

<div class="team-humanity-page">
	<div class="card">
		<button type="button" class="nav-arrow prev" onclick={handlePrev} aria-label="Previous">
			←
		</button>
		<button type="button" class="nav-arrow next" onclick={handleNext} aria-label="Next">
			→
		</button>
		<h1 class="card-title">team humanity</h1>
		<hr class="card-divider" />
		<p class="card-subtitle">humans are asked 3 simple questions{'\n'}about humans and themselves</p>
		<hr class="card-divider" />

		<p class="card-speaker">
			<span class="card-speaker-name">{currentPerson.name}</span>
			<span class="card-speaker-label">answering</span>
		</p>

		<div class="question-box">
			<p>
				{currentQuestion}
			</p>
		</div>

		<div class="chapters">
			{#each currentPerson.chapters as _, i (i)}
				<button
					type="button"
					class="chapter-btn"
					class:active={i === position.chapterIndex}
					onclick={() => handleChapterClick(i)}
				>
					{i + 1}
				</button>
			{/each}
		</div>

		<div
			class="progress-track"
			bind:this={progressTrackEl}
			role="slider"
			tabindex="0"
			aria-label="Seek"
			aria-valuemin="0"
			aria-valuemax="100"
			aria-valuenow={Math.round(progress * 100)}
			onpointerdown={handleProgressPointerDown}
			onpointermove={handleProgressPointerMove}
			onpointerup={handleProgressPointerUp}
			onpointercancel={handleProgressPointerUp}
		>
			<div class="progress-dot" style="left: {progress * 100}%"></div>
		</div>

		<div class="desktop-nav">
			<button type="button" class="play-pause-btn" onclick={handlePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
				{isPlaying ? 'pause' : 'play'}
			</button>
		</div>

		<div class="mobile-nav">
			<button type="button" class="nav-arrow prev" onclick={handlePrev} aria-label="Previous">
				←
			</button>

			<button
				type="button"
				class="play-pause-btn"
				onclick={handlePlay}
				aria-label={isPlaying ? 'Pause' : 'Play'}
			>
				{isPlaying ? 'pause' : 'play'}
			</button>

			<button type="button" class="nav-arrow next" onclick={handleNext} aria-label="Next">
				→
			</button>
		</div>
	</div>

	<audio
		bind:this={audioEl}
		onended={handleEnded}
		ontimeupdate={handleTimeUpdate}
		onerror={handleError}
		onplay={handleAudioPlay}
		onpause={handleAudioPause}
	></audio>
</div>
