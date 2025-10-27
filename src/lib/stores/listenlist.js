import { persistentWritable } from './persist.js';

/** @typedef {import('./albums.js').Album} Album */

export const listenList = persistentWritable('listenList', /** @type {Album[]} */([]));

/** @param {Album} a */
export function addToListenList(a) {
  listenList.update((list) => (list.some((x) => x.id === a.id) ? list : [...list, a]));
}

/** @param {string} id */
export function removeFromListenList(id) {
  listenList.update((list) => list.filter((x) => x.id !== id));
}