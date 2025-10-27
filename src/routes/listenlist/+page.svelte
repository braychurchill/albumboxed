<script>
// @ts-check
/** @typedef {import('$lib/stores/albums.js').Album} Album */

import { listenList, removeFromListenList } from '$lib/stores/listenlist.js';
import { addToDiary } from '$lib/stores/albums.js';
import Button from '$lib/components/ui/Button.svelte';

/** @param {Album} a */
function moveToCollection(a) {
  addToDiary(a);
  removeFromListenList(a.id);
}

/** @param {string} id */
function removeQueued(id) {
  removeFromListenList(id);
}
</script>

<h1 class="title">Backlog</h1>

{#if $listenList.length === 0}
  <p class="placeholder">Nothing in your Backlog yet. Find something on Discover and add it here.</p>
{:else}
  <ul class="list">
    {#each $listenList as a (a.id)}
      <li class="row">
        {#if a.coverUrl}
          <img class="cover" src={a.coverUrl} alt="" width="48" height="48" />
        {/if}

        <div class="meta">
          <div class="t"><strong>{a.title}</strong> — {a.artist}</div>
        </div>

        <div class="actions">
          <!-- Primary action: move to Collection -->
          <Button variant="primary" size="sm" on:click={() => moveToCollection(a)}>
            Add to Collection
          </Button>

          <!-- Secondary action: remove from Backlog -->
          <Button variant="danger" size="sm" on:click={() => removeQueued(a.id)}>
            Remove
          </Button>
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
  .actions { display: inline-flex; gap: .4rem; align-items: center; }
</style>