import { describe, it, expect } from 'vitest';
import { realBuild } from './helpers/realbuild.js';
import { startupFiles, lazyProblems, areaDownloads, TV_ENTRY_MODULES } from '../scripts/buildjson.mjs';
import { IOS_MODE } from '../vite.config.js';

// TV mode is ONE lazy chunk. If a start-up module ever imports src/tv/* the
// chunk folds into start-up and this fails the build.
for (const mode of ['production', IOS_MODE]) {
  describe(`the TV chunk in the ${mode} bundle`, () => {
    it('is a dynamic entry that start-up never downloads', async () => {
      const b = await realBuild(mode);
      expect(lazyProblems(b.manifest, TV_ENTRY_MODULES)).toEqual([]);
      const c = b.manifest['src/tv/index.js'];
      expect(c?.isDynamicEntry).toBe(true);
      expect(startupFiles(b.manifest)).not.toContain(c.file);
      expect(b.files.has(c.file)).toBe(true);
    }, 300_000);

    it('no TV-only code or word leaks into the start-up files (the words and pictures live in the chunk)', async () => {
      const b = await realBuild(mode);
      const code = (f) => String(b.files.get(f).code ?? '');
      const start = startupFiles(b.manifest).map(code).join('\n');
      // the chunk and the lazy files it shares: the button pictures (src/tv/glyphs.js) are also read by couch play's chunk, so they sit in a shared lazy file, never in start-up
      const tv = areaDownloads(b.manifest, TV_ENTRY_MODULES).tv.map(code).join('\n');
      // strings only the chunk may hold: the offer's words, the pad lines, a glyph's drawing
      for (const marker of ['Bigger words, made for the sofa.', 'Keep exploring \u27e6confirm\u27e7', 'var(--ps-cross', 'html.tv']) {
        expect(start, marker).not.toContain(marker);
      }
      // and no TV style in the start-up stylesheets (CSS assets have .source, not .code)
      const startFiles = new Set(startupFiles(b.manifest));
      const startCss = Object.values(b.manifest).filter((c) => startFiles.has(c.file)).flatMap((c) => c.css ?? []);
      expect(startCss.length).toBeGreaterThan(0);
      const css = (f) => String(b.files.get(f).source ?? '');
      for (const f of startCss) {
        expect(css(f), f).not.toContain('html.tv');
        expect(css(f), f).not.toContain('--tv-s');
      }
      const tvCss = b.manifest['src/tv/index.js'].css ?? [];
      expect(tvCss.length).toBeGreaterThan(0);
      expect(tvCss.map(css).join('')).toContain('html.tv');
      expect(tv).toContain('Bigger words, made for the sofa.');
      expect(tv).toContain('var(--ps-cross');
    }, 300_000);
  });
}
