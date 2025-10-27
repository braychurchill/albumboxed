// @ts-check
import { json } from '@sveltejs/kit';
import { readSession, ensureAccessToken, spotifyFetchApp, spotifyFetch } from '$lib/server/spotify.js';

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function GET(event) {
  const sess = readSession(event);              // raw cookie (sp_session)
  const ensured = await ensureAccessToken(event); // will refresh if needed

  // Try app token (should always work if ID/SECRET are correct)
  const appRsp = await spotifyFetchApp('/v1/browse/new-releases?limit=1');
  const appOk = appRsp.ok;

  // Try user token (only works if session is valid)
  let meStatus = 0, me = null;
  if (ensured) {
    const meRsp = await spotifyFetch(event, '/v1/me');
    meStatus = meRsp.status;
    if (meRsp.ok) me = await meRsp.json();
  }

  return json({
    has_sp_session: Boolean(sess),
    ensured: Boolean(ensured),
    appTokenOk: appOk,
    meStatus,
    me: me && { id: me.id, country: me.country, product: me.product, email: me.email }
  });
}