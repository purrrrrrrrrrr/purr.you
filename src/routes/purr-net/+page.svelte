<script lang="ts">
	import { onMount } from 'svelte';

	const FULL_TEXT = 'purr-net is on a mission\nto build a non-profit\nfull-fibre provider\nfor Wimbledonians';
	const BRAND_LEN = 'purr-net'.length;

	let revealed = $state(0);
	let lines = $derived(FULL_TEXT.slice(0, revealed).split('\n'));
	let brandShown = $derived(Math.min(BRAND_LEN, revealed));

	onMount(() => {
		const id = setInterval(() => {
			revealed += 1;
			if (revealed >= FULL_TEXT.length) clearInterval(id);
		}, 45);
		return () => clearInterval(id);
	});

	const LAUNCH_DATE = new Date(2026, 10, 11, 15, 0, 0);

	let now = $state(Date.now());
	let remainingMs = $derived(Math.max(0, LAUNCH_DATE.getTime() - now));
	let countdownDays = $derived(Math.floor(remainingMs / 86_400_000));
	let countdownHours = $derived(Math.floor((remainingMs % 86_400_000) / 3_600_000));
	let countdownMinutes = $derived(Math.floor((remainingMs % 3_600_000) / 60_000));
	let countdownSeconds = $derived(Math.floor((remainingMs % 60_000) / 1000));
	let pad = (n: number) => String(n).padStart(2, '0');

	onMount(() => {
		const id = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(id);
	});

	const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	const SUBSCRIBED_KEY = 'purr-net-subscribed';

	let email = $state('');
	let submitState = $state<'idle' | 'sending' | 'done' | 'error' | 'invalid'>('idle');
	let hintKey = $state(0);

	onMount(() => {
		if (localStorage.getItem(SUBSCRIBED_KEY) === '1') {
			submitState = 'done';
		}
	});

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (submitState === 'sending') return;

		if (!EMAIL_RE.test(email)) {
			submitState = 'invalid';
			hintKey += 1;
			return;
		}

		submitState = 'sending';
		try {
			const res = await fetch('/purr-net/subscribe', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email })
			});
			if (res.ok) {
				localStorage.setItem(SUBSCRIBED_KEY, '1');
				submitState = 'done';
			} else {
				submitState = 'error';
			}
		} catch {
			submitState = 'error';
		}
	}
</script>

<svelte:head>
	<title>purr-net</title>
	<meta name="theme-color" content="#2b0606" />
	<link rel="icon" href="/purr-net-favicon.svg" type="image/svg+xml" />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link href="https://fonts.googleapis.com/css2?family=Alexandria:wght@400&display=swap" rel="stylesheet" />
</svelte:head>

<div class="page">
	<div class="content">
		<div class="hero">
			<img class="cat" src="/furzik.svg" alt="purr-net cat" />

			<h1 class="typed">
				{#each lines as line, i (i)}
					{#if i === 0}
						<span class="brand">{line.slice(0, brandShown)}</span>{line.slice(brandShown)}
					{:else}
						{line}
					{/if}
					{#if i < lines.length - 1}<br />{/if}
				{/each}
				<span class="cursor"></span>
			</h1>

			<a class="login-link" href="/purr-net/admin">Login</a>
		</div>

		<div class="status-wrap">
			<div class="status-label">status</div>
			<div class="status-block">
				<div class="status-row current">[in-progress] registering with Ofcom</div>
				<div class="status-row next">[next] contract with Giacom</div>
			</div>
		</div>

		<div class="pill">
			<div class="pill-title">Wimbledon launch on 11/11/2026</div>
			<div class="pill-countdown">
				{countdownDays} days {pad(countdownHours)}:{pad(countdownMinutes)}:{pad(countdownSeconds)}
			</div>

			{#if submitState === 'done'}
				<div class="done-wrap">
					<p class="signup-done">you're in! we'll be in touch.</p>
					<div class="hint-wrap">
						<img class="hint-blob-success" src="/hint-blob-success.svg" alt="you're subscribed" />
						<img class="heart-hint" src="/hint-heart.svg" alt="" aria-hidden="true" />
					</div>
				</div>
			{:else}
				<form class="signup" onsubmit={handleSubmit} novalidate>
					<input
						class="email-input"
						type="email"
						placeholder="your email"
						bind:value={email}
						oninput={() => {
							if (submitState === 'invalid' || submitState === 'error') submitState = 'idle';
						}}
						required
					/>
					<div class="want-btn-wrap">
						<button class="want-btn" type="submit" disabled={submitState === 'sending'}>
							{submitState === 'sending' ? '...' : 'I WANT'}
						</button>
						{#if submitState === 'invalid'}
							{#key hintKey}
								<div class="hint-wrap">
									<img class="hint-blob" src="/hint-blob.svg" alt="please enter a valid email" />
									<img class="heart-hint" src="/hint-heart.svg" alt="" aria-hidden="true" />
								</div>
							{/key}
						{/if}
					</div>
					{#if submitState === 'error'}
						<p class="signup-error">something went wrong, try again</p>
					{/if}
				</form>
			{/if}
		</div>

		<p class="cta">Do you live in Wimbledon?<br />Reach out, let's build this non-profit together!</p>

		<footer>
			<a href="mailto:cats@purr.you">cats@purr.you</a>
			<a href="tel:+442039254608">020 392 546 08</a>
		</footer>
	</div>
</div>

<style>
	:global(html, body) {
		margin: 0;
		padding: 0;
	}

	.page {
		min-height: 100vh;
		background: #2b0606;
		font-family: 'Alexandria', sans-serif;
		font-weight: 400;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		box-sizing: border-box;
	}

	.content {
		width: 555px;
		max-width: 100%;
		display: flex;
		flex-direction: column;
		gap: 4rem;
	}

	@media (max-width: 555px) {
		.content {
			width: 333px;
		}
	}

	.hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
		text-align: center;
	}

	.cat {
		width: 140px;
		height: auto;
	}

	h1 {
		margin: 0;
		height: 220px;
		max-width: 26ch;
		font-size: clamp(1.4rem, 3vw, 2.2rem);
		line-height: 1.5;
		letter-spacing: 0.01em;
		color: #ff17b0;
	}

	.cursor {
		display: inline-block;
		width: 0.55em;
		height: 1em;
		margin-left: 0.15em;
		background: #e8c800;
		vertical-align: -0.15em;
		animation: cursor-glow 2.4s ease-in-out infinite;
	}

	@keyframes cursor-glow {
		0%,
		100% {
			opacity: 0.35;
			box-shadow: 0 0 3px #e8c800;
		}
		50% {
			opacity: 1;
			box-shadow: 0 0 14px 4px #e8c800;
		}
	}

	.brand {
		color: #e8c800;
	}

	.login-link {
		color: #ff17b0;
		text-decoration: underline;
		font-size: 1rem;
	}

	.status-wrap {
		max-width: 620px;
		align-self: center;
	}

	.status-block {
		border: 2px solid #e8c800;
	}

	.status-label {
		display: inline-block;
		background: #ff17b0;
		color: #2b0606;
		padding: 0.5rem 1.25rem;
	}

	.status-row {
		padding: 1.1rem 1.5rem;
		font-size: 1.15rem;
	}

	.status-row.current {
		background: #e8c800;
		color: #2b0606;
	}

	.status-row.next {
		color: #e8c800;
	}

	.pill {
		align-self: center;
		--pill-color: #ff17b0;
		border: 2px solid var(--pill-color);
		border-radius: 28px;
		color: var(--pill-color);
		text-align: center;
		padding: 32px;
		animation: pill-color 6.912s ease-in-out infinite;
	}

	@property --pill-color {
		syntax: '<color>';
		inherits: true;
		initial-value: #ff17b0;
	}

	@keyframes pill-color {
		0%,
		100% {
			--pill-color: #ff17b0;
		}
		50% {
			--pill-color: #e8c800;
		}
	}

	.pill-title {
		font-size: 1.2rem;
	}

	.pill-countdown {
		margin-top: 22.88px;
		font-size: 1.05rem;
		color: var(--pill-color);
		letter-spacing: 0.03em;
	}

	.signup {
		width: 100%;
		max-width: 320px;
		margin: 1.7875rem auto 0;
		display: flex;
		flex-direction: column;
		gap: 1.0725rem;
	}

	.email-input {
		width: 100%;
		box-sizing: border-box;
		background: transparent;
		border: 2px solid var(--pill-color);
		border-radius: 0;
		color: var(--pill-color);
		font-family: inherit;
		font-size: 1rem;
		padding: 0.75rem 1.5rem;
		outline: none;
	}

	.email-input::placeholder {
		color: color-mix(in srgb, var(--pill-color) 50%, transparent);
	}

	.email-input:-webkit-autofill,
	.email-input:-webkit-autofill:hover,
	.email-input:-webkit-autofill:focus {
		-webkit-text-fill-color: var(--pill-color);
		box-shadow: 0 0 0 1000px #2b0606 inset;
		transition: background-color 9999s ease-in-out 0s;
	}

	.want-btn-wrap,
	.done-wrap {
		position: relative;
	}

	.done-wrap {
		width: 100%;
		max-width: 320px;
		margin: 1.7875rem auto 0;
	}

	.hint-wrap {
		position: absolute;
		top: 0;
		right: calc(100% - 60px);
		width: 316.8px;
	}

	.hint-blob {
		display: block;
		width: 100%;
		height: auto;
		pointer-events: none;
		opacity: 0;
		animation: hint-blob-fade 4s ease-out forwards;
	}

	@keyframes hint-blob-fade {
		0% {
			opacity: 0;
		}
		5% {
			opacity: 1;
		}
		50% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}

	.hint-blob-success {
		display: block;
		width: 100%;
		height: auto;
		pointer-events: none;
		opacity: 0;
		animation: hint-blob-success-fade 0.6s ease-out forwards;
	}

	@keyframes hint-blob-success-fade {
		0% {
			opacity: 0;
		}
		100% {
			opacity: 1;
		}
	}

	.heart-hint {
		position: absolute;
		left: 19.4%;
		top: 56%;
		width: 34px;
		height: auto;
		transform: translate(calc(-50% + 36px), calc(-50% + 20px)) scale(1);
		transform-origin: center;
		pointer-events: none;
		z-index: 5;
		animation: heart-fly 1.8s cubic-bezier(0.55, 0, 1, 0.4) forwards;
	}

	@keyframes heart-fly {
		0% {
			transform: translate(calc(-50% + 36px), calc(-50% + 20px)) scale(1);
			opacity: 1;
		}
		40% {
			transform: translate(calc(-50% + 36px), calc(-50% + 20px)) scale(1.1);
			opacity: 1;
		}
		65% {
			transform: translate(calc(-50% + 36px), calc(-50% + 20px)) scale(2.4);
			opacity: 1;
		}
		85% {
			transform: translate(calc(-50% + 36px), calc(-50% + 20px)) scale(5);
			opacity: 0.8;
		}
		100% {
			transform: translate(calc(-50% + 36px), calc(-50% + 20px)) scale(10);
			opacity: 0;
		}
	}

	.want-btn {
		width: 100%;
		background: var(--pill-color);
		border: none;
		border-radius: 0;
		color: #2b0606;
		font-family: inherit;
		font-size: 2rem;
		letter-spacing: 0.05em;
		padding: 1.25rem 1.5rem;
		cursor: pointer;
		transition: background 0.2s ease;
	}

	.want-btn:hover {
		background: #e8c800;
		color: #2b0606;
	}

	.want-btn:disabled {
		cursor: default;
		opacity: 0.7;
	}

	.signup-done {
		margin: 0.5rem 0 0;
		color: var(--pill-color);
	}

	.signup-error {
		margin: 0.5rem 0 0;
		color: #e8c800;
		font-size: 0.9rem;
	}

	.cta {
		margin: 0;
		align-self: center;
		max-width: 46ch;
		text-align: center;
		color: #e8c800;
		font-size: 1.05rem;
		line-height: 1.5;
	}

	footer {
		margin-top: auto;
		align-self: center;
		display: flex;
		gap: 3rem;
		flex-wrap: wrap;
		justify-content: center;
		color: #ff17b0;
	}

	footer a {
		color: inherit;
		text-decoration: none;
	}

	footer a:hover {
		text-decoration: underline;
	}
</style>
