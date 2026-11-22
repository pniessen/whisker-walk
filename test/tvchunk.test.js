import { describe, it, expect } from 'vitest';
import { realBuild } from './helpers/realbuild.js';
import { startupFiles, lazyProblems, TV_ENTRY_MODULES } from '../scripts/buildjson.mjs';
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
  });
}
