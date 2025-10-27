<script>
// @ts-check
import { albums, removeFromDiary, rateAlbum, toggleListened } from '$lib/stores/albums.js';
import Button from '$lib/components/ui/Button.svelte';

/** @param {string} id */
function rm(id) {
  removeFromDiary(id);
}

/** @param {string} id */
function inc(id) {
  const r = getRating(id) ?? 0;
  rateAlbum(id, Math.min(5, r + 1));
}

/** @param {string} id */
function dec(id) {
  const r = getRating(id) ?? 0;
  rateAlbum(id, Math.max(0, r - 1));
}

/** @param {string} id */
function toggle(id) {
  toggleListened(id);
}

/** @param {string} id */
function getRating(id) {
  const a = $albums.find((x) => x.id === id);
  return a?.rating ?? 0;
}
</script>

<h1 class="title">Collection</h1>

{#if $albums.length === 0}
  <p class="placeholder">No albums in your Collection yet.</p>
{:else}
  <ul class="list">
    {#each $albums.toReversed() as a (a.id)}
      <li class="row">
        {#if a.coverUrl}
          <img class="cover" src={a.coverUrl} alt="" width="48" height="48" />
        {/if}

        <div class="meta">
          <div class="t"><strong>{a.title}</strong> — {a.artist}</div>
          <div class="s">Rating: {a.rating ?? 0} · {a.listened ? 'Listened' : 'Unfinished'}</div>
        </div>

        <div class="actions">
          <Button variant="secondary" size="sm" on:click={() => dec(a.id)}>−</Button>
          <Button variant="secondary" size="sm" on:click={() => inc(a.id)}>+</Button>
          <Button variant="ghost" size="sm" on:click={() => toggle(a.id)}>
            {a.listened ? 'Unmark' : 'Mark'}
          </Button>
          <Button variant="danger" size="sm" on:click={() => rm(a.id)}>Remove</Button>
        </div>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .title { margin: 0 0 8px; font-size: 1.25rem; }
  .list { list-style: none; padding: 0; margin: 0; display: grid; gap: .5rem; }
  .row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: .75rem;
    border: 1px solid var(--line);
    background: var(--panel);
    border-radius: 12px;
    padding: .5rem .6rem;
  }
  .cover { border-radius: 8px; object-fit: cover; }
  .meta .t { line-height: 1.2; }
  .meta .s { opacity: .8; font-size: .85rem; margin-top: 2px; }
  .actions { display: inline-flex; gap: .4rem; align-items: center; }
</style>