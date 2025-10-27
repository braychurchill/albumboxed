// @ts-check
import { json } from '@sveltejs/kit';
import { ensureAccessToken, spotifyFetch } from '$lib/server/spotify.js';

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function GET(event) {
  const debug = event.url.searchParams.get('debug') === '1';

  // Ensure we have a valid (refreshed if needed) user access token in sp_session
  const session = await ensureAccessToken(event);
  if (!session) {
    return json({ error: 'Not connected' }, { status: 401 });
  }

  // Fetch profile using the wrapper (adds Authorization header for you)
  const rsp = await spotifyFetch(event, '/v1/me');
  if (!rsp.ok) {
    const body = await rsp.text().catch(() => '');
    return json(
      debug ? { error: `Spotify /v1/me ${rsp.status}`, body } : { error: 'Spotify error' },
      { status: rsp.status }
    );
  }

  const me = await rsp.json();
  return json(
    debug
      ? { me, diag: { used_token: 'sp_session.access_token', expires_at: session.expires_at } }
      : me
  );
}