<script>
// @ts-check
/** @typedef {import('$lib/stores/albums.js').Album} Album */
import { addToDiary } from '$lib/stores/albums.js';
import { addToListenList } from '$lib/stores/listenlist.js';
import Button from '$lib/components/ui/Button.svelte';

let q = $state('');
/** @type {Album[]} */
let results = $state([]);
let loading = $state(false);
let error = $state('');

/** @param {SubmitEvent} e */
async function search(e) {
  e.preventDefault();
  if (!q.trim()) return;
  loading = true; error = ''; results = [];
  try {
    const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(q)}&limit=10`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    results = /** @type {Album[]} */ (data.albums ?? []);
  } catch (err) {
    error = err instanceof Error ? err.message : 'Unknown error';
  } finally {
    loading = false;
  }
}

/** @param {Event} e */
function onQueryInput(e) {
  const el = /** @type {HTMLInputElement} */ (e.target);
  q = el.value;
}

/** @param {Album} a */ const saveDiary  = (a) => addToDiary(a);
/** @param {Album} a */ const saveListen = (a) => addToListenList(a);
</script>

<h1 class="title">Search</h1>

<form class="search" onsubmit={search}>
  <input
    placeholder="Search albums…"
    value={q}
    oninput={onQueryInput}
  />
  <Button variant="primary" size="md">Search</Button>
</form>

{#if loading}
  <p class="muted">Searching…</p>
{:else if error}
  <p class="error">{error}</p>
{:else if results.length === 0}
  <p class="muted">Try a search (e.g., “charli xcx”).</p>
{:else}
  <ul class="grid">
    {#each results as a (a.id)}
      <li class="card">
        {#if a.coverUrl}
          <img alt="" src={a.coverUrl} class="cover" />
        {/if}
        <div class="meta">
          <strong>{a.title}</strong>
          <div class="artist">{a.artist}</div>
          <div class="actions">
            <Button variant="primary"  size="sm" on:click={() => saveDiary(a)}>Add to Collection</Button>
            <Button variant="secondary" size="sm" on:click={() => saveListen(a)}>Add to Backlog</Button>
          </div>
        </div>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .title { margin:.5rem 0 1rem; font-size:1.25rem; }

  .search {
    display:flex; gap:.5rem; margin-bottom: 1rem;
  }
  .search input {
    flex:1;
    background:#151515;
    border:1px solid #2a2a2a;
    color:#fff;
    padding:.5rem .6rem;
    border-radius:8px;
    outline:none;
  }
  .search input:focus { border-color:#3a7afe; }

  .grid { list-style:none; padding:0; margin:0; display:grid; gap:.75rem; }
  .card {
    display:flex; gap:.75rem; padding:.75rem;
    border:1px solid var(--line); border-radius:10px; background:var(--panel);
  }
  .cover { width:64px; height:64px; border-radius:6px; object-fit:cover; }
  .meta { display:flex; flex-direction:column; gap:.35rem; }
  .artist { color:#bbb; font-size:.9rem; }
  .actions { display:flex; gap:.5rem; flex-wrap:wrap; }

  .muted { opacity:.8; }
  .error { color:#ff6b6b; }
</style>