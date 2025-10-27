import { persistentWritable } from './persist.js';

/**
 * @typedef {Object} Album
 * @property {string=} artistId   // primary Spotify artist id (if available)
 * @property {string} id         // unique id (e.g., spotify:album:..., or Date.now().toString() for manual)
 * @property {string} title
 * @property {string} artist
 * @property {string=} coverUrl
 * @property {number=} rating     // 0..5
 * @property {boolean=} listened  // true if finished
 * @property {string=} addedAt    // ISO string
 * @property {'spotify'|'manual'} source
 */

 /** @type {Album[]} */
const INITIAL = [];

export const albums = persistentWritable('albums', INITIAL);

/** @param {Album} a */
export function addToDiary(a) {
  albums.update((list) => {
    // avoid dup by id
    if (list.some((x) => x.id === a.id)) return list;
    return [...list, { ...a, addedAt: a.addedAt ?? new Date().toISOString() }];
  });
}

/** @param {string} id */
export function removeFromDiary(id) {
  albums.update((list) => list.filter((x) => x.id !== id));
}

/** @param {string} id @param {number} rating */
export function rateAlbum(id, rating) {
  albums.update((list) =>
    list.map((x) => (x.id === id ? { ...x, rating: Math.max(0, Math.min(5, rating)) } : x))
  );
}

/** @param {string} id @param {boolean=} value */
export function toggleListened(id, value) {
  albums.update((list) =>
    list.map((x) =>
      x.id === id ? { ...x, listened: value ?? !x.listened } : x
    )
  );
}