// @ts-check
import { json } from '@sveltejs/kit';
import { spotifyFetch, spotifyFetchApp } from '$lib/server/spotify.js';
import { cacheGet, cacheSet } from '$lib/server/cache.js';

/** Map Spotify album -> your Album shape
 *  @param {any} item
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

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function GET(event) {
  // Optional override from query; used when no profile country is available
  const countryParam = event.url.searchParams.get('country') ?? 'US';
  const limitRaw = Number(event.url.searchParams.get('limit') ?? 20);
  const limit = Math.max(1, Math.min(50, Number.isFinite(limitRaw) ? limitRaw : 20));

  // Try to get the user's country via their token; if not logged in, fall back to app token + query/default country
  let market = countryParam;
  let useUser = false;

  try {
    const meRsp = await spotifyFetch(event, '/v1/me');
    if (meRsp.ok) {
      const me = await meRsp.json().catch(() => null);
      if (me?.country) {
        market = me.country;
        useUser = true;
      }
    }
  } catch {
    // ignore — we'll use app token / fallback market
  }

  // Choose fetcher based on whether the user is connected
  const fetcher = useUser
    ? /** @param {string} p */ (p) => spotifyFetch(event, p)
    : /** @param {string} p */ (p) => spotifyFetchApp(p);

  // 🔒 Cache by market, limit, and mode (user/app) for 5 minutes
  const cacheKey = `newreleases.v2:${market}:${limit}:${useUser ? 'user' : 'app'}`;
  const cached = cacheGet(cacheKey);
  if (cached) return json(cached);

  // Call Spotify, parse Response → JSON
  const path = `/v1/browse/new-releases?country=${encodeURIComponent(market)}&limit=${limit}`;
  const rsp = await fetcher(path);
  if (!rsp.ok) {
    // bubble up Spotify error body/status
    return new Response(await rsp.text(), { status: rsp.status });
  }

  const data = await rsp.json();
  /** @type {any[]} */
  const items = data?.albums?.items ?? [];
  const payload = {
    albums: items.map(mapAlbum),
    market,
    source: useUser ? 'user-token' : 'app-token'
  };

  // ⚡ Cache 5 minutes
  cacheSet(cacheKey, payload, 5 * 60 * 1000);

  return json(payload);
}