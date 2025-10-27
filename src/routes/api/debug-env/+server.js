// @ts-check
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export function GET() {
  return json({
    has_id: Boolean(env.SPOTIFY_CLIENT_ID),
    has_secret: Boolean(env.SPOTIFY_CLIENT_SECRET)
  });
}