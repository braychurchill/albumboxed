<script>
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

	/** @type {{name: string, path: string}[]} */
	const navLinks = [
		{ name: 'Discover', path: '/' },
		{ name: 'Diary', path: '/diary' },
		{ name: 'Listen List', path: '/listenlist' },
		{ name: 'Account', path: '/account' }
	];

	/** @param {string} p */
	function isActive(p) {
		return page.url.pathname === p;
	}

	/** @param {string} p */
	function navigate(p) {
		goto(p);
	}
</script>

<nav class="navbar">
	{#each navLinks as link}
		<button
			class:selected={isActive(link.path)}
			onclick={() => navigate(link.path)}
		>
			{link.name}
		</button>
	{/each}
</nav>

<style>
	.navbar {
		position: fixed;
		bottom: 0;
		left: 0;
		width: 100%;
		display: flex;
		justify-content: space-around;
		padding: 0.75rem 0;
		background-color: #111;
		border-top: 1px solid #222;
	}

	button {
		background: none;
		border: none;
		color: #999;
		font-size: 1rem;
		cursor: pointer;
	}

	button.selected {
		color: #1db954;
		font-weight: 600;
		border-bottom: 2px solid #1db954;
		padding-bottom: 0.25rem;
	}
</style>