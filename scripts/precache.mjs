// The list of files the service worker may precache, from a build's file
// names. Pure, so a test can call it; vite.config.js writes the result to
// precache.json. `build` follows the files, so it changes exactly when a
// shipped file does.
import { createHash } from 'node:crypto';

export function precacheManifest(fileNames) {
  const files = [...new Set(fileNames.filter((n) => n.startsWith('assets/')))].sort();
  const build = createHash('sha1').update(files.join('\n')).digest('hex').slice(0, 12);
  return { build, files };
}
