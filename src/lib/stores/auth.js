// @ts-check
import { writable } from 'svelte/store';

export const auth = writable({
  loading: true,
  loggedIn: false,
  profile: /** @type {any} */ (null),
  error: ''
});

export async function ensureAuth() {
  auth.update((s) => ({ ...s, loading: true, error: '' }));
  try {
    const rsp = await fetch('/api/spotify/me', { credentials: 'include' });
    if (!rsp.ok) throw new Error('Not connected');
    const me = await rsp.json();
    auth.set({ loading: false, loggedIn: true, profile: me, error: '' });
  } catch (e) {
    auth.set({ loading: false, loggedIn: false, profile: null, error: '' });
  }
}

export async function refreshAuth() {
  // same as ensureAuth for now
  return ensureAuth();
}

export function setLoggedOut() {
  auth.set({ loading: false, loggedIn: false, profile: null, error: '' });
}