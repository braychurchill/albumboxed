// @ts-check
import { json } from '@sveltejs/kit';
import { spotifyFetchApp } from '$lib/server/spotify.js';
import { cacheGet, cacheSet } from '$lib/server/cache.js';

/** ===== Minimal Spotify shapes we touch ===== */

/** @typedef {{ url?: string }} SpotifyImage */
/** @typedef {{ id?: string, name?: string, display_name?: string }} SpotifyUser */
/** @typedef {{ id?: string, name?: string, owner?: SpotifyUser }} SpotifyPlaylist */
/** @typedef {{ items?: SpotifyPlaylist[] }} SpotifyPlaylistsPage */
/** @typedef {{ playlists?: SpotifyPlaylistsPage }} SpotifyPlaylistsEnvelope */

/** @typedef {{ id?: string, name?: string, images?: SpotifyImage[], artists?: Array<{ id?: string, name?: string }>} } SpotifyAlbum */
/** @typedef {{ track?: { album?: SpotifyAlbum } }} SpotifyPlaylistTrackItem */
/** @typedef {{ items?: SpotifyPlaylistTrackItem[], next?: string }} SpotifyPlaylistTracksPage */

/** @typedef {{ id: string, title: string, artist: string, coverUrl: string, rating: number, listened: boolean, source: 'spotify' }} Album */

/** ===== Helpers ===== */

/**
 * Map Spotify album -> our Album shape
 * @param {SpotifyAlbum | undefined} item
 * @returns {Album}
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

/**
 * Prefer Spotify-owned “Top 50 - Global”
 * @param {unknown} name
 */
function isTop50Global(name) {
  return typeof name === 'string' && /top\s*50.*global|global.*top\s*50/i.test(name);
}

/**
 * @param {SpotifyPlaylist | undefined} p
 */
function ownedBySpotify(p) {
  return p?.owner?.id === 'spotify' || p?.owner?.display_name === 'Spotify';
}

/** ===== Route ===== */

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function GET(event) {
  const debug = event.url.searchParams.get('debug') === '1';
  const market = (event.url.searchParams.get('market') || 'US').toUpperCase();

  const cacheKey = `trending:${market}`;
  const cached = !debug && cacheGet(cacheKey);
  if (cached) return json(cached);

  /** @type {{steps: string[], errors: Array<{where: string, status?: number, body?: string}>, chosen?: {id?: string, name?: string, via?: string}}} */
  const diag = { steps: [], errors: [] };

  try {
    // STEP 1: category=toplists featured playlists (fast path)
    diag.steps.push('category:toplists');
    let rsp = await spotifyFetchApp(`/v1/browse/categories/toplists/playlists?country=${encodeURIComponent(market)}&limit=50`);
    if (!rsp.ok) {
      diag.errors.push({ where: 'category:toplists', status: rsp.status, body: await rsp.text().catch(() => '') });
    } else {
      /** @type {SpotifyPlaylistsEnvelope} */
      const data = await rsp.json().catch(() => ({}));
      /** @type {SpotifyPlaylist[]} */
      const items = data?.playlists?.items ?? [];
      /** @type {SpotifyPlaylist | undefined} */
      let chosen = items.find((p) => isTop50Global(p?.name) && ownedBySpotify(p));
      if (!chosen) chosen = items.find((p) => isTop50Global(p?.name));
      if (chosen?.id) {
        diag.chosen = { id: chosen.id, name: chosen.name, via: 'category' };
        const albums = await fetchUniqueAlbumsFromPlaylist(chosen.id, market);
        const payload = { albums, market };
        if (!debug) cacheSet(cacheKey, payload, 5 * 60 * 1000);
        return json(debug ? { ...payload, diag } : payload);
      }
    }

    // STEP 2: featured playlists
    diag.steps.push('featured');
    rsp = await spotifyFetchApp(`/v1/browse/featured-playlists?country=${encodeURIComponent(market)}&limit=50`);
    if (!rsp.ok) {
      diag.errors.push({ where: 'featured', status: rsp.status, body: await rsp.text().catch(() => '') });
    } else {
      /** @type {{ playlists?: { items?: SpotifyPlaylist[] }}} */
      const data = await rsp.json().catch(() => ({}));
      /** @type {SpotifyPlaylist[]} */
      const items = data?.playlists?.items ?? [];
      /** @type {SpotifyPlaylist | undefined} */
      let chosen = items.find((p) => isTop50Global(p?.name) && ownedBySpotify(p));
      if (!chosen) chosen = items.find((p) => isTop50Global(p?.name));
      if (chosen?.id) {
        diag.chosen = { id: chosen.id, name: chosen.name, via: 'featured' };
        const albums = await fetchUniqueAlbumsFromPlaylist(chosen.id, market);
        const payload = { albums, market };
        if (!debug) cacheSet(cacheKey, payload, 5 * 60 * 1000);
        return json(debug ? { ...payload, diag } : payload);
      }
    }

    // STEP 3: search fallbacks
    diag.steps.push('search');
    /** @type {string[]} */
    const queries = ['Top 50 - Global', 'Global Top 50', 'Top 50 Global', "Today's Top Hits"];

    for (const q of queries) {
      const r = await spotifyFetchApp(`/v1/search?type=playlist&limit=20&q=${encodeURIComponent(q)}`);
      if (!r.ok) {
        diag.errors.push({ where: `search:${q}`, status: r.status, body: await r.text().catch(() => '') });
        continue;
      }
      /** @type {{ playlists?: { items?: SpotifyPlaylist[] }}} */
      const data = await r.json().catch(() => ({}));
      /** @type {SpotifyPlaylist[]} */
      const items = data?.playlists?.items ?? [];

      /** @type {SpotifyPlaylist | undefined} */
      let chosen = items.find((p) => isTop50Global(p?.name) && ownedBySpotify(p));
      if (!chosen) chosen = items.find((p) => isTop50Global(p?.name));
      if (!chosen && q.includes("Today's Top Hits")) {
        chosen = items.find(ownedBySpotify);
      }
      if (chosen?.id) {
        diag.chosen = { id: chosen.id, name: chosen.name, via: `search:${q}` };
        const albums = await fetchUniqueAlbumsFromPlaylist(chosen.id, market);
        const payload = { albums, market };
        if (!debug) cacheSet(cacheKey, payload, 5 * 60 * 1000);
        return json(debug ? { ...payload, diag } : payload);
      }
    }

    return json(debug ? { albums: [], market, diag } : { albums: [], market });
  } catch (e) {
    const body = e instanceof Error ? e.message : String(e);
    diag.errors.push({ where: 'exception', body });
    return json({ albums: [], market, diag }, { status: 500 });
  }
}

/**
 * Fetch playlist tracks (paginated) → unique albums (order preserved)
 * @param {string} playlistId
 * @param {string} market
 * @returns {Promise<Album[]>}
 */
async function fetchUniqueAlbumsFromPlaylist(playlistId, market) {
  let path = `/v1/playlists/${playlistId}/tracks?limit=50&market=${encodeURIComponent(market)}`;
  /** @type {SpotifyPlaylistTrackItem[]} */
  const all = [];

  while (path) {
    const r = await spotifyFetchApp(path);
    if (!r.ok) break;
    /** @type {SpotifyPlaylistTracksPage} */
    const page = await r.json().catch(() => ({}));
    all.push(...(page?.items ?? []));
    if (page?.next) {
      const u = new URL(page.next);
      path = u.pathname + u.search;
    } else {
      path = '';
    }
  }

  /** @type {Record<string, boolean>} */
  const seen = {};
  /** @type {SpotifyAlbum[]} */
  const albums = [];

  for (const it of all) {
    const a = it?.track?.album;
    const id = a?.id;
    if (id && !seen[id]) { seen[id] = true; albums.push(a); }
  }

  return albums.map(mapAlbum);
}