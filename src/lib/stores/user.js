import { persistentWritable } from './persist.js';

/**
 * @typedef {Object} User
 * @property {string} name
 * @property {'dark'|'light'} theme
 */

export const user = persistentWritable(
  'user',
  /** @type {User} */ ({ name: 'Guest', theme: 'dark' })
);

/** @param {Partial<User>} patch */
export function updateUser(patch) {
  user.update((u) => ({ ...u, ...patch }));
}