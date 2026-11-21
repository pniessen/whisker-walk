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

// The shipped sw.js: public/sw.js with the build id on a first line. A browser
// installs a new worker only when sw.js's bytes change, and public/sw.js is
// the same file every deploy, so without the stamp a device would precache
// and prune once, ever. Same id as precache.json's, so the worker changes
// exactly when the files it caches do.
export function stampServiceWorker(src, build) {
  return `// build ${build}\n${src}`;
}
