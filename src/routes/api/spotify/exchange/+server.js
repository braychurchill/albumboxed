// @ts-check
import { json, redirect } from '@sveltejs/kit';
import { writeSession } from '$lib/server/spotify.js';
import { env } from '$env/dynamic/private';

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function GET(event) {
  const debug = event.url.searchParams.get('debug') === '1';

  const code = event.url.searchParams.get('code');
  const verifier = event.url.searchParams.get('v');
  const state = event.url.searchParams.get('state') ?? '';

  if (!code || !verifier) {
    return json({ error: 'missing_code_or_verifier', code: !!code, verifier: !!verifier }, { status: 400 });
  }

  const redirect_uri = (env.SPOTIFY_REDIRECT_URI || '').trim();
  if (!redirect_uri) return json({ error: 'missing SPOTIFY_REDIRECT_URI' }, { status: 500 });

  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri,
    client_id: env.SPOTIFY_CLIENT_ID || '',
    code_verifier: verifier
  });

  // Only catch failures around the token request + parse
  let tokenStatus = 0, tokenBody = '';
  try {
    const rsp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form
    });
    tokenStatus = rsp.status;
    tokenBody = await rsp.text();

    if (!rsp.ok) {
      return json({ error: 'token_exchange_failed', status: tokenStatus, body: tokenBody, redirect_uri }, { status: 502 });
    }

    const data = JSON.parse(tokenBody);
    const access = data?.access_token;
    if (!access) {
      return json({ error: 'no_access_token', body: tokenBody }, { status: 502 });
    }

    const expires_at = Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600);
    writeSession(event, {
      access_token: access,
      refresh_token: data.refresh_token ?? '',
      expires_at,
      scope: typeof data.scope === 'string' ? data.scope : undefined
    });

  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: 'exchange_throw', message, tokenStatus, tokenBody }, { status: 500 });
  }

  if (debug) {
    return json({ ok: true, wrote_session: true, state_received: state });
  }

  // IMPORTANT: do this outside the try/catch so it isn’t swallowed
  throw redirect(302, '/account');
}