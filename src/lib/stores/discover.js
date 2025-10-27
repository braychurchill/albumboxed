// Client-side cache for Discover rails
// Works with Svelte 5 + @ts-check

import { writable, get } from 'svelte/store';

/** @typedef {{ trending: any[], releases: any[], personalized: any[], ts: number, loading: boolean, error: string | null }} DiscoverState */

const TTL_MS = 5 * 60 * 1000;        // 5 min cache window
const BG_REVALIDATE_MS = 60 * 1000;  // quiet refresh after 1 min

/** @type {DiscoverState} */
const initial = {
  trending: [],
  releases: [],
  personalized: [],
  ts: 0,
  loading: false,
  error: null
};

/** @type {import('svelte/store').Writable<DiscoverState>} */
export const discover = writable(initial);

/**
 * Ensure rails exist; fetch only if empty/stale.
 * @param {boolean} loggedIn
 * @param {boolean} [background=false] - if true, keeps UI in non-loading state
 * @returns {Promise<DiscoverState>}
 */
export async function ensureDiscover(loggedIn, background = false) {
  const d = get(discover);
  const fresh =
    Date.now() - d.ts < TTL_MS &&
    d.trending.length > 0 &&
    d.releases.length > 0 &&
    (!loggedIn || d.personalized.length > 0);

  if (fresh) return d;

  if (!background) discover.update((v) => ({ ...v, loading: true, error: null }));

  try {
    const [tr, nr, pr] = await Promise.all([
      fetch('/api/spotify/trending').then((r) => r.json()),
      fetch('/api/spotify/new-releases?country=US&limit=20').then((r) => r.json()),
      loggedIn
        ? fetch('/api/spotify/recs').then((r) => r.json()).catch(() => ({ albums: [] }))
        : Promise.resolve({ albums: [] })
    ]);

    /** @type {DiscoverState} */
    const payload = {
      trending: tr?.albums ?? [],
      releases: nr?.albums ?? [],
      personalized: pr?.albums ?? [],
      ts: Date.now(),
      loading: false,
      error: null
    };

    discover.set(payload);

    // Quietly revalidate soon after first load (optional)
    if (!background) {
      setTimeout(() => {
        ensureDiscover(loggedIn, true).catch(() => {});
      }, BG_REVALIDATE_MS);
    }

    return payload;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    discover.update((v) => ({ ...v, loading: false, error: msg }));
    return get(discover);
  }
}

/**
 * Force a hard refresh (e.g., pull-to-refresh)
 * @param {boolean} loggedIn
 * @returns {Promise<DiscoverState>}
 */
export async function refreshDiscover(loggedIn) {
  discover.update((v) => ({ ...v, loading: true, error: null, ts: 0 }));
  return ensureDiscover(loggedIn, false);
}