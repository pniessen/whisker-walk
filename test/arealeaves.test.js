import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();


describe('small facts', () => {
it('each fact is the same object from its leaf and from its area', async () => {
  expect((await import('../src/world/camp.js')).campLayout).toBe((await import('../src/world/camplayout.js')).campLayout);
  expect((await import('../src/world/camp.js')).campDiscs).toBe((await import('../src/world/camplayout.js')).campDiscs);
  expect((await import('../src/world/pines.js')).TRUCE_PATH).toBe((await import('../src/world/pinespaths.js')).TRUCE_PATH);
  expect((await import('../src/world/pines.js')).BRIDGE_FOOT).toBe((await import('../src/world/pinespaths.js')).BRIDGE_FOOT);
  expect((await import('../src/world/seaside.js')).wetness).toBe((await import('../src/world/seasidewet.js')).wetness);
  expect((await import('../src/farmjobs.js')).JOB).toBe((await import('../src/farmjobids.js')).JOB);
  expect((await import('../src/farmjobs.js')).FARM_JOB_IDS).toBe((await import('../src/farmjobids.js')).FARM_JOB_IDS);
  expect((await import('../src/farmanimals.js')).NO_FARM).toBe((await import('../src/farmnone.js')).NO_FARM);
  expect((await import('../src/fairlive.js')).NO_FAIR).toBe((await import('../src/fairnone.js')).NO_FAIR);
});
it('the camp layout answers as before', async () => {
  const { campLayout, campDiscs } = await import('../src/world/camplayout.js');
  expect(campLayout('neighborhood')).toBeNull();
  for (const id of ['woods', 'river', 'moor', 'pines', 'gorge']) expect(campLayout(id)?.seats.kits).toHaveLength(4);
  expect(campDiscs('woods').length).toBeGreaterThan(0);
});
});
