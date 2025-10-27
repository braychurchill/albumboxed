// @ts-check
import { json } from '@sveltejs/kit';
import { spotifyFetchApp } from '$lib/server/spotify.js';

/** ========= Minimal types ========= */
/** @typedef {{ url?: string }} SpotifyImage */
/** @typedef {{ id?: string, name?: string }} SpotifyArtist */
/** @typedef {{ id?: string, name?: string, images?: SpotifyImage[], artists?: SpotifyArtist[], release_date?: string, popularity?: number }} SpotifyAlbumFull */
/** @typedef {{ id?: string, name?: string, album?: SpotifyAlbumFull, artists?: SpotifyArtist[] }} SpotifyTrack */
/** @typedef {{ albums?: { items?: SpotifyAlbumFull[] }, artists?: { items?: SpotifyArtist[] }, tracks?: { items?: SpotifyTrack[] } }} MultiSearchResponse */
/** @typedef {{ items?: SpotifyAlbumFull[], next?: string }} AlbumPage */
/** @typedef {{ album: SpotifyAlbumFull, score: number }} ScoredAlbum */

/** Map to your Album shape
 * @param {SpotifyAlbumFull | undefined} item
 * @returns {import('$lib/stores/albums.js').Album}
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

/** Normalize string for matching
 * @param {string} s
 */
function norm(s) {
  return s.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

/** Basic scoring:
 *  - Exact album title match: +100
 *  - Starts-with album title: +70
 *  - Includes album title word: +50
 *  - Exact artist match: +60
 *  - Starts-with artist: +40
 *  - Includes artist word: +25
 *  - Source boosts: album=+20, track=+12, artist=+8
 * @param {SpotifyAlbumFull} a
 * @param {string} q
 * @param {'album'|'artist'|'track'} src
 */
function scoreAlbum(a, q, src) {
  const nq = norm(q);
  const at = norm(a?.name ?? '');
  const an = norm(a?.artists?.[0]?.name ?? '');
  let score = 0;

  if (at === nq) score += 100;
  else if (at.startsWith(nq)) score += 70;
  else if (at.includes(nq)) score += 50;

  if (an === nq) score += 60;
  else if (an.startsWith(nq)) score += 40;
  else if (an.includes(nq)) score += 25;

  if (src === 'album') score += 20;
  else if (src === 'track') score += 12;
  else if (src === 'artist') score += 8;

  // small recency bonus if release_date looks newer
  const rd = a?.release_date ?? '';
  if (rd >= '2024-01-01') score += 5;

  return score;
}

/** Safe put into scored pool (guards undefined ids)
 * @param {Record<string, ScoredAlbum>} pool
 * @param {SpotifyAlbumFull | undefined} album
 * @param {number} score
 */
function put(pool, album, score) {
  const id = album?.id;
  if (!id) return;
  const prev = pool[id];
  if (!prev || score > prev.score) {
    pool[id] = { album: /** @type {SpotifyAlbumFull} */ (album), score };
  }
}

/** Fetch an artist’s albums (deduped), newest first
 * @param {string} artistId
 * @param {string} market
 * @param {number} cap
 * @returns {Promise<SpotifyAlbumFull[]>}
 */
async function fetchArtistAlbums(artistId, market, cap = 40) {
  let path = `/v1/artists/${artistId}/albums?include_groups=album,single&market=${encodeURIComponent(market)}&limit=20`;
  /** @type {SpotifyAlbumFull[]} */ const all = [];
  /** @type {Record<string, boolean>} */ const seen = {};
  while (path) {
    const r = await spotifyFetchApp(path);
    if (!r.ok) break;
    /** @type {AlbumPage} */
    const page = await r.json().catch(() => ({}));
    for (const it of page.items ?? []) {
      const id = it?.id;
      if (id && !seen[id]) { seen[id] = true; all.push(it); }
    }
    if (page?.next) {
      const u = new URL(page.next);
      path = u.pathname + u.search;
    } else {
      path = '';
    }
    if (all.length >= cap) break;
  }
  all.sort((a, b) => (b.release_date ?? '').localeCompare(a.release_date ?? ''));
  return all;
}

/** GET /api/spotify/search?q=...&limit=...&market=US&debug=1 */
export async function GET(event) {
  const q = event.url.searchParams.get('q')?.trim() ?? '';
  const limit = Math.max(1, Math.min(30, Number(event.url.searchParams.get('limit') ?? 10)));
  const market = (event.url.searchParams.get('market') || 'US').toUpperCase();
  const debug = event.url.searchParams.get('debug') === '1';

  if (!q) return json({ error: 'missing q' }, { status: 400 });

  /** @type {{ steps: string[], sources: Array<{src:'album'|'artist'|'track', count:number}> }} */
  const diag = { steps: [], sources: [] };

  try {
    // One multi-search: album + artist + track
    diag.steps.push('multi-search');
    const multiPath =
      `/v1/search?market=${encodeURIComponent(market)}&limit=10&type=album,artist,track&q=${encodeURIComponent(q)}`;
    const r = await spotifyFetchApp(multiPath);
    if (!r.ok) {
      const body = await r.text();
      return json(debug ? { error: body, status: r.status } : { error: 'Spotify error' }, { status: r.status });
    }
    /** @type {MultiSearchResponse} */
    const data = await r.json().catch(() => ({}));
    const albumsDirect = data?.albums?.items ?? [];
    const artists = data?.artists?.items ?? [];
    const tracks = data?.tracks?.items ?? [];

    // Collect candidates with scores
    /** @type {Record<string, ScoredAlbum>} */
    const pool = {};

    // 1) Direct album results
    for (const a of albumsDirect) {
      const sc = scoreAlbum(a, q, 'album');
      put(pool, a, sc);
    }
    diag.sources.push({ src: 'album', count: albumsDirect.length });

    // 2) Artist albums (top few artists only to limit API calls)
    diag.steps.push('artist-albums');
    for (const artist of artists.slice(0, 3)) {
      if (!artist?.id) continue;
      const disc = await fetchArtistAlbums(artist.id, market, 24);
      for (const a of disc) {
        const sc = scoreAlbum(a, q, 'artist');
        put(pool, a, sc);
      }
    }
    diag.sources.push({ src: 'artist', count: Math.min(artists.length, 3) });

    // 3) Tracks’ parent albums
    const fromTracks = /** @type {SpotifyAlbumFull[]} */ ([]);
    for (const t of tracks) {
      if (t?.album) fromTracks.push(t.album);
    }
    for (const a of fromTracks) {
      const sc = scoreAlbum(a, q, 'track');
      put(pool, a, sc);
    }
    diag.sources.push({ src: 'track', count: fromTracks.length });

    // Dedupe + rank
    const ranked = Object.values(pool)
      .sort((x, y) => {
        if (y.score !== x.score) return y.score - x.score;
        // tie-break by recency if available
        const ra = y.album.release_date ?? '';
        const rb = x.album.release_date ?? '';
        return ra.localeCompare(rb);
      })
      .slice(0, limit)
      .map(({ album }) => album);

    const payload = { albums: ranked.map(mapAlbum), market };
    return json(debug ? { ...payload, diag } : payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(debug ? { error: msg, diag } : { error: 'Spotify error' }, { status: 500 });
  }
}