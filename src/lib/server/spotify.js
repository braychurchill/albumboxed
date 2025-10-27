// @ts-check
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';

/**
 * @typedef {{ access_token: string, refresh_token: string, expires_at: number }} SpotifySession
 */

const SESSION_COOKIE = 'sp_session';
const LEGACY_ACCESS  = 'sp_access';
const LEGACY_REFRESH = 'sp_refresh';
const SIX_MONTHS = 60 * 60 * 24 * 180;

/** Read the new bundled session cookie. */
/** @param {import('@sveltejs/kit').RequestEvent} event */
export function readSession(event) {
  const raw = event.cookies.get(SESSION_COOKIE);
  if (!raw) return null;
  try {
    /** @type {SpotifySession} */
    const parsed = JSON.parse(raw);
    if (!parsed?.access_token) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Back-compat: if legacy cookies exist, wrap them into a session and persist. */
/** @param {import('@sveltejs/kit').RequestEvent} event */
function adoptLegacyCookies(event) {
  const access  = event.cookies.get(LEGACY_ACCESS);
  const refresh = event.cookies.get(LEGACY_REFRESH);
  if (!access) return null;

  // If we don’t know expiry, assume ~1 hour from now.
  const approxExp = Math.floor(Date.now() / 1000) + 3500;

  /** @type {SpotifySession} */
  const s = {
    access_token: access,
    refresh_token: refresh ?? '',
    expires_at: approxExp
  };
  writeSession(event, s);
  // Optionally clear legacy cookies to avoid drift:
  event.cookies.delete(LEGACY_ACCESS,  { path: '/' });
  event.cookies.delete(LEGACY_REFRESH, { path: '/' });
  return s;
}

/** @param {import('@sveltejs/kit').RequestEvent} event @param {SpotifySession} s */
export function writeSession(event, s) {
  event.cookies.set(SESSION_COOKIE, JSON.stringify(s), {
    httpOnly: true,
    sameSite: 'lax',
    secure: !dev,
    path: '/',
    maxAge: SIX_MONTHS
  });
}

/** @param {import('@sveltejs/kit').RequestEvent} event */
export function clearSession(event) {
  event.cookies.delete(SESSION_COOKIE, { path: '/' });
  // Also clear legacy, in case they exist
  event.cookies.delete(LEGACY_ACCESS,  { path: '/' });
  event.cookies.delete(LEGACY_REFRESH, { path: '/' });
}

/** @param {SpotifySession|null} s */
export function isExpiring(s) {
  if (!s?.access_token) return true;
  // refresh if < 5 minutes left
  return (Date.now() / 1000) > (s.expires_at - 300);
}

/** Refresh using PKCE public client flow (client_id only, no secret). */
/** @param {import('@sveltejs/kit').RequestEvent} event @param {SpotifySession|null} s */
export async function refreshIfNeeded(event, s) {
  if (!s?.refresh_token || !isExpiring(s)) return s;

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: s.refresh_token,
    client_id: env.SPOTIFY_CLIENT_ID ?? ''
  });

  const rsp = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });

  const data = await rsp.json().catch(() => ({}));
  if (!rsp.ok) {
    // If refresh fails, clear session so caller can treat as disconnected
    clearSession(event);
    throw new Error(data?.error_description || 'spotify_refresh_failed');
  }

  /** @type {SpotifySession} */
  const next = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? s.refresh_token, // may rotate
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600)
  };

  writeSession(event, next);
  return next;
}

/** Ensure we have a usable session. Try new cookie, then adopt legacy if needed. */
/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function ensureAccessToken(event) {
  // Preferred: bundled session
  let s = readSession(event);
  if (!s) {
    // Back-compat: sniff legacy cookies and adopt
    s = adoptLegacyCookies(event);
  }
  if (!s) return null;

  try {
    s = await refreshIfNeeded(event, s);
  } catch {
    return null;
  }
  return s;
}

/**
 * USER fetch (uses session + auto refresh). Returns a Response (status 401 if not connected).
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {string} pathOrUrl e.g. '/v1/me' or full URL
 * @param {RequestInit} [init]
 */
export async function spotifyFetch(event, pathOrUrl, init = {}) {
  const s = await ensureAccessToken(event);
  if (!s) return new Response(JSON.stringify({ error: 'Not connected' }), { status: 401 });

  const url = pathOrUrl.startsWith('http')
    ? pathOrUrl
    : `https://api.spotify.com${pathOrUrl}`;

  return fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${s.access_token}`
    }
  });
}

// ---------- APP TOKEN (Client Credentials) ----------

let _appToken = /** @type {string|null} */ (null);
let _appTokenExp = 0;

/** Acquire/refresh app token using client credentials. */
async function getAppAccessToken() {
  const now = Date.now();
  if (_appToken && now < _appTokenExp - 60_000) return _appToken;

  const id = env.SPOTIFY_CLIENT_ID;
  const secret = env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Missing SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET');

  const basic = (globalThis.Buffer
    ? Buffer.from(`${id}:${secret}`).toString('base64')
    : btoa(`${id}:${secret}`));

  const rsp = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' })
  });

  if (!rsp.ok) {
    const body = await rsp.text();
    throw new Error(`App token error ${rsp.status}: ${body}`);
  }

  const data = await rsp.json();
  _appToken = data.access_token;
  _appTokenExp = Date.now() + (data.expires_in ?? 3600) * 1000;
  return _appToken;
}

/**
 * APP fetch (no user context). Returns a Response.
 * @param {string} pathOrUrl e.g. '/v1/browse/new-releases?limit=20' or full URL
 * @param {RequestInit} [init]
 */
export async function spotifyFetchApp(pathOrUrl, init = {}) {
  const token = await getAppAccessToken();
  const url = pathOrUrl.startsWith('http')
    ? pathOrUrl
    : `https://api.spotify.com${pathOrUrl}`;

  const headers = new Headers(init.headers ?? {});
  if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);

  return fetch(url, { ...init, headers });
}