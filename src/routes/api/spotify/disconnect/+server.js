// @ts-check
import { json } from '@sveltejs/kit';
import { readSession } from '$lib/server/spotify.js';

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function POST(event) {
  // See if cookie exists first
  const had = Boolean(readSession(event));

  // 1) Use cookies.delete (preferred; matches our set path='/')
  event.cookies.delete('sp_session', { path: '/' });

  // 2) Belt + suspenders: explicitly set an expired cookie too
  event.cookies.set('sp_session', '', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: false,     // dev
    maxAge: 0
  });

  const hasNow = Boolean(readSession(event));
  return json({ ok: true, before: had, after: hasNow });
}