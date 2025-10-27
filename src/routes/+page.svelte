<script>
// @ts-check
import { onMount } from 'svelte';
import AlbumTile from '$lib/components/AlbumTile.svelte';
import SkeletonRail from '$lib/components/SkeletonRail.svelte';
import Button from '$lib/components/ui/Button.svelte';

import { addToDiary } from '$lib/stores/albums.js';
import { addToListenList } from '$lib/stores/listenlist.js';
import { discover, ensureDiscover, refreshDiscover } from '$lib/stores/discover.js';

/** @typedef {import('$lib/stores/albums.js').Album} Album */

// ---- typed state ----
/** @type {Album[]} */ let trending = $state([]);
/** @type {Album[]} */ let releases = $state([]);
///** @type {Album[]} */ let personalized = $state([]);  // uncomment if you want the stricter type
/** @type {Album[]} */ let personalized = $state([]);

let loading = $state(true);
/** @type {string} */ let error = $state('');
/** @type {boolean} */ let loggedIn = $state(false);

// Handlers with typed params
/** @param {Album} a */ const toDiary = (a) => addToDiary(a);
/** @param {Album} a */ const toQueue = (a) => addToListenList(a);

// Keep in sync with the shared discover store
$effect(() => {
  const unsub = discover.subscribe((d) => {
    /** @type {Album[]} */ trending = d.trending ?? [];
    /** @type {Album[]} */ releases = d.releases ?? [];
    /** @type {Album[]} */ personalized = d.personalized ?? [];
    loading = d.loading;
    error = d.error ?? '';
  });
  return () => unsub?.();
});

onMount(async () => {
  try { const r = await fetch('/api/spotify/me'); loggedIn = r.ok; } catch {}
  await ensureDiscover(loggedIn);
});

async function handleRefresh() {
  await refreshDiscover(loggedIn);
}
</script>

<header class="page-head">
  <h1 class="title">Discover</h1>
  <Button variant="secondary" size="sm" on:click={handleRefresh}>Refresh</Button>
</header>

<!-- 🔥 Trending -->
<div class="section"><h2>🔥 Trending Now</h2></div>
{#if loading && trending.length === 0}
  <SkeletonRail count={8} />
{:else if error && trending.length === 0}
  <div class="error-row">
    <p class="error">{error}</p>
    <Button variant="secondary" size="sm" on:click={handleRefresh}>Retry</Button>
  </div>
{:else}
  <div class="rail">
    {#each trending as a (a.id)}
      <AlbumTile album={a} onDiary={toDiary} onQueue={toQueue} />
    {/each}
  </div>
{/if}

<!-- 🆕 New Releases -->
<div class="section"><h2>🆕 New Releases</h2></div>
{#if loading && releases.length === 0}
  <SkeletonRail count={8} />
{:else}
  <div class="rail">
    {#each releases as a (a.id)}
      <AlbumTile album={a} onDiary={toDiary} onQueue={toQueue} />
    {/each}
  </div>
{/if}

<!-- ✨ Personalized -->
<div class="section"><h2>✨ Personalized For You</h2></div>
{#if loggedIn}
  {#if loading && personalized.length === 0}
    <SkeletonRail count={8} />
  {:else}
    <div class="rail">
      {#each personalized as a (a.id)}
        <AlbumTile album={a} onDiary={toDiary} onQueue={toQueue} />
      {/each}
    </div>
  {/if}
{:else}
  <section class="placeholder connect-hint">
    Connect Spotify in <a href="/account">Account</a> to unlock this feed.
  </section>
{/if}

<style>
  .page-head{
    display:flex; align-items:center; justify-content:space-between;
    gap:.75rem; padding:.5rem .25rem .75rem;
  }
  .title{ margin:0; font-size:1.25rem; }

  .section h2{ margin:.9rem 0 .5rem; font-size:1.05rem; }

  .rail{
    display:grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(160px, 1fr);
    gap:.75rem; overflow-x:auto; padding-bottom:.25rem;
    scroll-snap-type: x proximity;
  }

  .error-row{ display:flex; align-items:center; gap:.5rem; }
  .error{ color:#ff6b6b; margin:.25rem 0; }

  .connect-hint{ opacity:.75; margin:.25rem 0 .75rem; }
</style>