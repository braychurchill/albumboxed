// @ts-check
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

/** @param {Uint8Array} bytes */
function b64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
/** @param {number} [n=64] */
function rand(n=64) { const a=new Uint8Array(n); crypto.getRandomValues(a); return a; }

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function GET({ url }) {
  const redirect_uri = (env.SPOTIFY_REDIRECT_URI || '').trim();
  if (!redirect_uri) return json({ error: 'missing SPOTIFY_REDIRECT_URI' }, { status: 500 });

  const verifier = b64url(rand(64));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = b64url(new Uint8Array(digest));
  const state = b64url(rand(16));

  const params = new URLSearchParams({
    client_id: env.SPOTIFY_CLIENT_ID || '',
    response_type: 'code',
    redirect_uri,
    scope: env.SPOTIFY_SCOPES || 'user-read-email user-read-private',
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state
  });
  const authorizeUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;

  if (url.searchParams.get('debug') === '1') {
    return json({
      redirect_uri,
      client_id_present: Boolean(env.SPOTIFY_CLIENT_ID),
      scopes: env.SPOTIFY_SCOPES,
      authorize_url: authorizeUrl
    });
  }

  const html = `<!doctype html><meta charset="utf-8">
  <body style="font-family:system-ui;padding:24px;background:#0b0b0c;color:#eaeaea">
    <h1>Connecting Spotify…</h1>
    <script>
      sessionStorage.setItem('sp_pkce_verifier', ${JSON.stringify(verifier)});
      sessionStorage.setItem('sp_state', ${JSON.stringify(state)});
      location.replace(${JSON.stringify(authorizeUrl)});
    </script>
  </body>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}