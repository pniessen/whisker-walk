import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync, writeFileSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';

// The invisible-platform audit. A perch is a spot the cat can stand on (ungated,
// or gated behind a skill such as Sure Claws). If nothing drawn is under or at
// it, the cat stands on thin air (the Woods tree-top perches, removed in
// fe40e164). For every place that builds headless this lists each perch and
// looks for a visible mesh in the built scene whose bounding box holds the perch
// point (within a tolerance). Perches with no such mesh are listed per place,
// and must be in test/fixtures/platformaudit-allow.json (each with a reason), so
// a NEW invisible platform fails the test. Meshes bigger than BIG across are
// ground, water or sky and do not count as "a drawn object".

stubCanvasDocument();

const { AREA_LOADERS } = await import('../src/world/areas.js');

const TOL_XZ = 0.6;
const TOL_Y = 0.45;
const BIG = 40;

const allow = JSON.parse(readFileSync(new URL('./fixtures/platformaudit-allow.json', import.meta.url), 'utf8'));
const key = (p) => `${p.x.toFixed(2)},${p.z.toFixed(2)},${p.y.toFixed(2)}`;

function boxes(scene) {
  scene.updateMatrixWorld(true);
  const out = [];
  const tmp = new THREE.Box3();
  scene.traverseVisible((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const gb = o.geometry.boundingBox;
    if (!gb) return;
    if (o.isInstancedMesh) {
      const m = new THREE.Matrix4();
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m);
        tmp.copy(gb).applyMatrix4(m).applyMatrix4(o.matrixWorld);
        out.push(tmp.clone());
      }
    } else {
      out.push(tmp.copy(gb).applyMatrix4(o.matrixWorld).clone());
    }
  });
  return out.filter((b) => b.max.x - b.min.x < BIG && b.max.z - b.min.z < BIG);
}

function covered(p, bs) {
  return bs.some((b) => p.x >= b.min.x - TOL_XZ && p.x <= b.max.x + TOL_XZ
    && p.z >= b.min.z - TOL_XZ && p.z <= b.max.z + TOL_XZ
    && p.y >= b.min.y - TOL_Y && p.y <= b.max.y + TOL_Y);
}

describe('invisible platforms', () => {
  it('every perch has something drawn at it, or is on the allow list', async () => {
    const report = {};
    const fresh = [];
    const stale = [];
    const skipped = [];
    for (const id of Object.keys(AREA_LOADERS)) {
      let area; let scene;
      try {
        const pack = await AREA_LOADERS[id]();
        scene = new THREE.Scene();
        area = pack.world.build(scene);
      } catch (e) { skipped.push(`${id}: ${String(e.message).slice(0, 60)}`); continue; }
      const perches = (area?.perches ?? []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.y));
      const bs = boxes(scene);
      const un = perches.filter((p) => !covered(p, bs));
      report[id] = { perches: perches.length, gated: perches.filter((p) => p.requires).length, unmatched: un };
      const allowed = new Map((allow[id] ?? []).map((a) => [a.at, a]));
      for (const p of un) if (!allowed.has(key(p))) fresh.push(`${id} ${key(p)} kind=${p.kind ?? 'prop'}${p.requires ? ' gated=' + p.requires : ''}`);
      const seen = new Set(un.map(key));
      for (const a of allowed.values()) if (!seen.has(a.at)) stale.push(`${id} ${a.at}`);
      if (un.length) {
        console.log(`\n${id}: ${un.length} of ${perches.length} perches have nothing drawn at them`);
        console.table(un.map((p) => ({ x: p.x, z: p.z, y: p.y, kind: p.kind ?? 'prop', requires: p.requires ?? '' })));
      }
    }
    console.log('\nPLATFORM AUDIT SUMMARY (unmatched / perches / gated)');
    console.table(Object.fromEntries(Object.entries(report).map(([k, v]) => [k, { unmatched: v.unmatched.length, perches: v.perches, gated: v.gated }])));
    // PLATFORMAUDIT_DUMP=<file> writes the current unmatched list, to seed or refresh the allow list.
    if (process.env.PLATFORMAUDIT_DUMP) {
      const d = {};
      for (const [k, v] of Object.entries(report)) if (v.unmatched.length) d[k] = v.unmatched.map((p) => ({ at: key(p), kind: p.kind ?? 'prop', requires: p.requires, reason: '' }));
      writeFileSync(process.env.PLATFORMAUDIT_DUMP, JSON.stringify(d, null, 1));
    }
    if (skipped.length) console.log('could not build headless:', skipped);
    expect(fresh, 'new invisible platforms (draw something there, or remove the perch)').toEqual([]);
    expect(stale, 'allow-list entries that no longer match (delete them)').toEqual([]);
  }, 120000);
});
