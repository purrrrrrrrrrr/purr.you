<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>purr-net admin</title>
	<meta name="theme-color" content="#2b0606" />
</svelte:head>

<div class="page">
	{#if !data.authed}
		<form class="login" method="POST" action="?/login" use:enhance>
			<h1>purr-net admin</h1>
			<input class="field" type="password" name="password" placeholder="password" required autofocus />
			<button class="submit" type="submit">login</button>
			{#if form?.error}
				<p class="error">{form.error}</p>
			{/if}
		</form>
	{:else}
		<div class="dashboard">
			<div class="dashboard-head">
				<h1>subscribers ({data.subscribers.length})</h1>
				<form method="POST" action="?/logout" use:enhance>
					<button class="logout" type="submit">log out</button>
				</form>
			</div>

			{#if data.subscribers.length === 0}
				<p class="empty">no subscribers yet</p>
			{:else}
				<table>
					<thead>
						<tr>
							<th>email</th>
							<th>joined</th>
						</tr>
					</thead>
					<tbody>
						{#each data.subscribers as sub (sub.email)}
							<tr>
								<td>{sub.email}</td>
								<td>{new Date(sub.createdAt).toLocaleString()}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>
	{/if}
</div>

<style>
	:global(html, body) {
		margin: 0;
		padding: 0;
	}

	.page {
		min-height: 100vh;
		background: #2b0606;
		color: #ff17b0;
		font-family: 'Alexandria', sans-serif;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		box-sizing: border-box;
	}

	h1 {
		margin: 0;
		font-size: 1.4rem;
	}

	.login {
		width: 280px;
		max-width: 100%;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		text-align: center;
	}

	.field {
		background: transparent;
		border: 2px solid #ff17b0;
		color: #ff17b0;
		font-family: inherit;
		font-size: 1rem;
		padding: 0.75rem 1.25rem;
		outline: none;
	}

	.field::placeholder {
		color: rgba(255, 23, 176, 0.5);
	}

	.submit {
		background: #ff17b0;
		border: none;
		color: #2b0606;
		font-family: inherit;
		font-size: 1.1rem;
		padding: 0.75rem 1.25rem;
		cursor: pointer;
	}

	.submit:hover {
		background: #e8c800;
	}

	.error {
		margin: 0;
		color: #e8c800;
	}

	.dashboard {
		width: 100%;
		max-width: 720px;
	}

	.dashboard-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.logout {
		background: transparent;
		border: 2px solid #ff17b0;
		color: #ff17b0;
		font-family: inherit;
		padding: 0.4rem 1rem;
		cursor: pointer;
	}

	.logout:hover {
		background: #ff17b0;
		color: #2b0606;
	}

	.empty {
		color: rgba(255, 23, 176, 0.6);
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th,
	td {
		text-align: left;
		padding: 0.6rem 0.75rem;
		border-bottom: 1px solid rgba(255, 23, 176, 0.25);
	}

	th {
		color: #e8c800;
		font-weight: 400;
	}
</style>
