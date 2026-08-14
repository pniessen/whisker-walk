import { describe, it, expect, vi } from 'vitest';
import { createSamples } from '../src/samples.js';

const BASE = '/base/';

function jsonResponse(body) {
  return { ok: true, json: async () => body };
}

describe('createSamples', () => {
  it('missing manifest: has() false everywhere and play() does not throw', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false }));
    const samples = createSamples(BASE, { fetchFn, decode: vi.fn() });
    await samples.ready;
    expect(samples.has('zeetoo')).toBe(false);
    expect(() => samples.play('zeetoo')).not.toThrow();
    expect(fetchFn).toHaveBeenCalledWith(`${BASE}sounds/manifest.json`);
  });

  it('offline/rejecting fetch also leaves has() false without throwing', async () => {
    const fetchFn = vi.fn(async () => { throw new Error('offline'); });
    const samples = createSamples(BASE, { fetchFn, decode: vi.fn() });
    await samples.ready;
    expect(samples.has('zeetoo')).toBe(false);
    expect(() => samples.play('zeetoo')).not.toThrow();
  });

  it('manifest listing zeetoo.m4a: after ready + successful decode, has("zeetoo") is true', async () => {
    const fakeBuffer = { duration: 1 };
    const fetchFn = vi.fn(async (url) => {
      if (url.endsWith('manifest.json')) return jsonResponse({ files: ['zeetoo.m4a'] });
      if (url.endsWith('zeetoo.m4a')) return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
      throw new Error(`unexpected fetch ${url}`);
    });
    const decode = vi.fn(async () => fakeBuffer);
    const playBuffer = vi.fn();
    const samples = createSamples(BASE, { fetchFn, decode, playBuffer });
    await samples.ready;
    expect(samples.has('zeetoo')).toBe(true);
    expect(samples.has('rosa')).toBe(false);
    samples.play('zeetoo', { rate: 1.1, volume: 0.5 });
    expect(playBuffer).toHaveBeenCalledWith(fakeBuffer, { rate: 1.1, volume: 0.5 });
  });

  it('drops hostile manifest entries and never fetches or decodes them', async () => {
    const fetchFn = vi.fn(async (url) => {
      if (url.endsWith('manifest.json')) {
        return jsonResponse({ files: ['../../evil', 7, 'x.wav', 'UPPER.mp3', 'zeetoo.m4a'] });
      }
      if (url.endsWith('zeetoo.m4a')) return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
      throw new Error(`unexpected fetch ${url}`);
    });
    const decode = vi.fn(async () => ({ duration: 1 }));
    const samples = createSamples(BASE, { fetchFn, decode });
    await samples.ready;
    // only the one valid entry should ever have been fetched/decoded
    expect(fetchFn).toHaveBeenCalledTimes(2); // manifest.json + zeetoo.m4a
    expect(decode).toHaveBeenCalledTimes(1);
    expect(samples.has('zeetoo')).toBe(true);
    expect(samples.has('evil')).toBe(false);
    expect(samples.has('x')).toBe(false);
    expect(samples.has('UPPER')).toBe(false);
  });

  it('failed decode leaves has() false for that name', async () => {
    const fetchFn = vi.fn(async (url) => {
      if (url.endsWith('manifest.json')) return jsonResponse({ files: ['rosa.mp3'] });
      if (url.endsWith('rosa.mp3')) return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
      throw new Error(`unexpected fetch ${url}`);
    });
    const decode = vi.fn(async () => { throw new Error('bad audio data'); });
    const samples = createSamples(BASE, { fetchFn, decode });
    await samples.ready;
    expect(samples.has('rosa')).toBe(false);
    expect(() => samples.play('rosa')).not.toThrow();
  });

  it('a 404 on the sample file itself leaves has() false', async () => {
    const fetchFn = vi.fn(async (url) => {
      if (url.endsWith('manifest.json')) return jsonResponse({ files: ['robbie.ogg'] });
      if (url.endsWith('robbie.ogg')) return { ok: false, status: 404 };
      throw new Error(`unexpected fetch ${url}`);
    });
    const decode = vi.fn(async () => ({ duration: 1 }));
    const samples = createSamples(BASE, { fetchFn, decode });
    await samples.ready;
    expect(samples.has('robbie')).toBe(false);
    expect(decode).not.toHaveBeenCalled();
  });
});
