import { writable } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * Persistent writable store that syncs to localStorage when in the browser.
 * @template T
 * @param {string} key
 * @param {T} initial
 */
export function persistentWritable(key, initial) {
  // Load once on init (browser only)
  const store = writable(initial, (set) => {
    if (!browser) return;
    const raw = localStorage.getItem(key);
    if (raw) {
      try { set(JSON.parse(raw)); } catch { /* ignore bad JSON */ }
    }
  });

  // Persist on changes (browser only)
  if (browser) {
    store.subscribe((value) => {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota? */ }
    });
  }

  return store;
}