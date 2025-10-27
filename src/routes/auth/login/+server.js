// @ts-check
import { redirect } from '@sveltejs/kit';
import { SPOTIFY_CLIENT_ID, SPOTIFY_REDIRECT_ORIGIN } from '$env/static/private';

/**
 * Convert ArrayBuffer to base64url string
 * @param {ArrayBuffer} buf
 */
function base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function GET({ cookies }) {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(64));
  const code_verifier = base64url(verifierBytes.buffer);

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code_verifier));
  const code_challenge = base64url(digest);

  const state = crypto.randomUUID();
  cookies.set('sp_pkce', code_verifier, { path: '/', httpOnly: true, sameSite: 'lax', secure: false, maxAge: 600 });
  cookies.set('sp_state', state,      { path: '/', httpOnly: true, sameSite: 'lax', secure: false, maxAge: 600 });

  const redirect_uri = `${SPOTIFY_REDIRECT_ORIGIN}/auth/callback`;

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri,
    code_challenge_method: 'S256',
    code_challenge,
    state,
    scope: [
      'user-top-read',
      'user-read-email',
      'playlist-read-private'
    ].join(' ')
  });

  throw redirect(302, `https://accounts.spotify.com/authorize?${params.toString()}`);
}