<script lang="ts">
	type Ingredient = { name: string; qty: string; unit: string };

	const ingredients: Ingredient[] = [
		{ name: 'Carbonated water', qty: '861', unit: 'ml' },
		{ name: 'Cane sugar', qty: '108', unit: 'g' },
		{ name: 'Caramel color (E150d)', qty: '0.6', unit: 'g' },
		{ name: 'Citric acid', qty: '0.4', unit: 'g' },
		{ name: 'Caffeine', qty: '0.09', unit: 'g' },
		{ name: 'Coca leaf extract (decocainized)', qty: '0.15', unit: 'ml' },
		{ name: 'Kola nut extract', qty: '0.1', unit: 'ml' },
		{ name: 'Vanilla extract', qty: '0.05', unit: 'ml' },
		{ name: 'Lime juice', qty: '1.8', unit: 'ml' },
		{ name: '7X oil blend (orange, lemon, nutmeg, cinnamon, coriander, neroli)', qty: '0.3', unit: 'ml' },
		{ name: 'Glycerin (oil carrier)', qty: '0.2', unit: 'ml' }
	];
</script>

<svelte:head>
	<title>Kola — Original Formula</title>
	<meta name="theme-color" content="#3a0000" />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link
		href="https://fonts.googleapis.com/css2?family=Alexandria:wght@100..900&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="page">
	<div class="card">
		<h1>ORIGINAL COLA FORMULA</h1>
		<p class="subtitle">1886 Pemberton reconstruction — scaled to 1 liter</p>

		<div class="recipe">
			{#each ingredients as ing}
				<div class="row">
					<label for={ing.name}>{ing.name}</label>
					<div class="input-wrap">
						<input id={ing.name} type="number" step="0.01" value={ing.qty} />
						<span class="unit">{ing.unit}</span>
					</div>
				</div>
			{/each}
		</div>

		<p class="note">
			Historical reconstruction from public folklore &amp; the 2011 "7X" leak — not the actual
			guarded Coca-Cola trade secret. For fun only.
		</p>
	</div>
</div>

<style>
	:global(html, body) {
		margin: 0;
		padding: 0;
	}

	.page {
		--cherry: #3a0000;
		--dragon: #fe00ae;

		min-height: 100vh;
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--cherry);
		font-family: 'Alexandria', sans-serif;
	}

	.card {
		width: 640px;
		height: 640px;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		background: var(--cherry);
		border: 2px solid var(--dragon);
		border-radius: 12px;
		box-shadow: 0 0 32px rgba(254, 0, 174, 0.35);
		padding: 36px 40px;
		overflow-y: auto;
		color: var(--dragon);
	}

	h1 {
		margin: 0 0 6px;
		font-size: 28px;
		font-weight: 700;
		letter-spacing: 0.03em;
		color: var(--dragon);
	}

	.subtitle {
		margin: 0 0 24px;
		font-size: 13px;
		font-weight: 300;
		opacity: 0.8;
		color: var(--dragon);
	}

	.recipe {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}

	.row label {
		font-size: 13px;
		font-weight: 400;
		color: var(--dragon);
	}

	.input-wrap {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
	}

	.input-wrap input {
		width: 72px;
		background: transparent;
		border: 1.5px solid var(--dragon);
		border-radius: 6px;
		color: var(--dragon);
		font-family: 'Alexandria', sans-serif;
		font-size: 13px;
		text-align: right;
		padding: 4px 6px;
	}

	.input-wrap input:focus {
		outline: none;
		box-shadow: 0 0 0 2px rgba(254, 0, 174, 0.4);
	}

	.input-wrap .unit {
		font-size: 12px;
		width: 20px;
		color: var(--dragon);
		opacity: 0.8;
	}

	.note {
		margin-top: auto;
		padding-top: 20px;
		font-size: 11px;
		line-height: 1.5;
		font-weight: 300;
		opacity: 0.75;
		color: var(--dragon);
	}
</style>
