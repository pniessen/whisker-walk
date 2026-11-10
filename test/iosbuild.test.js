import { describe, it, expect } from 'vitest';
import config, { IOS_MODE, IOS_OUT_DIR } from '../vite.config.js';

// vite.config.js exports defineConfig(fn), and defineConfig returns fn
// unchanged, so the config can be built here for any command and mode.
describe('vite config: the app build', () => {
  it('leaves the GitHub Pages build exactly as it was', () => {
    const web = config({ command: 'build', mode: 'production' });
    expect(web.base).toBe('/whisker-walk/');
    expect(web.build?.outDir).toBeUndefined(); // default dist/ untouched
    expect(web.plugins).toBeUndefined();
  });

  it('builds the app version with a relative base into ios/web', () => {
    expect(IOS_MODE).toBe('ios');
    expect(IOS_OUT_DIR).toBe('ios/web');
    const app = config({ command: 'build', mode: IOS_MODE });
    expect(app.base).toBe('./');
    expect(app.build.outDir).toBe(IOS_OUT_DIR);
    expect(app.build.emptyOutDir).toBe(true);
    expect(app.plugins.map((p) => p.name)).toContain('ios-prune');
  });

  it('keeps dev at the root path', () => {
    expect(config({ command: 'serve', mode: 'development' }).base).toBe('/');
  });

  it('keeps the test timeout for every mode', () => {
    expect(config({ command: 'build', mode: IOS_MODE }).test.testTimeout).toBe(30000);
    expect(config({ command: 'serve', mode: 'development' }).test.testTimeout).toBe(30000);
  });
});
