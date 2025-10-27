// @ts-check
import { json } from '@sveltejs/kit';
import { spotifyFetch, spotifyFetchApp } from '$lib/server/spotify.js';
import { cacheGet, cacheSet } from '$lib/server/cache.js';

/** Minimal shapes */
/** @typedef {{ id?: string, name?: string, images?: Array<{url?: string}>, artists?: Array<{id?: string, name?: string}> }} SpotifyAlbum */
/** @typedef {{ id?: string, album?: SpotifyAlbum, artists?: Array<{id?: string, name?: string}> }} SpotifyTrack */

/** Map a Spotify album -> your Album shape
 *  @param {SpotifyAlbum | undefined} item
 *  @returns {import('$lib/stores/albums.js').Album}
 */
function mapAlbum(item) {
  const artistName =
    item?.artists?.[0]?.name && typeof item.artists[0].name === 'string'
      ? item.artists[0].name
      : 'Unknown';
  return {
    id: item?.id ? `spotify:album:${item.id}` : crypto.randomUUID(),
    title: item?.name ?? 'Unknown',
    artist: artistName,
    coverUrl: item?.images?.[0]?.url ?? '',
    rating: 0,
    listened: false,
    source: 'spotify'
  };
}

/** Get /v1/me via our own endpoint so cookies/refresh logic are reused.
 *  @param {import('@sveltejs/kit').RequestEvent} event
 */
async function getMeViaProxy(event) {
  const rsp = await event.fetch('/api/spotify/me');
  if (!rsp.ok) throw new Response(await rsp.text(), { status: rsp.status });
  return /** @type {any} */ (await rsp.json());
}

/** Fetch JSON with the user token (do not throw)
 *  @param {import('@sveltejs/kit').RequestEvent} event
 *  @param {string} path
 *  @returns {Promise<{ ok: boolean, status: number, json: any }>}
 */
async function fetchJsonUser(event, path) {
  const rsp = await spotifyFetch(event, path);
  if (!rsp.ok) return { ok: false, status: rsp.status, json: null };
  const j = await rsp.json().catch(() => null);
  return { ok: true, status: 200, json: j };
}

/** Expand artists via related-artists (user-independent)
 *  @param {string[]} artistIds
 *  @param {number} [take=10]
 *  @returns {Promise<string[]>}
 */
async function relatedArtistsExpand(artistIds, take = 10) {
  /** @type {string[]} */ const pool = [];
  for (const id of artistIds.slice(0, 5)) {
    const rsp = await spotifyFetchApp(`/v1/artists/${id}/related-artists`);
    if (!rsp.ok) continue;
    const data = await rsp.json().catch(() => ({}));
    /** @type {any[]} */
    const items = data?.artists ?? [];
    for (const a of items) if (a?.id) pool.push(/** @type {string} */ (a.id));
  }
  const uniq = Array.from(new Set(pool));
  return uniq.slice(0, take);
}

/**
 * Build seed artists/tracks from multiple sources, then expand with related artists.
 * Requires scopes: user-top-read, user-read-recently-played, user-library-read, user-follow-read.
 * Falls back to market-popular (app token) only if absolutely nothing user-based is available.
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {string} market
 * @returns {Promise<{ artistIds: string[], trackIds: string[], source: string[] }>}
 */
async function getSeeds(event, market) {
  /** @type {string[]} */ let artistIds = [];
  /** @type {string[]} */ let trackIds = [];
  /** @type {string[]} */ const source = [];

  // 1) Top artists/tracks (short_term → medium_term → long_term)
  for (const range of /** @type {const} */ (['short_term', 'medium_term', 'long_term'])) {
    const topA = await fetchJsonUser(event, `/v1/me/top/artists?time_range=${range}&limit=15`);
    const topT = await fetchJsonUser(event, `/v1/me/top/tracks?time_range=${range}&limit=15`);
    if (topA.ok) {
      const a = (topA.json?.items ?? [])
        .map(/** @param {any} x */ (x) => x?.id)
        .filter(Boolean);
      if (a.length) { artistIds.push(.../** @type {string[]} */ (a)); source.push(`top_artists:${range}`); }
    }
    if (topT.ok) {
      const t = (topT.json?.items ?? [])
        .map(/** @param {any} x */ (x) => x?.id)
        .filter(Boolean);
      if (t.length) { trackIds.push(.../** @type {string[]} */ (t)); source.push(`top_tracks:${range}`); }
    }
    if (artistIds.length + trackIds.length >= 6) break; // good enough
  }

  // 2) Recently played
  if (artistIds.length + trackIds.length < 6) {
    const rec = await fetchJsonUser(event, '/v1/me/player/recently-played?limit=50');
    if (rec.ok) {
      /** @type {string[]} */ const aIds = [];
      /** @type {string[]} */ const tIds = [];
      for (const it of rec.json?.items ?? []) {
        const tr = it?.track;
        if (tr?.id) tIds.push(/** @type {string} */ (tr.id));
        for (const ar of tr?.artists ?? []) if (ar?.id) aIds.push(/** @type {string} */ (ar.id));
      }
      if (aIds.length) { artistIds.push(...aIds); source.push('recent_artists'); }
      if (tIds.length) { trackIds.push(...tIds); source.push('recent_tracks'); }
    }
  }

  // 3) Saved albums
  if (artistIds.length + trackIds.length < 6) {
    const saved = await fetchJsonUser(event, '/v1/me/albums?limit=50');
    if (saved.ok) {
      /** @type {string[]} */ const aIds = [];
      for (const it of saved.json?.items ?? []) {
        for (const ar of it?.album?.artists ?? []) if (ar?.id) aIds.push(/** @type {string} */ (ar.id));
      }
      if (aIds.length) { artistIds.push(...aIds); source.push('saved_albums'); }
    }
  }

  // 4) Followed artists
  if (artistIds.length + trackIds.length < 6) {
    const fol = await fetchJsonUser(event, '/v1/me/following?type=artist&limit=50');
    if (fol.ok) {
      const items = fol.json?.artists?.items ?? [];
      const ids = items
        .map(/** @param {any} a */ (a) => a?.id)
        .filter(Boolean);
      if (ids.length) { artistIds.push(.../** @type {string[]} */ (ids)); source.push('followed_artists'); }
    }
  }

  // De-dupe and cap before expansion
  artistIds = Array.from(new Set(artistIds));
  trackIds  = Array.from(new Set(trackIds));

  // 5) Expand with related artists if we have a few seeds
  if (artistIds.length > 0 && artistIds.length < 15) {
    const rel = await relatedArtistsExpand(artistIds, 15);
    if (rel.length) { artistIds.push(...rel); source.push('related_artists'); }
    artistIds = Array.from(new Set(artistIds));
  }

  // 6) Market-popular as last resort (no user data at all)
  if (artistIds.length + trackIds.length === 0) {
    const queries = /** @type {const} */ (['genre:pop', 'genre:hip-hop', 'genre:dance', 'genre:indie', 'genre:rock']);
    /** @type {string[]} */ const found = [];
    for (const q of queries) {
      const rsp = await spotifyFetchApp(`/v1/search?type=artist&market=${encodeURIComponent(market)}&limit=10&q=${encodeURIComponent(q)}`);
      if (!rsp.ok) continue;
      const data = await rsp.json().catch(() => ({}));
      const items = data?.artists?.items ?? [];
      for (const a of items) if (a?.id) found.push(/** @type {string} */ (a.id));
      if (found.length >= 10) break;
    }
    artistIds = Array.from(new Set(found));
    if (artistIds.length) source.push('market_popular');
  }

  // Keep seeds within recommendations constraints (≤5 of each)
  artistIds = artistIds.slice(0, 5);
  trackIds  = trackIds.slice(0, 5);

  return { artistIds, trackIds, source };
}

/** Fallback A: build albums directly from user's top tracks
 *  @param {import('@sveltejs/kit').RequestEvent} event
 *  @param {string} market
 */
async function fallbackFromTopTracks(event, market) {
  const rsp = await spotifyFetch(event, '/v1/me/top/tracks?time_range=short_term&limit=50');
  const data = rsp.ok ? await rsp.json() : { items: [] };

  /** @type {SpotifyTrack[]} */ const tracks = data?.items ?? [];
  /** @type {Record<string, boolean>} */ const seen = {};
  /** @type {SpotifyAlbum[]} */ const albums = [];
  for (const t of tracks) {
    /** @type {SpotifyAlbum | undefined} */ const a = t?.album;
    const id = a?.id;
    if (id && !seen[id]) { seen[id] = true; albums.push(a); }
  }
  return { albums: albums.slice(0, 40).map(mapAlbum), market, _fallback: 'top-tracks' };
}

/** Fallback B: use artist albums (app token) from the user-derived artists
 *  @param {string[]} artistIds
 *  @param {string} market
 *  @returns {Promise<SpotifyAlbum[]>}
 */
async function fallbackFromArtistAlbums(artistIds, market) {
  /** @type {SpotifyAlbum[]} */ const collected = [];
  for (const id of artistIds.slice(0, 8)) {
    const path = `/v1/artists/${id}/albums?include_groups=album&market=${encodeURIComponent(market)}&limit=10`;
    const rsp = await spotifyFetchApp(path);
    if (!rsp.ok) continue;
    const data = await rsp.json();
    const items = /** @type {SpotifyAlbum[]} */ (data?.items ?? []);
    for (const it of items) collected.push(it);
  }

  /** dedupe by id */
  const seen = /** @type {Record<string,boolean>} */ ({});
  const uniq = /** @type {SpotifyAlbum[]} */ ([]);
  for (const a of collected) {
    const id = a?.id;
    if (id && !seen[id]) { seen[id] = true; uniq.push(a); }
  }

  // sort newest first if dates are present
  uniq.sort((a, b) => {
    const ra = /** @type {any} */ (a)?.release_date || '';
    const rb = /** @type {any} */ (b)?.release_date || '';
    return (rb > ra) ? 1 : (rb < ra ? -1 : 0);
  });

  return uniq.slice(0, 40).map(mapAlbum);
}

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function GET(event) {
  const debug = event.url.searchParams.get('debug') === '1';
  /** @type {{ steps: string[], seed?: {artistIds:string[],trackIds:string[],source:string[]}, errors: Array<{where:string,status?:number,body?:string}> }} */
  const diag = { steps: [], errors: [] };

  // Ensure connected via proxy
  let me;
  try {
    diag.steps.push('me-proxy');
    me = await getMeViaProxy(event);
  } catch (e) {
    const body = e instanceof Response ? await e.text() : 'Not connected';
    const status = e instanceof Response ? e.status : 401;
    return json({ error: 'Not connected', diag: { steps: diag.steps, errors: [{ where:'me-proxy', status, body }] } }, { status });
  }

  const userId = /** @type {string} */ (me?.id ?? 'unknown');
  const market = typeof me?.country === 'string' ? /** @type {string} */ (me.country) : 'US';

  // Cache unless debug — include market and user to avoid mixing
  const key = `recs:${userId}:${market}`;
  if (!debug) {
    const cached = cacheGet(key);
    if (cached) return json(cached);
  }

  try {
    diag.steps.push('seeds');
    const { artistIds, trackIds, source } = await getSeeds(event, market);
    diag.seed = { artistIds, trackIds, source };

    // If literally no seeds, go straight to top-tracks fallback
    if (artistIds.length + trackIds.length === 0) {
      diag.steps.push('no-seeds-fallback');
      const fb = await fallbackFromTopTracks(event, market);
      return json(debug ? { ...fb, diag } : fb);
    }

    const params = new URLSearchParams({
      limit: '100',
      market,
      ...(artistIds.length ? { seed_artists: artistIds.join(',') } : {}),
      ...(trackIds.length  ? { seed_tracks:  trackIds.join(',')  } : {})
    });

    const path = `/v1/recommendations?${params.toString()}`;
    diag.steps.push('recommendations');

    // Try with user token first
    let rsp = await spotifyFetch(event, path);

    // If user token fails with 401, retry with app token
    if (!rsp.ok && rsp.status === 401) {
      const body = await rsp.text();
      diag.errors.push({ where: 'recommendations(user)', status: rsp.status, body });

      diag.steps.push('recommendations-app-retry');
      rsp = await spotifyFetchApp(path);
    }

    // If still not ok, switch to artist-albums fallback using *our* artist seeds
    if (!rsp.ok) {
      const body = await rsp.text();
      diag.errors.push({ where: 'recommendations(final)', status: rsp.status, body });

      diag.steps.push('artist-albums-fallback');
      const albums = await fallbackFromArtistAlbums(artistIds, market);

      if (albums.length > 0) {
        const payload = { albums, market, _fallback: 'artist-albums' };
        if (!debug) cacheSet(key, payload, 5 * 60 * 1000);
        return json(debug ? { ...payload, diag } : payload);
      }

      const fb = await fallbackFromTopTracks(event, market);
      return json(debug ? { ...fb, diag } : fb);
    }

    const data = await rsp.json();
    /** @type {SpotifyTrack[]} */ const tracks = data?.tracks ?? [];

    // Dedupe to albums
    /** @type {Record<string, boolean>} */ const seen = {};
    /** @type {SpotifyAlbum[]} */ const albums = [];
    for (const t of tracks) {
      /** @type {SpotifyAlbum | undefined} */ const a = t?.album;
      const id = a?.id;
      if (id && !seen[id]) { seen[id] = true; albums.push(a); }
    }

    const payload = { albums: albums.slice(0, 40).map(mapAlbum), market };
    if (!debug) cacheSet(key, payload, 5 * 60 * 1000);

    return json(debug ? { ...payload, diag } : payload);
  } catch {
    // Hard failure → try top-tracks fallback
    diag.steps.push('fallback-top-tracks');
    const fb = await fallbackFromTopTracks(event, market);
    return json(debug ? { ...fb, diag } : fb);
  }
}