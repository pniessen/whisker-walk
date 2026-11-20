import { describe, it, expect } from 'vitest';
import { parseArgs, ffmpegArgs, NAME } from '../scripts/record-page.mjs';

// scripts/record-page.mjs: the headless recorder for the picture pages
// (verify-traversal.html). Only its pure parts are tested here; the Chrome
// and ffmpeg run is looked at, not tested.
describe('the page recorder', () => {
  it('reads its arguments with defaults', () => {
    expect(parseArgs(['--url', 'http://localhost:5371/verify-traversal.html?drive=1', '--out', '/tmp/x', '--tour', 'climbs']))
      .toMatchObject({ tour: 'climbs', shots: [], size: { w: 960, h: 540 }, fps: 30, maxFrames: 2700 });
    expect(parseArgs(['--url', 'u', '--out', 'o', '--shots', 'a,b', '--size', '640x360']).shots).toEqual(['a', 'b']);
    expect(parseArgs(['--url', 'u', '--out', 'o', '--shots', 'a', '--size', '640x360']).size).toEqual({ w: 640, h: 360 });
    expect(parseArgs(['--url', 'u', '--out', 'o', '--tour', 't', '--fps', '25', '--max-frames', '90', '--chrome', '/c'])).toMatchObject({ url: 'u', out: 'o', fps: 25, maxFrames: 90, chrome: '/c' });
  });

  it('refuses a run with neither shots nor a tour, or with both, or without --url/--out', () => {
    expect(() => parseArgs(['--url', 'u', '--out', 'o'])).toThrow();
    expect(() => parseArgs(['--url', 'u', '--out', 'o', '--shots', 'a', '--tour', 't'])).toThrow();
    expect(() => parseArgs(['--out', 'o', '--tour', 't'])).toThrow();
    expect(() => parseArgs(['--url', 'u', '--tour', 't'])).toThrow();
  });

  it('refuses a bad size, a bad number or an unknown argument', () => {
    expect(() => parseArgs(['--url', 'u', '--out', 'o', '--tour', 't', '--size', '960'])).toThrow();
    expect(() => parseArgs(['--url', 'u', '--out', 'o', '--tour', 't', '--fps', 'fast'])).toThrow();
    expect(() => parseArgs(['--url', 'u', '--out', 'o', '--tour', 't', '--loud'])).toThrow();
  });

  it('takes only plain tour and shot names, since they become paths under --out', () => {
    for (const name of ['climbs', 'leaps-and-drops', 'leap_down', 'plank2']) {
      expect(parseArgs(['--url', 'u', '--out', 'o', '--tour', name]).tour).toBe(name);
      expect(parseArgs(['--url', 'u', '--out', 'o', '--shots', `plank,${name}`]).shots).toEqual(['plank', name]);
    }
    for (const bad of ['..', '../x', '/tmp', 'a/b', 'a b', 'a.b', '~', '-frames/../..', '']) {
      if (bad) expect(() => parseArgs(['--url', 'u', '--out', 'o', '--tour', bad]), bad).toThrow(/name/);
      expect(() => parseArgs(['--url', 'u', '--out', 'o', '--shots', `plank,${bad}x/`]), bad).toThrow(/name/);
      expect(NAME.test(bad)).toBe(false);
    }
  });

  it('builds the ffmpeg line', () => {
    expect(ffmpegArgs('/d', 30, '/o/t.mp4')).toEqual(['-y', '-framerate', '30', '-i', '/d/f%05d.jpg', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '/o/t.mp4']);
  });
});
