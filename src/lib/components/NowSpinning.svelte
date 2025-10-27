<script>
// @ts-check

// Use whichever you exported:
//   import { albums as albumsStore } from '$lib/stores/albums.js';
//   import { diary as albumsStore } from '$lib/stores/albums.js';
//   import { collection as albumsStore } from '$lib/stores/albums.js';
import { albums as albumsStore } from '$lib/stores/albums.js';

/** @typedef {{
 *   id: string;
 *   title: string;
 *   artist: string;
 *   coverUrl?: string;
 *   rating?: number;
 *   listened?: boolean;
 *   addedAt?: string;         // ISO date
 *   source?: 'spotify'|'manual';
 * }} Album */

/** @type {Album | null} */
let latest = $state(null);

/** @param {Album} a */
function tsOf(a) {
  return Date.parse(a.addedAt ?? '') || 0;
}

$effect(() => {
  const unsub = albumsStore.subscribe((list) => {
    const arr = Array.isArray(list) ? /** @type {Album[]} */ (list) : [];
    if (arr.length === 0) { latest = null; return; }

    // Prefer most recent by addedAt; fallback to last entry
    const withTime = arr.filter(Boolean);
    latest = withTime.length
      ? withTime.reduce((acc, cur) => (tsOf(cur) > tsOf(acc) ? cur : acc), withTime[0])
      : arr[arr.length - 1];
  });
  return () => unsub?.();
});
</script>

<section class="nowspin card">
  {#if latest}
    <div class="left">
      {#if latest.coverUrl}
        <img src={latest.coverUrl} alt={latest.title} />
      {/if}
    </div>
    <div class="right">
      <div class="eyebrow">Now Spinning</div>
      <div class="title">{latest.title}</div>
      <div class="artist">{latest.artist}</div>
    </div>
  {:else}
    <div class="right">
      <div class="eyebrow">Now Spinning</div>
      <div class="artist">Nothing playing yet.</div>
    </div>
  {/if}
</section>

<style>
  .card{display:flex;gap:12px;padding:12px;border:1px solid var(--line);border-radius:var(--radius);background:var(--panel);}
  .left img{width:72px;height:72px;object-fit:cover;border-radius:10px;}
  .eyebrow{font-size:.7rem;opacity:.7;margin-bottom:4px;}
  .title{font-weight:600;}
  .artist{opacity:.9;}
</style>