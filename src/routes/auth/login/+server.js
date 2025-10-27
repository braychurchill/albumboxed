// @ts-check
import { json } from '@sveltejs/kit';
import { SPOTIFY_CLIENT_ID, SPOTIFY_REDIRECT_URI, SPOTIFY_SCOPES } from '$env/static/private';

/** @param {Uint8Array} bytes */
function b64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

/** @param {number} [n=64] */
function rand(n = 64) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}

/** Normalize a redirect URI, or fall back to dev default. 
 *  @param {string | undefined} u
 *  @returns {string}
 */
function normalizeRedirect(u) {
  const s = (u || '').trim();
  if (!s) return 'http://127.0.0.1:5173/auth/callback';
  try {
    // Ensure it’s a full URL
    const url = new URL(s);
    return url.toString();
  } catch {
    return 'http://127.0.0.1:5173/auth/callback';
  }
}

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function GET({ url }) {
  const redirectUri = normalizeRedirect(SPOTIFY_REDIRECT_URI);
  const scopes =
    (SPOTIFY_SCOPES || 'user-read-email user-read-private user-top-read user-read-recently-played user-library-read user-follow-read').trim();

  const verifier = b64url(rand(64));
  // @ts-ignore subtle.digest returns ArrayBuffer
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = b64url(new Uint8Array(digest));
  const state = b64url(rand(16));

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: scopes,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state
  });
  const authorizeUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;

  // Debug view
  if (url.searchParams.get('debug') === '1') {
    return json({
      redirect_uri: redirectUri,
      client_id_present: Boolean(SPOTIFY_CLIENT_ID),
      scopes,
      authorize_url: authorizeUrl
    });
  }

  // Small HTML that stores PKCE verifier/state in sessionStorage, then redirects
  const html = `<!doctype html><meta charset="utf-8">
<title>Connecting Spotify…</title>
<body style="font-family:system-ui;padding:24px;background:#0b0b0c;color:#eaeaea">
  <h1 style="margin:0 0 8px;">Connecting Spotify…</h1>
  <p style="opacity:.8">If nothing happens, <a href="${authorizeUrl}">continue</a>.</p>
  <script>
    sessionStorage.setItem('sp_pkce_verifier', ${JSON.stringify(verifier)});
    sessionStorage.setItem('sp_state', ${JSON.stringify(state)});
    location.replace(${JSON.stringify(authorizeUrl)});
  </script>
</body>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}