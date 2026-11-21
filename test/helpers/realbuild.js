import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';

// Builds the real bundle in memory (write: false), as test/iosbundle.test.js
// always did. Vitest runs with NODE_ENV=test, which would build a non-PROD
// bundle, so it is switched to production for the build.
const root = fileURLToPath(new URL('../..', import.meta.url));

/** { chunks, manifest, gz(file) }: chunks by file name, the Vite manifest, gzip bytes of a file. */
export async function realBuild(mode) {
  const saved = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const out = await build({ root, mode, logLevel: 'silent', build: { write: false } });
    const outputs = (Array.isArray(out) ? out : [out]).flatMap((o) => o.output);
    const files = new Map(outputs.map((o) => [o.fileName, o]));
    const m = files.get('.vite/manifest.json');
    const manifest = m ? JSON.parse(String(m.source)) : null;
    const bytes = (f) => {
      const o = files.get(f);
      return Buffer.from(o.type === 'chunk' ? o.code : o.source);
    };
    return {
      outputs,
      files,
      chunks: outputs.filter((o) => o.type === 'chunk'),
      manifest,
      gz: (file) => gzipSync(bytes(file)).length,
    };
  } finally {
    // assigning undefined would store the string "undefined"
    if (saved === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = saved;
  }
}
