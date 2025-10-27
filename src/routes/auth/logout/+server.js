// @ts-check
import { redirect } from '@sveltejs/kit';

export async function GET({ cookies }) {
  cookies.delete('sp_access', { path: '/' });
  // If you later add a refresh token, clear it here too.
  throw redirect(302, '/account');
}