// @ts-check
import { json } from '@sveltejs/kit';
import { spotifyFetchApp } from '$lib/server/spotify.js';
import { cacheGet, cacheSet } from '$lib/server/cache.js';

/** ----- Minimal Spotify shapes (JSDoc) ----- */
/** @typedef {{ id?: string, name?: string, images?: Array<{url?: string}>, owner?: { id?: string, display_name?: string } }} SpotifyPlaylist */
/** @typedef {{ id?: string, name?: string, images?: Array<{url?: string}>, artists?: Array<{ name?: string }> }} SpotifyAlbumLike */
/** @typedef {{ track?: { album?: SpotifyAlbumLike } }} SpotifyPlaylistItem */

/** Map Spotify album -> your Album shape
 *  @param {SpotifyAlbumLike | undefined} item
 *  @returns {import('$lib/stores/albums.js').Album}
 */
function mapAlbum(item) {
  return {
    id: item?.id ? `spotify:album:${item.id}` : crypto.randomUUID(),
    title: item?.name ?? 'Unknown',
    artist: item?.artists?.[0]?.name ?? 'Unknown',
    coverUrl: item?.images?.[0]?.url ?? '',
    rating: 0,
    listened: false,
    source: 'spotify'
  };
}

/** @param {SpotifyPlaylist | undefined} p */
function ownedBySpotify(p) {
  return p?.owner?.id === 'spotify' || p?.owner?.display_name === 'Spotify';
}

/** @param {string} code */
function countryNameFor(code) {
  const c = code.toUpperCase();
  /** @type {Record<string,string>} */
  const map = {
    CA: 'Canada',
    US: 'United States',
    GB: 'UK',
    AU: 'Australia',
    NZ: 'New Zealand'
  };
  return map[c] ?? c;
}

/** @param {string} market */
function top50NamesForMarket(market) {
  const name = countryNameFor(market);
  return [
    `Top 50 - ${name}`,
    `Top 50 ${name}`,
    `${name} Top 50`,
    // fallbacks
    'Top 50 - Global',
    'Global Top 50',
    "Today's Top Hits"
  ];
}

/** Case-insensitive equality
 *  @param {unknown} a
 *  @param {unknown} b
 */
function eq(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
}

/** Case-insensitive substring
 *  @param {unknown} a
 *  @param {unknown} b
 */
function includes(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a.toLowerCase().includes(b.toLowerCase());
}

/** Pick best playlist by desired names (prefer Spotify-owned)
 *  @param {SpotifyPlaylist[]} items
 *  @param {string[]} names
 *  @returns {{ id: string, name: string } | null}
 */
function chooseByNames(items, names) {
  for (const n of names) {
    const owned = items.find((p) => eq(p?.name, n) && ownedBySpotify(p));
    if (owned?.id && owned.name) return { id: owned.id, name: owned.name };
    const any = items.find((p) => eq(p?.name, n));
    if (any?.id && any.name) return { id: any.id, name: any.name };
  }
  for (const n of names) {
    const owned = items.find((p) => includes(p?.name, n) && ownedBySpotify(p));
    if (owned?.id && owned.name) return { id: owned.id, name: owned.name };
    const any = items.find((p) => includes(p?.name, n));
    if (any?.id && any.name) return { id: any.id, name: any.name };
  }
  return null;
}

/** Fetch playlist tracks (paginated) → unique albums
 *  @param {string} playlistId
 *  @param {string} market
 *  @returns {Promise<import('$lib/stores/albums.js').Album[]>}
 */
async function fetchUniqueAlbumsFromPlaylist(playlistId, market) {
  let path = `/v1/playlists/${playlistId}/tracks?limit=50&market=${encodeURIComponent(market)}`;
  /** @type {SpotifyPlaylistItem[]} */ const all = [];
  while (path) {
    const r = await spotifyFetchApp(path);
    if (!r.ok) break;
    const page = /** @type {{ items?: SpotifyPlaylistItem[], next?: string }} */ (await r.json().catch(() => ({})));
    all.push(...(page?.items ?? []));
    if (page?.next) {
      const u = new URL(page.next);
      path = u.pathname + u.search;
    } else {
      path = '';
    }
  }
  /** @type {Record<string, boolean>} */ const seen = {};
  /** @type {SpotifyAlbumLike[]} */ const albums = [];
  for (const it of all) {
    const a = it?.track?.album;
    const id = a?.id;
    if (id && !seen[id]) { seen[id] = true; albums.push(a); }
  }
  return albums.map(mapAlbum);
}

/** GET /api/spotify/trending
 *  @param {import('@sveltejs/kit').RequestEvent} event
 */
export async function GET(event) {
  const debug = event.url.searchParams.get('debug') === '1';

  // Resolve market: query → /api/spotify/me → default CA
  let market = (event.url.searchParams.get('market') || '').toUpperCase();
  if (!market) {
    try {
      const meRsp = await event.fetch('/api/spotify/me');
      if (meRsp.ok) {
        const me = /** @type {{country?: string}} */ (await meRsp.json());
        if (typeof me?.country === 'string') market = me.country.toUpperCase();
      }
    } catch { /* ignore */ }
  }
  if (!market) market = 'CA';

  // Cache per market (5 min)
  const cacheKey = `trending:${market}`;
  const cached = !debug && cacheGet(cacheKey);
  if (cached) return json(cached);

  /** @type {{steps: string[], errors: Array<{where:string,status?:number,body?:string}>, chosen?: {id:string,name:string,via:string}}} */
  const diag = { steps: [], errors: [] };

  const candidates = top50NamesForMarket(market);

  try {
    // A) Category toplists (region-aware)
    diag.steps.push('category:toplists');
    {
      const r = await spotifyFetchApp(`/v1/browse/categories/toplists/playlists?country=${encodeURIComponent(market)}&limit=50`);
      if (!r.ok) {
        diag.errors.push({ where: 'category:toplists', status: r.status, body: await r.text().catch(() => '') });
      } else {
        const data = /** @type {{ playlists?: { items?: SpotifyPlaylist[] } }} */ (await r.json().catch(() => ({})));
        const items = data?.playlists?.items ?? [];
        const chosen = chooseByNames(items, candidates);
        if (chosen) {
          const albums = await fetchUniqueAlbumsFromPlaylist(chosen.id, market);
          const payload = { albums, market };
          if (!debug) cacheSet(cacheKey, payload, 5 * 60 * 1000);
          return json(debug ? { ...payload, diag: { ...diag, chosen: { ...chosen, via: 'category' } } } : payload);
        }
      }
    }

    // B) Featured playlists (region-aware)
    diag.steps.push('featured');
    {
      const r = await spotifyFetchApp(`/v1/browse/featured-playlists?country=${encodeURIComponent(market)}&limit=50`);
      if (!r.ok) {
        diag.errors.push({ where: 'featured', status: r.status, body: await r.text().catch(() => '') });
      } else {
        const data = /** @type {{ playlists?: { items?: SpotifyPlaylist[] } }} */ (await r.json().catch(() => ({})));
        const items = data?.playlists?.items ?? [];
        const chosen = chooseByNames(items, candidates);
        if (chosen) {
          const albums = await fetchUniqueAlbumsFromPlaylist(chosen.id, market);
          const payload = { albums, market };
          if (!debug) cacheSet(cacheKey, payload, 5 * 60 * 1000);
          return json(debug ? { ...payload, diag: { ...diag, chosen: { ...chosen, via: 'featured' } } } : payload);
        }
      }
    }

    // C) Search fallbacks
    diag.steps.push('search');
    for (const q of candidates) {
      const r = await spotifyFetchApp(`/v1/search?type=playlist&limit=20&q=${encodeURIComponent(q)}`);
      if (!r.ok) {
        diag.errors.push({ where: `search:${q}`, status: r.status, body: await r.text().catch(() => '') });
        continue;
      }
      const data = /** @type {{ playlists?: { items?: SpotifyPlaylist[] } }} */ (await r.json().catch(() => ({})));
      const items = data?.playlists?.items ?? [];
      const chosen = chooseByNames(items, [q]);
      if (chosen) {
        const albums = await fetchUniqueAlbumsFromPlaylist(chosen.id, market);
        const payload = { albums, market };
        if (!debug) cacheSet(cacheKey, payload, 5 * 60 * 1000);
        return json(debug ? { ...payload, diag: { ...diag, chosen: { ...chosen, via: `search:${q}` } } } : payload);
      }
    }

    // Nothing found
    return json(debug ? { albums: [], market, diag } : { albums: [], market });
  } catch (e) {
    const body = e instanceof Error ? e.message : String(e);
    diag.errors.push({ where: 'exception', body });
    return json({ albums: [], market, diag }, { status: 500 });
  }
}