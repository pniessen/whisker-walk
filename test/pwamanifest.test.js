import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../public/${p}`, import.meta.url));
const manifest = JSON.parse(read('manifest.webmanifest').toString('utf8'));

// PNG header: 8 signature bytes, then IHDR with width and height as big-endian words.
function pngSize(buf) {
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(buf.subarray(12, 16).toString('latin1')).toBe('IHDR');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

describe('web manifest', () => {
  it('lists the three PNG icons with the right purposes', () => {
    const png = manifest.icons.filter((i) => i.type === 'image/png');
    const want = [
      ['icon-192.png', 192, 'any'],
      ['icon-512.png', 512, 'any'],
      ['icon-maskable-512.png', 512, 'maskable'],
    ];
    for (const [src, px, purpose] of want) {
      const icon = png.find((i) => i.src === src);
      expect(icon, src).toBeTruthy();
      expect(icon.sizes).toBe(`${px}x${px}`);
      expect(icon.purpose).toBe(purpose);
    }
  });

  it('every listed icon file exists, and each PNG has the pixel size it claims', () => {
    for (const icon of manifest.icons) {
      const buf = read(icon.src);
      if (icon.type === 'image/png') expect(pngSize(buf), icon.src).toEqual(icon.sizes.split('x').map(Number));
    }
  });

  it('start_url resolves inside scope on both the Pages path and a custom domain', () => {
    for (const base of ['https://pniessen.github.io/whisker-walk/', 'https://whiskerwalk.org/']) {
      const at = new URL('manifest.webmanifest', base);
      const start = new URL(manifest.start_url, at);
      const scope = new URL(manifest.scope, at);
      expect(start.href.startsWith(scope.href)).toBe(true);
      expect(scope.href).toBe(base);
    }
  });

  it('is installable and not orientation locked', () => {
    expect(['standalone', 'fullscreen']).toContain(manifest.display);
    expect(manifest.orientation).toBe('any');
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
