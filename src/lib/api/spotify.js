// @ts-check

/**
 * Map Spotify album item to our Album shape.
 * @param {any} item
 * @returns {import('$lib/stores/albums.js').Album}
 */
export function mapSpotifyAlbum(item) {
  return {
    id: item?.id ? `spotify:album:${item.id}` : `unknown-${Math.random()}`,
    title: item?.name ?? 'Unknown',
    artist: item?.artists?.[0]?.name ?? 'Unknown',
    coverUrl: item?.images?.[0]?.url ?? '',
    rating: 0,
    listened: false,
    source: 'spotify'
  };
}

/**
 * Search albums via Spotify Web API (needs a valid bearer token).
 * @param {string} query
 * @param {string} token
 */
export async function fetchAlbums(query, token) {
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=album&limit=10`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Spotify error: ${res.status}`);
  const data = await res.json();
  const items = data?.albums?.items ?? [];
  return items.map(mapSpotifyAlbum);
}