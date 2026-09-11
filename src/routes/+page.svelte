<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import Editor from "$lib/webblock/Editor.svelte";
	import FloatingCard from "$lib/FloatingCard.svelte";
	import LedDisplay from "$lib/LedDisplay.svelte";
	import interviewsLogoRaw from "../../assets/interview/interviews_logo.svg?raw";
	import wimmyLogoRaw from "../../static/wimmy/assets/wimmy_logo.svg?raw";

	let { initialIssue = "001" }: { initialIssue?: "001" | "002" } = $props();

	let cursorX = $state(-200);
	let cursorY = $state(-200);
	let cardHovered = $state(false);
	let pawTilt = $state(0);
	let hoveredProjectIssue: "001" | "002" | null = $state(null);
	let returningFromLogoPreview = $state(false);
	let ledArrowReset = $state(0);

	// ── dial ──
	let digits = $state(initialIssue.split("").map(Number));
	$effect(() => {
		digits = initialIssue.split("").map(Number);
	});

	// ── editor ──
	let editorActive = $state(false);
	const dialStr = $derived(digits.map(String).join(""));
	const ledCaption = $derived(
		hoveredProjectIssue && hoveredProjectIssue !== dialStr
			? hoveredProjectIssue === "001"
				? "WIMMY THE SCROLL"
				: "INTERVIEWS"
			: dialStr === "001"
				? "WIMMY THE SCROLL"
				: "INTERVIEWS",
	);
	const showingHoveredCaption = $derived(
		hoveredProjectIssue !== null && hoveredProjectIssue !== dialStr,
	);
	const interviewsLogoSvg = $derived(
		dialStr === "001"
			? interviewsLogoRaw.replaceAll("#FFE600", "#FF9DD0")
			: interviewsLogoRaw,
	);
	const wimmyLogoSvg = $derived(
		dialStr === "002"
			? wimmyLogoRaw
				.replaceAll("#1C0510", "#002107")
				.replaceAll("#FF9DD0", "#FFE600")
			: wimmyLogoRaw,
	);

	function drumHandler(i: number) {
		return (e: MouseEvent) => {
			const rect = (
				e.currentTarget as HTMLElement
			).getBoundingClientRect();
			const dir: 1 | -1 = e.clientY < rect.top + rect.height / 2 ? -1 : 1;
			const d = [...digits];
			d[i] = (d[i] + dir + 10) % 10;
			digits = d;
		};
	}

	function stepDial(dir: 1 | -1) {
		let val = digits[0] * 100 + digits[1] * 10 + digits[2];
		val = Math.max(0, Math.min(2, val + dir));
		digits = [
			Math.floor(val / 100),
			Math.floor((val % 100) / 10),
			val % 10,
		];
	}

	function showProjectCard(card: 1 | 2) {
		const issue = String(card).padStart(3, "0") as "001" | "002";
		returningFromLogoPreview = false;
		digits = issue.split("").map(Number);
		void goto(`/${issue}`);
	}

	function previewProject(issue: "001" | "002") {
		returningFromLogoPreview = false;
		hoveredProjectIssue = issue;
	}

	function endProjectPreview() {
		if (hoveredProjectIssue && hoveredProjectIssue !== dialStr) {
			returningFromLogoPreview = true;
			ledArrowReset += 1;
		}
		hoveredProjectIssue = null;
	}

	// ── 000: banner ──
	let linesOut = $state(false);
	let headerLinesEl: HTMLDivElement | null = $state(null);
	function restartHlines() {
		headerLinesEl?.querySelectorAll(".hline").forEach((el) => {
			const e = el as HTMLElement;
			e.style.animation = "none";
			void e.offsetHeight;
			e.style.animation = "";
		});
	}

	function scheduleBannerCycle() {
		setTimeout(() => {
			linesOut = true;
			setTimeout(() => {
				linesOut = false;
				restartHlines();
				scheduleBannerCycle();
			}, 950 + 1500);
		}, 2500);
	}

	// ── page background transition ──
	const pageBg = $derived(
		dialStr === "001"
			? "#1c0510"
			: dialStr === "002"
				? "#002107"
				: "#3a0000",
	);
	$effect(() => {
		document.body.style.backgroundColor = pageBg;
	});

	// ── 001: marquee + sweep bar ──
	let marqueeEl = $state<HTMLElement | null>(null);
	let barStageEl = $state<HTMLElement | null>(null);
	let wimmyVideoEl = $state<HTMLVideoElement | null>(null);
	let marqueeHovered = $state(false);


	$effect(() => {
		const v = wimmyVideoEl;
		if (!v) return;
		function onTime() {
			if (v!.currentTime >= 15) {
				v!.currentTime = 0;
			}
		}
		v.addEventListener("timeupdate", onTime);
		return () => v.removeEventListener("timeupdate", onTime);
	});

	$effect(() => {
		const el = marqueeEl;
		if (!el) return;

		let x = window.innerWidth;
		let last: number | null = null;
		let rafId: number;

		function tick(now: number) {
			const dt = last !== null ? (now - last) / 1000 : 0;
			last = now;
			x -= 33 * dt;
			if (x < -el!.offsetWidth) x = window.innerWidth;
			el!.style.transform = `translateX(${x}px)`;
			rafId = requestAnimationFrame(tick);
		}

		rafId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(rafId);
	});

	$effect(() => {
		const stage = barStageEl;
		if (!stage) return;

		let cancelled = false;

		function spawnBar() {
			if (cancelled) return;
			const vw = window.innerWidth;
			const barW = vw * 4;
			const bar = document.createElement("div");
			bar.className = "sweep-bar";
			bar.style.width = `${barW}px`;
			stage!.appendChild(bar);

			const startX = -barW;
			const endX = vw;
			const duration = ((endX - startX) / 1600) * 1000;
			const a = bar.animate(
				[
					{ transform: `translateX(${startX}px)` },
					{ transform: `translateX(${endX}px)` },
				],
				{ duration, easing: "linear", fill: "forwards" },
			);
			a.addEventListener("finish", () => {
				bar.remove();
				setTimeout(spawnBar, 2000);
			});
		}

		spawnBar();
		return () => {
			cancelled = true;
		};
	});

	// ── 001: participation overlay ──
	let overlayVisible = $state(false);
	let overlayExpanded = $state(false);
	let overlayEvaporating = $state(false);
	let phase: "form" | "fading" | "success" = $state("form");
	let name = $state("");
	let contact = $state("");
	let agreed = $state(false);
	let overlayRect = $state({ left: 0, top: 0, width: 0, height: 0 });

	let faceFrontEl: HTMLDivElement | null = $state(null);
	let firstInputEl: HTMLInputElement | null = $state(null);
	let checkboxEl: HTMLInputElement | null = $state(null);

	let bounceLevel = 0;
	let bounceCooldown: ReturnType<typeof setTimeout> | null = null;

	const bothFilled = $derived(
		name.trim().length > 0 && contact.trim().length > 0,
	);

	function triggerBounce() {
		bounceLevel = Math.min(bounceLevel + 1, 8);
		if (bounceCooldown) clearTimeout(bounceCooldown);
		bounceCooldown = setTimeout(() => {
			bounceLevel = 0;
		}, 800);
		const el = checkboxEl;
		if (!el) return;
		el.style.animation = "none";
		void el.offsetHeight;
		el.style.setProperty("--bd", `${bounceLevel * 4}px`);
		el.style.animation =
			"checkbox-bounce 0.45s cubic-bezier(0.22, 1, 0.36, 1)";
	}

	async function handleSubmit() {
		if (!agreed) {
			triggerBounce();
			return;
		}
		await fetch("/submit", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name, contact }),
		});
		phase = "fading";
		setTimeout(() => {
			phase = "success";
			setTimeout(closeOverlay, 2500);
		}, 380);
	}

	function openOverlay() {
		if (overlayVisible) return;
		const rect = faceFrontEl!.getBoundingClientRect();
		overlayRect = {
			left: rect.left,
			top: rect.top,
			width: rect.width,
			height: rect.height,
		};
		overlayEvaporating = false;
		overlayExpanded = false;
		overlayVisible = true;
		phase = "form";
		name = "";
		contact = "";
		agreed = false;

		requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				overlayExpanded = true;
				setTimeout(() => firstInputEl?.focus(), 700);
			}),
		);
	}

	function closeOverlay() {
		overlayExpanded = false;
		overlayEvaporating = true;
		setTimeout(() => {
			overlayVisible = false;
			overlayEvaporating = false;
		}, 600);
	}

	onMount(() => {
		function onMouseMove(e: MouseEvent) { cursorX = e.clientX; cursorY = e.clientY; }
		window.addEventListener('mousemove', onMouseMove);

		let tiltInterval: ReturnType<typeof setInterval> | null = null;
		if (window.innerWidth < 700) {
			tiltInterval = setInterval(() => {
				pawTilt = (Math.random() - 0.5) * 20;
			}, 1000);
		}

		let titleCounter = 0;
		const titleParts = document.title.split(" ");
		const wind = titleParts[titleParts.length - 1];
		const cat = titleParts[titleParts.length - 2];
		const cherry = titleParts[titleParts.length - 3];
		const titleFrames = [
			`PURR ${cherry}${cherry}${cherry}${cherry}${cat}`,
			`PURR ${cherry}${cherry}${cherry}${cat}${wind}`,
			`PURR ${cherry}${cherry}${cat}${wind}${cherry}`,
			`PURR ${cherry}${cat}${wind}${cherry}${cherry}`,
			`PURR ${cat}${wind}${cherry}${cherry}${cherry}`,
			`PURR ${wind}${cherry}${cherry}${cherry}${cherry}`,
			`PURR ${cherry}${cherry}${cherry}${cherry}${cherry}`,
		];
		const titleInterval = setInterval(() => {
			document.title = titleFrames[titleCounter++ % titleFrames.length];
		}, 1000);
		scheduleBannerCycle();
		return () => {
			clearInterval(titleInterval);
			if (tiltInterval) clearInterval(tiltInterval);
			window.removeEventListener('mousemove', onMouseMove);
		};
	});
</script>

<svelte:head>
	<title>PURR 🍒 🍒 🍒 🐈 💨</title>
	<meta property="og:title" content="PURR" />
	<meta property="og:description" content="Free interactive experiences for humans" />
	<meta property="og:image" content="https://purr.you/og.png" />
	<meta property="og:url" content="https://purr.you" />
	<meta property="og:type" content="website" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="PURR" />
	<meta name="twitter:description" content="Free interactive experiences for humans" />
	<meta name="twitter:image" content="https://purr.you/og.png" />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
	<link
		href="https://fonts.googleapis.com/css2?family=Alexandria:wght@100..900&display=swap"
		rel="stylesheet"
	/>
	<link rel="icon" type="image/x-icon" href="/favico_1.ico" />
	<script
		defer
		src="https://ana.purr.you/script.js"
		data-website-id="0f1d9862-dc62-4ddb-ada5-8a0f18d97c6d"
	></script>
	<script
		defer
		src="https://ana.purr.you/recorder.js"
		data-website-id="0f1d9862-dc62-4ddb-ada5-8a0f18d97c6d"
		data-sample-rate="0.75"
		data-mask-level="moderate"
		data-max-duration="300000"
	></script>
</svelte:head>

<!-- ── left panel: cats + dial ── -->
<div class="left-panel">
	{#if dialStr === "001" || dialStr === "002"}
		<div class="cats">
			<span class="purr-layer purr-pink">PURR</span>
			<span class="purr-layer purr-gold">PURR</span>
			<img
				class="cat-img cat-front"
				src="/furzik-front.svg"
				alt="Furzik"
			/>
			<img class="cat-img cat-shadow" src="/furzik-shadow.svg" alt="" />
		</div>
	{/if}
	<div class="dial-widget" class:page-000={dialStr === "000"}>
		<button class="dial-arrow" on:click={() => stepDial(1)}>
			<svg
				class="arrow-svg"
				viewBox="0 0 88 44"
				xmlns="http://www.w3.org/2000/svg"
			>
				<polygon points="44,0 0,44 88,44" />
			</svg>
		</button>
		<div class="dial-digits">
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<span class="dial-digit" on:click={drumHandler(0)}>{digits[0]}</span
			>
			<span class="dial-sep"></span>
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<span class="dial-digit" on:click={drumHandler(1)}>{digits[1]}</span
			>
			<span class="dial-sep"></span>
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<span class="dial-digit" on:click={drumHandler(2)}>{digits[2]}</span
			>
		</div>
		<button class="dial-arrow" on:click={() => stepDial(-1)}>
			<svg
				class="arrow-svg"
				viewBox="0 0 88 44"
				xmlns="http://www.w3.org/2000/svg"
			>
				<polygon points="0,0 88,0 44,44" />
			</svg>
		</button>
	</div>
</div>

<Editor bind:active={editorActive} {dialStr} />

<!-- ── right panel: project logos ── -->
<div class="right-panel">
	{#if dialStr === "001" || dialStr === "002"}
		<div
			class="project-logos"
			class:wimmy-active={dialStr === "001"}
			class:interviews-active={dialStr === "002"}
			style:--project-accent={dialStr === "001" ? "#ff9dd0" : "#ffe600"}
		>
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<button class="project-logo-button" type="button" on:mouseenter={() => previewProject("002")} on:mouseleave={endProjectPreview} on:click={() => showProjectCard(2)} aria-label="Show Interviews card">
				<span class="project-logo project-logo-svg" role="img" aria-label="Interviews">{@html interviewsLogoSvg}</span>
			</button>
			<button class="project-logo-button" type="button" on:mouseenter={() => previewProject("001")} on:mouseleave={endProjectPreview} on:click={() => showProjectCard(1)} aria-label="Show Wimmy card">
				<span class="project-logo project-logo-svg" role="img" aria-label="Wimmy">{@html wimmyLogoSvg}</span>
			</button>
		</div>
	{/if}
</div>

{#if dialStr === "000"}
	<!-- ── page 000: purr.you + banner ── -->
	<div class="app">
		<div class="page">
			<div
				class="header-lines"
				class:lines-out={linesOut}
				bind:this={headerLinesEl}
			>
				<p class="announcement">
					PURR NUMERO UNO<br />OUT ON MAY 31st '26
				</p>
				{#each Array(10) as _}
					<div class="hline"></div>
				{/each}
			</div>
			<div class="cats">
				<span class="purr-layer purr-pink">PURR</span>
				<span class="purr-layer purr-gold">PURR</span>
				<img
					class="cat-img cat-front"
					src="/furzik-front.svg"
					alt="Furzik"
				/>
				<img
					class="cat-img cat-shadow"
					src="/furzik-shadow.svg"
					alt=""
				/>
			</div>
			<p class="tagline">
				PURR is a collection of<br />interactive experiences<br />for
				humans.
			</p>
			<div class="cube-scene">
				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
				<div class="cube" on:click={openOverlay}>
					<div class="cube-face face-front">
						I WANT TO PARTICIPATE
					</div>
					<div class="cube-face face-back">I WANT TO PARTICIPATE</div>
					<div class="cube-face face-right"></div>
					<div class="cube-face face-left"></div>
					<div class="cube-face face-top">I WANT TO PARTICIPATE</div>
					<div class="cube-face face-bottom">
						I WANT TO PARTICIPATE
					</div>
				</div>
			</div>
		</div>
	</div>
{:else if dialStr === "001"}
	<!-- ── page 001: purr.you ── -->
	<div class="app page-001">
		<div class="led-panel-border" style:border-color="#ff9dd0" aria-hidden="true"></div>
		<div class="led-caption-layer" class:led-caption-hidden={showingHoveredCaption}>
			{#key ledArrowReset}
				<LedDisplay text="WIMMY THE SCROLL" color="#ff9dd0" staticText={returningFromLogoPreview} />
			{/key}
		</div>
		{#if showingHoveredCaption}
			<div class="led-caption-layer led-caption-preview">
				<LedDisplay text={ledCaption} color="#ff9dd0" staticText showArrows={false} />
			</div>
		{/if}
		<div class="page"></div>
		<FloatingCard glowColor="#ff9dd0">
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="project-card wimmy-card" on:click={() => goto('/wimmy')} on:mouseenter={() => (cardHovered = true)} on:mouseleave={() => (cardHovered = false)}>
			<div class="project-card-header wimmy-header">
				<p class="wimmy-desc">
					A free media for Wimbledon distributed
					to Wimbledonians one scroll thermo-printed on receipt paper
					at a time.
				</p>
			</div>
			<div class="project-card-media wimmy-video-wrap">
				<video
					class="wimmy-video"
					src="/wimmy/assets/wimmy_1.mp4"
					bind:this={wimmyVideoEl}
					autoplay
					muted
					playsinline
				></video>
			</div>
		</div>
		</FloatingCard>
		<div class="marquee-strip" class:expanded={marqueeHovered}>
			<span class="marquee-text" bind:this={marqueeEl}
				>PURR is a collection of free interactive experiences for humans</span
			>
		</div>
		<div
			class="bar-stage"
			class:expanded={marqueeHovered}
			bind:this={barStageEl}
		></div>
		<div
			class="marquee-hover-zone"
			on:mouseenter={() => (marqueeHovered = true)}
			on:mouseleave={() => (marqueeHovered = false)}
		></div>
	</div>

	{#if overlayVisible}
		<div
			class="cube-overlay"
			class:expanded={overlayExpanded}
			class:evaporating={overlayEvaporating}
			style="left:{overlayRect.left}px; top:{overlayRect.top}px; width:{overlayRect.width}px; height:{overlayRect.height}px"
		>
			{#if phase !== "success"}
				<div
					class="overlay-content"
					class:phase-fading={phase === "fading"}
				>
					<div class="overlay-title">I WANT TO PARTICIPATE</div>
					<div class="overlay-form">
						<div class="questions">
							<div class="question">
								<div class="overlay-field-header">
									<label class="overlay-label"
										>what is your name?</label
									>
									<span class="char-counter"
										>{name.length}/99</span
									>
								</div>
								<div class="overlay-input-row">
									<input
										bind:this={firstInputEl}
										class="overlay-input"
										type="text"
										maxlength="99"
										bind:value={name}
									/>
								</div>
							</div>
							<div class="question">
								<div class="overlay-field-header">
									<label class="overlay-label"
										>your email please?</label
									>
									<span class="char-counter"
										>{contact.length}/99</span
									>
								</div>
								<div class="overlay-input-row">
									<input
										class="overlay-input"
										type="text"
										maxlength="99"
										bind:value={contact}
									/>
								</div>
							</div>
						</div>
						<div class="actions">
							<div class="overlay-panel">
								<label
									class="age-check"
									class:visible={bothFilled}
								>
									<input
										bind:this={checkboxEl}
										type="checkbox"
										class="age-checkbox"
										bind:checked={agreed}
									/>
									<span
										>I swear on my luck I am 18 or older of
										age</span
									>
								</label>
							</div>
							<button
								class="overlay-submit"
								disabled={!bothFilled}
								on:click={handleSubmit}>PARTICIPATE</button
							>
						</div>
					</div>
				</div>
			{:else}
				<div class="success-message">
					WE WILL BE IN TOUCH SOON-ISH. CHÁO!
				</div>
			{/if}
			<button class="cube-close-btn" on:click={closeOverlay}>×</button>
		</div>
	{/if}
{:else if dialStr === "002"}
	<!-- ── page 002: Interview with a Human ── -->
	<div class="app page-002">
		<div class="led-panel-border" style:border-color="#ffe600" aria-hidden="true"></div>
		<div class="led-caption-layer" class:led-caption-hidden={showingHoveredCaption}>
			{#key ledArrowReset}
				<LedDisplay text="INTERVIEWS" color="#ffe600" staticText={returningFromLogoPreview} />
			{/key}
		</div>
		{#if showingHoveredCaption}
			<div class="led-caption-layer led-caption-preview">
				<LedDisplay text={ledCaption} color="#ffe600" staticText showArrows={false} />
			</div>
		{/if}
		<FloatingCard glowColor="#ffe600">
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div class="project-card interviews-card" on:click={() => goto('/interviews')} on:mouseenter={() => (cardHovered = true)} on:mouseleave={() => (cardHovered = false)}>
				<div class="project-card-header">
					<p class="interviews-card-description">Humans sharing their thoughts on life, money and their favourite things</p>
				</div>
				<div class="project-card-media interviews-picture-wrap">
					<img class="interviews-card-picture" src="/interviews_card_pic.png" alt="Interview with a Human" />
				</div>
			</div>
		</FloatingCard>
	</div>
{/if}

<div class="purr-version">purr v1.1.8</div>

<!-- paw cursor (root route only) -->
<div class="paw-cursor" style="left:{cursorX}px; top:{cursorY}px">
	<div class="paw-inner" class:card-hovered={cardHovered} style="--tilt:{pawTilt}deg">
		<img class="paw-fucsia" src="/paw_fucsia.svg" alt="" />
		<img class="paw-mango" src="/paw_mango.svg" alt="" />
	</div>
</div>

<style>
	:global(:root) {
		color-scheme: light;
		--cherry: #3a0000;
		--dark-cherry: rgb(28, 5, 16);
		--mango: #feba00;
		--dragon: #fe00ae;
		--velvet: #8c00be;
		--orange: #ff6a00;
	}

	:global(*, *::before, *::after) {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}

	:global(body) {
		color: var(--cherry);
		background-color: var(--cherry);
		transition: background-color 600ms ease;
		font-family: "Alexandria", sans-serif;
		font-weight: 500;
		min-height: 100vh;
		display: flex;
		justify-content: center;
	}

	/* ── left panel ── */
	.left-panel {
		position: fixed;
		left: 20px;
		top: 50%;
		transform: translateY(-50%);
		z-index: 900;
	}

	/* ── right panel ── */
	.right-panel {
		position: fixed;
		right: 36px;
		top: 50%;
		transform: translateY(-50%);
		z-index: 900;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.project-logos {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 36px;
		transition: transform 300ms ease;
	}

	.project-logos.wimmy-active {
		transform: translateY(-50px);
	}

	.project-logos.interviews-active {
		transform: translateY(50px);
	}

	.project-logo-button {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 64px;
		height: 64px;
		padding: 0;
		border: 0;
		background: transparent;
		cursor: pointer;
		opacity: 0.85;
		transition: opacity 0.15s;
	}

	.project-logo-button:hover {
		opacity: 1;
	}

	.project-logos.interviews-active .project-logo-button:first-child,
	.project-logos.wimmy-active .project-logo-button:last-child {
		opacity: 1;
	}

	.project-logos.interviews-active .project-logo-button:first-child::before,
	.project-logos.wimmy-active .project-logo-button:last-child::before {
		content: "";
		position: absolute;
		left: -34px;
		top: 50%;
		transform: translateY(-50%);
		width: 0;
		height: 0;
		border-top: 6px solid transparent;
		border-bottom: 6px solid transparent;
		border-left: 10px solid var(--project-accent);
	}

	.led-panel-border {
		position: absolute;
		top: 32px;
		left: 50%;
		z-index: 1;
		transform: translateX(-50%);
		width: 420px;
		height: 64px;
		border: 1px solid;
		pointer-events: none;
	}

	.led-caption-layer {
		opacity: 1;
		transition: opacity 140ms ease;
	}

	.led-caption-hidden {
		opacity: 0;
	}

	.led-caption-preview {
		animation: led-caption-fade-in 180ms ease both;
	}

	@keyframes led-caption-fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.project-logo {
		width: 64px;
		height: 64px;
		display: block;
	}

	.project-logo-button:first-child .project-logo {
		transform: scale(1.69);
	}

	.project-logos.wimmy-active .project-logo-button:last-child .project-logo {
		transform: scale(1.32);
	}

	.project-logos.interviews-active .project-logo-button:first-child .project-logo {
		transform: scale(2.2308);
	}

	.project-logo-svg :global(svg) {
		width: 100%;
		height: 100%;
		display: block;
	}

	.left-panel .cats {
		position: absolute;
		bottom: 100%;
		left: 50%;
		transform: translateX(-50%);
		margin-bottom: 16px;
		width: 128px;
		height: 128px;
		margin-top: 0;
		container-type: size;
	}

	.left-panel .purr-layer {
		font-size: 5.88cqh;
	}

	/* ── dial ── */
	.dial-widget {
		user-select: none;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 14px 9px;
		background: rgba(0, 0, 0, 0.1);
		border-radius: 9999px;
	}

	.dial-arrow {
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0.85;
		transition:
			opacity 0.1s,
			transform 0.1s;
	}

	.dial-arrow:hover {
		opacity: 1;
	}
	.dial-arrow:active {
		transform: scale(0.93);
	}

	.arrow-svg {
		width: 32px;
		height: 41px;
		fill: var(--mango);
	}

	.dial-digits {
		display: flex;
		align-items: center;
	}

	.dial-digit {
		font-family: "Alexandria", monospace;
		font-size: 24px;
		font-weight: 400;
		color: var(--mango);
		line-height: 1;
		cursor: ns-resize;
		width: 21px;
		text-align: center;
	}

	.dial-sep {
		width: 3px;
		height: 3px;
		border-radius: 50%;
		background: var(--mango);
		margin: 0 3px;
		flex-shrink: 0;
	}

	/* ── 000: banner ── */
	.header-lines {
		width: 100%;
		position: relative;
		text-align: center;
		height: 100px;
		display: flex;
		flex-direction: column;
		gap: 0px;
	}

	.hline {
		flex: 1;
		background: var(--mango);
		animation: line-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
	}

	.hline:nth-child(odd) {
		transform-origin: left;
	}
	.hline:nth-child(even) {
		transform-origin: right;
	}
	.hline:nth-child(2) {
		animation-delay: 0s;
	}
	.hline:nth-child(3) {
		animation-delay: 0.05s;
	}
	.hline:nth-child(4) {
		animation-delay: 0.1s;
	}
	.hline:nth-child(5) {
		animation-delay: 0.15s;
	}
	.hline:nth-child(6) {
		animation-delay: 0.2s;
	}
	.hline:nth-child(7) {
		animation-delay: 0.25s;
	}
	.hline:nth-child(8) {
		animation-delay: 0.3s;
	}
	.hline:nth-child(9) {
		animation-delay: 0.35s;
	}
	.hline:nth-child(10) {
		animation-delay: 0.4s;
	}
	.hline:nth-child(11) {
		animation-delay: 0.45s;
	}

	@keyframes line-in {
		from {
			transform: scaleX(0);
		}
		to {
			transform: scaleX(1);
		}
	}

	@keyframes line-out {
		from {
			transform: scaleX(1);
		}
		to {
			transform: scaleX(0);
		}
	}

	.header-lines.lines-out .hline {
		animation-name: line-out;
		animation-fill-mode: both;
	}

	.header-lines.lines-out .hline:nth-child(2) {
		animation-delay: 0s;
	}
	.header-lines.lines-out .hline:nth-child(3) {
		animation-delay: 0.05s;
	}
	.header-lines.lines-out .hline:nth-child(4) {
		animation-delay: 0.1s;
	}
	.header-lines.lines-out .hline:nth-child(5) {
		animation-delay: 0.15s;
	}
	.header-lines.lines-out .hline:nth-child(6) {
		animation-delay: 0.2s;
	}
	.header-lines.lines-out .hline:nth-child(7) {
		animation-delay: 0.25s;
	}
	.header-lines.lines-out .hline:nth-child(8) {
		animation-delay: 0.3s;
	}
	.header-lines.lines-out .hline:nth-child(9) {
		animation-delay: 0.35s;
	}
	.header-lines.lines-out .hline:nth-child(10) {
		animation-delay: 0.4s;
	}
	.header-lines.lines-out .hline:nth-child(11) {
		animation-delay: 0.45s;
	}

	/* ── 001 ── */
	.app {
		width: 100vw;
		height: 100vh;
	}
	.app.page-001 {
		position: relative;
	}

	.project-card {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 310px;
		min-width: 310px;
		max-width: 310px;
		height: 370px;
		transform: translate(-50%, -50%);
		transform-origin: center center;
		display: flex;
		flex-direction: column;
		align-items: center;
		cursor: pointer;
		padding: 0;
		margin: 0;
	}

	.project-card-header {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 32px;
		padding: 32px;
	}

	@media screen and (min-width: 700px) {
		.project-card-header { padding: 0; line-height: 1.32; }
		.project-card { gap: 32px; }
	}
	.project-card-media {
		width: 100%;
		overflow: hidden;
		opacity: 0;
		animation: card-media-fade-in 0.45s ease-out 0.28s forwards;
	}

	@keyframes card-media-fade-in {
		to {
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.project-card-media {
			animation-duration: 0.01ms;
		}
	}

	.wimmy-video {
		width: 100%;
		display: block;
		margin-top: -64px;
	}
	.wimmy-desc {
		font-family: "Alexandria", monospace;
		font-weight: 300;
		font-size: 18px * 1.3;
		color: #ff9dd0;
		text-align: left;
		margin: 0;
	}

	.marquee-strip {
		position: fixed;
		bottom: 0;
		left: 0;
		width: 100vw;
		height: 1.25rem;
		overflow: hidden;
		display: flex;
		align-items: center;
		background: transparent;
		pointer-events: none;
		z-index: 11;
		transition: height 2s ease;
	}
	.marquee-strip.expanded {
		height: 3.125rem;
		transition: height 1s ease;
	}
	.marquee-text {
		position: absolute;
		white-space: nowrap;
		font-size: 0.625rem;
		color: #1c0510;
		font-family: "Alexandria", monospace;
		font-weight: 400;
		transition: font-size 2s ease;
	}
	.marquee-strip.expanded .marquee-text {
		font-size: 1.5625rem;
		transition: font-size 1s ease;
	}

	.bar-stage {
		position: fixed;
		bottom: 0;
		left: 0;
		width: 100vw;
		height: 1.25rem;
		overflow: hidden;
		pointer-events: none;
		z-index: 10;
		transition: height 2s ease;
	}
	.bar-stage.expanded {
		height: 3.125rem;
		transition: height 1s ease;
	}

	.marquee-hover-zone {
		position: fixed;
		bottom: 0;
		left: 0;
		width: 100vw;
		height: calc(1.25rem + 40px);
		z-index: 20;
		pointer-events: all;
	}
	:global(.sweep-bar) {
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
		background: linear-gradient(
			to right,
			transparent,
			var(--mango) 15%,
			var(--mango) 85%,
			transparent
		);
	}

	.page {
		container-type: inline-size;
		width: 100%;
		height: 100vh;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: start;
	}

	.cats {
		position: relative;
		margin-top: max(2%, 32px);
		height: max(54%, 256px);
		aspect-ratio: 1;
		overflow: hidden;
	}

	.purr-layer {
		position: absolute;
		font-weight: 500;
		letter-spacing: 0.05em;
		white-space: nowrap;
		line-height: 1;
		font-size: 8.9cqh;
		transform-origin: top left;
		animation: purr-float 4s ease-in-out infinite;
	}


	.purr-layer.purr-pink {
		font-size: 11.9cqh;
		color: var(--dragon);
		top: 2.87%;
		left: 31.21%;
		animation-delay: -1.3s;
	}

	.purr-layer.purr-gold {
		font-size: 11.9cqh;
		color: var(--mango);
		top: 3.37%;
		left: 33.21%;
		animation-delay: -2.7s;
	}

	@keyframes purr-float {
		0%,
		100% {
			transform: rotate(6.95deg) translateY(0);
		}
		50% {
			transform: rotate(6.95deg) translateY(-6px);
		}
	}

	.cat-img {
		position: absolute;
		width: 65.9%;
		aspect-ratio: 720.683 / 631.726;
	}
	.cat-shadow {
		top: 28.33%;
		left: 15.74%;
	}
	.cat-front {
		top: 27.04%;
		left: 18.06%;
	}

	.tagline {
		position: absolute;
		bottom: 100px;
		background-color: rgba(58, 0, 0, 0.7);
		font-size: 24px;
		color: var(--mango);
		text-align: center;
		line-height: 1.35;
		padding: 36px 40px 48px 40px;
	}

	.cube-scene {
		--cube-x: 200px;
		--cube-y: 75px;
		--cube-z: 75px;
		position: absolute;
		bottom: 24px;
		perspective: 320px;
	}

	.cube {
		width: var(--cube-x);
		height: var(--cube-y);
		position: relative;
		will-change: transform;
		backface-visibility: hidden;
		transform-style: preserve-3d;
		animation: cube-spin 10s infinite ease-in-out;
	}

	.cube-scene:hover .cube {
		cursor: pointer;
		animation: none;
		transform: rotateX(15deg);
	}

	.cube-face {
		position: absolute;
		width: var(--cube-x);
		height: var(--cube-y);
		padding: 16px;
		color: var(--cherry);
		backface-visibility: hidden;
		transform: translate3d(0, 0, 0);
		transform-style: preserve-3d;
		text-align: center;
	}

	.face-front {
		background: var(--mango);
		transform: translateZ(calc(var(--cube-z) / 2));
	}
	.face-back {
		background: var(--mango);
		transform: rotateX(180deg) translateZ(38px);
	}
	.face-right {
		width: var(--cube-z);
		background: pink;
		transform: rotateY(90deg) translateZ(162px);
	}
	.face-left {
		width: var(--cube-z);
		background: green;
		transform: rotateY(-90deg) translateZ(calc(var(--cube-z) / 2));
	}
	.face-top {
		height: var(--cube-z);
		background: var(--dragon);
		transform: rotateX(90deg) translateZ(calc(var(--cube-y) / 2));
		border-color: rgba(255, 255, 255, 0.35);
	}
	.face-bottom {
		height: var(--cube-z);
		background: var(--dragon);
		transform: rotateX(-90deg) translateZ(calc(var(--cube-y) / 2));
	}

	.announcement {
		width: 100%;
		color: var(--cherry);
		position: absolute;
		z-index: 99;
		padding: 24px 32px;
		font-size: 24px;
	}

	@keyframes cube-spin {
		0% {
			transform: rotateX(0deg);
		}
		5% {
			transform: rotateX(90deg);
		}
		25% {
			transform: rotateX(90deg);
		}
		30% {
			transform: rotateX(180deg);
		}
		50% {
			transform: rotateX(180deg);
		}
		55% {
			transform: rotateX(270deg);
		}
		75% {
			transform: rotateX(270deg);
		}
		80% {
			transform: rotateX(360deg);
		}
		100% {
			transform: rotateX(360deg);
		}
	}

	.cube-overlay {
		position: fixed;
		background: var(--mango);
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		transition:
			left 0.65s cubic-bezier(0.22, 1, 0.36, 1),
			top 0.65s cubic-bezier(0.22, 1, 0.36, 1),
			width 0.65s cubic-bezier(0.22, 1, 0.36, 1),
			height 0.65s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.cube-overlay.expanded {
		left: 0 !important;
		top: 0 !important;
		width: 100vw !important;
		height: 100vh !important;
	}

	.cube-overlay.evaporating {
		opacity: 0;
		transform: translateY(-48px) scale(1.04);
		transition:
			opacity 0.55s ease,
			transform 0.6s ease !important;
	}

	.overlay-content {
		position: absolute;
		top: 100px;
		left: 0;
		right: 0;
		color: var(--cherry);
		font-size: clamp(20px, 5vw, 64px);
		font-weight: 500;
		text-align: center;
		padding: 32px;
		opacity: 0;
		transform: translateY(12px);
		transition:
			opacity 0.3s ease,
			transform 0.3s ease;
	}

	.overlay-content :global(input) {
		font-weight: 400;
	}

	.cube-overlay.expanded .overlay-content {
		opacity: 1;
		transform: translateY(0);
		transition-delay: 0.45s;
	}

	.overlay-content.phase-fading {
		opacity: 0 !important;
		transform: translateY(-10px) !important;
		transition:
			opacity 0.35s ease,
			transform 0.35s ease !important;
		transition-delay: 0s !important;
	}

	.overlay-title {
		margin-bottom: 64px;
	}

	.overlay-form {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 32px;
		width: min(960px, 90vw);
		margin: 0 auto;
	}

	.questions {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 32px;
		margin: 0 auto;
	}
	.question {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.actions {
		display: flex;
		flex-direction: column;
		gap: 16px;
		align-items: stretch;
	}
	.overlay-field-header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.overlay-input-row {
		display: flex;
		gap: 16px;
		align-items: stretch;
	}

	.overlay-panel {
		flex: 1;
		min-width: 0;
		background: rgba(58, 0, 0, 0.1);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
		overflow: hidden;
	}

	.age-check {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		cursor: pointer;
		color: var(--cherry);
		font-family: "Alexandria", sans-serif;
		font-size: 27px;
		font-weight: 500;
		text-transform: uppercase;
		opacity: 0;
		transform: translateY(20px);
		transition:
			opacity 0.4s ease,
			transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
		pointer-events: none;
	}

	.age-check.visible {
		opacity: 1;
		transform: translateY(0);
		pointer-events: auto;
	}

	.age-checkbox {
		appearance: none;
		-webkit-appearance: none;
		margin-top: 4px;
		width: 28px;
		height: 28px;
		flex-shrink: 0;
		cursor: pointer;
		background: var(--mango);
		border: 3px solid var(--cherry);
	}

	.age-checkbox:checked {
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 12 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 5l4 4 6-8' stroke='%233a0000' stroke-width='2.2' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: center;
		background-size: 65%;
	}

	@keyframes checkbox-bounce {
		0% {
			transform: translateY(0);
		}
		15% {
			transform: translateY(calc(var(--bd, 6px) * -1));
		}
		40% {
			transform: translateY(calc(var(--bd, 6px) * 0.55));
		}
		65% {
			transform: translateY(calc(var(--bd, 6px) * -0.25));
		}
		85% {
			transform: translateY(calc(var(--bd, 6px) * 0.1));
		}
		100% {
			transform: translateY(0);
		}
	}

	.overlay-submit {
		flex: 1;
		min-width: 0;
		background-color: var(--cherry);
		background-image: linear-gradient(
			to right,
			var(--dragon),
			var(--dragon)
		);
		background-size: 0% 100%;
		background-repeat: no-repeat;
		color: var(--mango);
		border: none;
		font-family: "Alexandria", sans-serif;
		font-size: 20px;
		line-height: 42px;
		font-weight: 400;
		opacity: 0.5;
		cursor: not-allowed;
		transition:
			background-size 0.5s cubic-bezier(0.22, 1, 0.36, 1),
			color 0.35s ease,
			opacity 0.2s ease;
	}

	.overlay-submit:not(:disabled) {
		opacity: 1;
		cursor: pointer;
	}

	.actions:has(.age-checkbox:checked) .overlay-submit {
		background-size: 100% 100%;
	}

	.overlay-label {
		color: var(--cherry);
		font-family: "Alexandria", sans-serif;
		font-size: 18px;
		font-weight: 500;
		text-transform: uppercase;
	}

	.overlay-input {
		flex: 1;
		min-width: 0;
		background: var(--mango);
		border: 4px solid var(--cherry);
		color: var(--cherry);
		font-family: "Alexandria", sans-serif;
		font-size: 20px;
		font-weight: 500;
		padding: 16px;
		outline: none;
	}

	.overlay-input::placeholder {
		color: var(--cherry);
		opacity: 0.5;
	}

	.char-counter {
		font-size: 12px;
		color: var(--cherry);
		opacity: 0.5;
		text-align: right;
		font-family: "Alexandria", sans-serif;
	}

	.success-message {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		color: var(--cherry);
		font-family: "Alexandria", sans-serif;
		font-size: clamp(28px, 5vw, 72px);
		font-weight: 700;
		text-align: center;
		letter-spacing: 0.04em;
		line-height: 1.2;
		padding: 32px;
		animation: success-fade-in 0.65s cubic-bezier(0.22, 1, 0.36, 1) both;
	}

	@keyframes success-fade-in {
		from {
			opacity: 0;
			transform: translate(-50%, calc(-50% + 24px));
		}
		to {
			opacity: 1;
			transform: translate(-50%, -50%);
		}
	}

	.cube-close-btn {
		position: absolute;
		bottom: 164px;
		left: 50%;
		transform: translateX(-50%);
		width: 64px;
		height: 64px;
		padding-bottom: 1px;
		background: var(--mango);
		border: 1px solid var(--mango);
		color: var(--cherry);
		border-radius: 50%;
		font-size: 65px;
		line-height: 1;
		font-weight: 200;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: "Alexandria", sans-serif;
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	.cube-overlay.expanded .cube-close-btn {
		opacity: 1;
		transition-delay: 0.55s;
	}
	.cube-close-btn:hover {
		background: var(--cherry);
		color: var(--mango);
	}

	/* ── 002 ── */
	.page-002 {
		position: relative;
		width: 100vw;
		height: 100vh;
	}

	.interviews-card {
		color: #ffe600;
		padding-bottom: 16px;
	}

	.interviews-card-description {
		color: #ffe600;
		font-family: "Alexandria", sans-serif;
		font-size: 18px;
		font-weight: 300;
		line-height: 1.32;
	}

	.interviews-picture-wrap {
		flex: 1 1 auto;
		min-height: 0;
	}

	.interviews-card-picture {
		width: 100%;
		height: auto;
		display: block;
	}

	/* ── editor toggle ── */

	/* ── responsive ── */
	@media screen and (max-width: 1024px) {
		.overlay-content {
			padding: 0 32px 32px 32px;
			margin: -16px;
		}
		.overlay-form {
			grid-template-columns: 1fr;
		}
		.cube-close-btn {
			top: 0px;
			bottom: auto;
		}
	}

	@media screen and (max-width: 820px) {
		.tagline {
			font-size: 20px;
		}
		.announcement {
			padding: 29px 16px;
			font-size: 17px;
			line-height: 25px;
		}
		.cats {
			margin-top: 0;
		}
	}

	@media screen and (max-width: 500px) {
		.dial-widget.page-000 {
			background: var(--cherry);
		}
	}

	@media screen and (max-width: 699px) {
		.led-panel-border {
			width: 300px;
			height: 53px;
		}

		.right-panel {
			display: none;
		}

		.project-card {
			width: 300px;
			min-width: 300px;
			max-width: 300px;
			height: 300px;
		}

		.left-panel {
			left: 0;
			right: 0;
			top: auto;
			bottom: 20px;
			transform: none;
			width: 100%;
			display: flex;
			align-items: center;
			justify-content: center;
		}

		.left-panel .cats {
			position: absolute;
			bottom: 0;
			left: 20px;
			transform: none;
			margin: 0;
			width: 64px;
			height: 64px;
			flex-shrink: 0;
		}

		.left-panel .purr-layer {
			font-size: 11.76cqh;
			left: calc(18% + 12px);
			top: calc(2.87% + 4px);
		}

		.dial-widget {
			flex-direction: row;
			padding: 9px 14px;
		}

		.marquee-strip,
		.bar-stage,
		.marquee-hover-zone {
			display: none;
		}

		/* reorder: [◀ decrement] [digits] [▶ increment] */
		.dial-arrow:first-child { order: 3; }
		.dial-digits            { order: 2; }
		.dial-arrow:last-child  { order: 1; }

		/* up-triangle rotate 90° CW → ▶ right; down-triangle rotate 90° CW → ◀ left */
		.dial-arrow:first-child .arrow-svg {
			transform: rotate(90deg);
			width: 41px;
			height: 32px;
		}
		.dial-arrow:last-child .arrow-svg {
			transform: rotate(90deg);
			width: 41px;
			height: 32px;
		}
	}

	.purr-version {
		position: fixed;
		bottom: 8px;
		right: 12px;
		font-family: monospace;
		font-size: 10px;
		color: rgba(254, 186, 0, 0.6);
		pointer-events: auto;
		z-index: 9999;
		user-select: none;
		opacity: 0;
		transition: opacity 0.2s ease;
	}
	.purr-version:hover { opacity: 1; }

	:global(*, *::before, *::after) { cursor: none !important; }

	.paw-cursor {
		position: fixed;
		width: 0;
		height: 0;
		pointer-events: none;
		z-index: 99999;
	}

	@media screen and (max-width: 699px) {
		:global(*, *::before, *::after) { cursor: auto !important; }
		.paw-cursor { display: none; }
	}

	.paw-inner {
		position: absolute;
		width: 92px;
		height: 104px;
		left: -26px;
		top: -16px;
		transform-origin: left bottom;
		transform: rotate(var(--tilt, 0deg));
		transition: transform 0.7s ease;
	}

	.paw-inner.card-hovered {
		transform: rotate(calc(var(--tilt, 0deg) + 15deg));
		transition: transform 0.2s ease;
	}

	.paw-fucsia,
	.paw-mango {
		position: absolute;
		width: 88px;
		height: 104px;
		top: 0;
		left: 0;
	}

	.paw-mango {
		left: 4px;
		transition: transform 0.18s ease;
	}

	.paw-inner.card-hovered .paw-mango {
		transform: translate(2px, -4px);
	}
</style>
