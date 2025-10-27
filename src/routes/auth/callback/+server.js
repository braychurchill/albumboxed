// @ts-check
import { json, redirect } from '@sveltejs/kit';
import { SPOTIFY_CLIENT_ID, SPOTIFY_REDIRECT_ORIGIN } from '$env/static/private';

export async function GET({ url, cookies }) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const err = url.searchParams.get('error');
  if (err) return json({ error: err }, { status: 400 });

  const savedState = cookies.get('sp_state');
  const verifier = cookies.get('sp_pkce');
  if (!code || !state || state !== savedState || !verifier) {
    return json({ error: 'Invalid auth state' }, { status: 400 });
  }

  const redirect_uri = `${SPOTIFY_REDIRECT_ORIGIN}/auth/callback`;

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri,
    client_id: SPOTIFY_CLIENT_ID,
    code_verifier: verifier
  });

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!res.ok) return json({ error: await res.text() }, { status: 500 });

  const token = await res.json();
  cookies.set('sp_access', token.access_token, {
    path: '/', httpOnly: true, sameSite: 'lax', secure: false,
    maxAge: Math.max(300, (token.expires_in ?? 3600) - 60)
  });
  cookies.delete('sp_pkce', { path: '/' });
  cookies.delete('sp_state', { path: '/' });

  throw redirect(302, '/');
}