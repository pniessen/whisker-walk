import { describe, it, expect } from 'vitest';
import { formatPerfLines } from '../src/ui/perfhud.js';

const sample = {
  fps: 58.2, frameMs: 17.2, worstMs: 41.04, workMs: 6.1,
  tierName: 'high', quality: 'auto', coarse: false,
  shadowMapSize: 2048, postFx: true, normalMaps: true,
  pixelRatio: 2, bufferW: 2560, bufferH: 1440, strays: 22,
  frame: { calls: 1110, triangles: 109402, shadowCalls: 412, sceneCalls: 690, otherCalls: 8, sceneRenders: 1, renders: 3 },
};

describe('formatPerfLines', () => {
  it('formats the seven readout lines', () => {
    expect(formatPerfLines(sample)).toEqual([
      '58 fps · 17.2 ms · worst 41.0 ms (3 s)',
      'cpu 6.1 ms',
      'tier high · setting auto · touch no',
      'shadow 2048 · postFx on · normals on',
      'px ratio 2 · 2560×1440 · strays 22',
      'draws 1110 · shadow 412 · scene 690 · other 8',
      'tris 109,402 · scene passes 1',
    ]);
  });

  it('shows dashes before any frame data exists', () => {
    const lines = formatPerfLines({ ...sample, fps: 0, frameMs: 0, worstMs: 0 });
    expect(lines[0]).toBe('– fps · – ms · worst – ms (3 s)');
  });

  it('says off and yes for the other branches', () => {
    const lines = formatPerfLines({ ...sample, postFx: false, normalMaps: false, coarse: true });
    expect(lines[2]).toContain('touch yes');
    expect(lines[3]).toBe('shadow 2048 · postFx off · normals off');
  });
});
