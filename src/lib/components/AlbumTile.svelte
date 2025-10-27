<script>
// @ts-check
/** @typedef {import('$lib/stores/albums.js').Album} Album */

import Button from '$lib/components/ui/Button.svelte';
import { albums } from '$lib/stores/albums.js';
import { listenList } from '$lib/stores/listenlist.js';

/* Runes props — keep these untyped to avoid “never” errors downstream */
const { album, onDiary = () => {}, onQueue = () => {} } = $props();

/* Local mirrors so runes react inside <script> */
/** @type {Album[]} */ let collection = $state([]);
/** @type {Album[]} */ let backlog    = $state([]);

$effect(() => {
  const u1 = albums.subscribe((v) => { collection = Array.isArray(v) ? v : []; });
  const u2 = listenList.subscribe((v) => { backlog    = Array.isArray(v) ? v : []; });
  return () => { u1?.(); u2?.(); };
});

/* Derived flags */
const inCollection = $derived(collection.some((x) => x.id === album?.id));
const inBacklog    = $derived(backlog.some((x) => x.id === album?.id));

/* Optional quick debug if you still don’t see green
$effect(() => {
  console.log('tile', album?.id, { inCollection, inBacklog, coll: collection.map(x=>x.id) });
});
*/
</script>

<div class="tile">
  {#if album?.coverUrl}
    <img class="cover" src={album.coverUrl} alt={album.title} />
  {:else}
    <div class="skeleton" aria-hidden="true"></div>
  {/if}

  <div class="name" title={album?.title}>{album?.title}</div>
  <div class="artist" title={album?.artist}>{album?.artist}</div>

  <div class="actions">
    <!-- Add to Collection -->
    <Button
      variant={inCollection ? 'success' : 'primary'}
      size="sm"
      disabled={inCollection}
      on:click={() => { if (!inCollection) onDiary(/** @type {Album} */(album)); }}
    >
      {#if inCollection}✅ Added{:else}Collect{/if}
    </Button>

    <!-- Add to Backlog -->
    <Button
      variant="secondary"
      size="sm"
      disabled={inBacklog}
      on:click={() => { if (!inBacklog) onQueue(/** @type {Album} */(album)); }}
    >
      {#if inBacklog}📌 Queued{:else}Add to Backlog{/if}
    </Button>
  </div>
</div>

<style>
  .tile { width: 160px; display: grid; gap: .35rem; scroll-snap-align: start; }
  .cover, .skeleton { width: 100%; height: 160px; border-radius: 10px; object-fit: cover; background: #222; }
  .name   { font-size: .9rem; font-weight: 600; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
  .artist { font-size: .8rem; color: var(--muted); white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
  .actions { display: flex; gap: .4rem; flex-wrap: wrap; }

  /* Fallback in case buttons.css wasn’t loaded yet */
  :global(.btn.v-success){
    background:#15c25a !important;
    border-color:transparent !important;
    color:#000 !important;
  }
  :global(.btn.v-success:hover){ filter: brightness(1.05); }
</style>