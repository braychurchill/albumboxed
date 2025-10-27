// @ts-check
import { json } from '@sveltejs/kit';
import { readSession, spotifyFetch, spotifyFetchApp } from '$lib/server/spotify.js';

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function GET(event) {
  const s = readSession(event);

  // Try user token against /v1/me
  let meStatus = 0;
  let me = null;
  try {
    const rsp = await spotifyFetch(event, '/v1/me');
    meStatus = rsp.status;
    if (rsp.ok) me = await rsp.json();
  } catch {
    /* ignore */
  }

  // Try app token by hitting a public endpoint
  let appTokenOk = false;
  try {
    const r = await spotifyFetchApp('/v1/browse/new-releases?limit=1');
    appTokenOk = r.ok;
  } catch {
    /* ignore */
  }

  return json({
    cookies: { has_sp_session: Boolean(s) },
    ensured: Boolean(s),
    scope: s?.scope ?? null,
    appTokenOk,
    meStatus,
    me: me ? { id: me.id, country: me.country, product: me.product, email: me.email } : null
  });
}