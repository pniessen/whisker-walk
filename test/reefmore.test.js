// The Reef's seven more sea creatures (jellyfish, clownfish, seahorses, mantas, a whale and calf, moray eels, squid): the plans (deterministic, in bounds, clear of the
// finds and the story's places, high above the float ceiling where they fly), the pure poses, the drawing (outward winding, triangles, four draws), reduced motion, the
// rungs, the journal and photo registration, the two word sets and the source rules.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';

stubCanvasDocument();
const M = await import('../src/world/reefmore.js');
const D = await import('../src/world/reefmoreparts.js');
const S = await import('../src/world/reefseals.js');
const { createReefMoreLife } = await import('../src/world/reefmorelive.js');
const { LINES, HINTS } = await import('../src/world/reeflifewords.js');
const P = await import('../src/world/reefplan.js');
const C = await import('../src/world/reefcritters.js');
const { paradeAt, PARADE } = await import('../src/world/reefparade.js');
const { build } = await import('../src/world/reef.js');
const { phrase, hasPhrase } = await import('../src/clanphrases.js');
const { CRITTER_INFO } = await import('../src/journal.js');
const { JOURNAL_TYPES, createProgression } = await import('../src/progression.js');
const { REEF_LIFE_PAGES, REEF_PAGE_WORDS, REEF_HINTS } = await import('../src/reefpages.js');
const { memoryStorage } = await import('./helpers/storage.js');

const read = (f) => readFileSync(f, 'utf8');
const B = P.REEF_BOUNDS;
const area = build(new THREE.Scene());
const AIR = M.airAvoid();
const FLOAT_CEILING = 2.2;
const NEW_IDS = ['rfjelly', 'rfclown', 'rfhorse', 'rfmanta', 'rfwhale', 'rfmoray', 'rfsquid'];
const inBounds = (x, z, m = 0) => x > B.minX + m && x < B.maxX - m && z > B.minZ + m && z < B.maxZ - m;
const clearOf = (x, z, discs, margin = 0) => discs.every((d) => Math.hypot(x - d[0], z - d[1]) >= d[2] + margin - 1e-6);
const up = (p) => p.y - P.reefY(p.x, p.z);

describe('the plans', () => {
  it('the salts differ from every other creature\'s', () => {
    const all = [...Object.values(M.SALTS), ...Object.values(S.SALTS), ...Object.values(C.SALTS)];
    expect(new Set(all).size).toBe(all.length);
  });
  it('are deterministic: every pose reads the same twice, at any time', () => {
    for (const t of [0, 7.7, 91.3, 1234.5]) {
      for (const j of M.JELLIES) expect(M.jellyPose(j, t, {})).toEqual(M.jellyPose(j, t, {}));
      for (const f of M.CLOWNS) expect(M.clownPose(f, t, {})).toEqual(M.clownPose(f, t, {}));
      for (const h of M.HORSES) expect(M.horsePose(h, t, {})).toEqual(M.horsePose(h, t, {}));
      for (const m of M.MANTAS) expect(M.mantaPose(m, t, {})).toEqual(M.mantaPose(m, t, {}));
      for (const c of [false, true]) expect(M.whalePose(c, t, {})).toEqual(M.whalePose(c, t, {}));
      for (const e of M.EEL_DENS) expect(M.eelPose(e, t, {})).toEqual(M.eelPose(e, t, {}));
      for (const q of M.SQUIDS) expect(M.squidPose(q, t, { tone: [0, 0, 0] })).toEqual(M.squidPose(q, t, { tone: [0, 0, 0] }));
    }
    expect(M.airAvoid()).toEqual(M.airAvoid());
  });
  it('the rungs keep fewer: eight jellyfish, three clown pairs, three seahorses, two mantas, whale and calf, two eels, six squid; low and lite five, two, two, one, the whale alone, one, four', () => {
    expect(M.MORE_COUNT.high).toEqual({ jellies: 8, clowns: 3, horses: 3, mantas: 2, whale: 1, calf: 1, eels: 2, squid: 6 });
    for (const r of ['low', 'lite']) expect(M.MORE_COUNT[r]).toEqual({ jellies: 5, clowns: 2, horses: 2, mantas: 1, whale: 1, calf: 0, eels: 1, squid: 4 });
    expect(M.JELLIES).toHaveLength(8); expect(M.SQUIDS).toHaveLength(6); expect(M.CLOWNS).toHaveLength(6);
  });
});

describe('the jellyfish', () => {
  it('drift no further than their reach, in bounds, 2.6 to 6.5 m up (above the float ceiling), clear of every find and story place, and pulse', () => {
    for (const j of M.JELLIES) {
      let lo = Infinity; let hi = -Infinity; let pulses = 0; let last = 0;
      for (let t = 0; t < 400; t += 0.37) {
        const p = M.jellyPose(j, t, {});
        expect(Math.hypot(p.x - j.x, p.z - j.z), `jelly ${j.id} t=${t}`).toBeLessThanOrEqual(j.amp + 1e-6);
        expect(inBounds(p.x, p.z, 0.8)).toBe(true);
        expect(clearOf(p.x, p.z, AIR, 0), `jelly ${j.id} at ${p.x},${p.z}`).toBe(true);
        lo = Math.min(lo, up(p)); hi = Math.max(hi, up(p));
        if (p.pulse > 0 && last <= 0) pulses++;
        last = p.pulse;
      }
      expect(lo).toBeGreaterThan(FLOAT_CEILING + 0.3); expect(hi).toBeLessThan(6.6); expect(pulses).toBeGreaterThan(20);
    }
  });
  it('more of them over the Deep and the Glow Cave (the first in the order, so the low rungs keep them)', () => {
    const deep = (j) => P.zoneAt(j.x, j.z) === 'deep' || j.x < -40;
    expect(M.JELLIES.filter(deep).length).toBeGreaterThanOrEqual(4);
    expect(M.JELLIES.slice(0, 3).every(deep)).toBe(true);
    expect(M.JELLIES.some((j) => j.x < -44 && j.z < -35)).toBe(true); // one over the cave's back
  });
});

describe('the clownfish', () => {
  it('swim round the Coral Garden\'s own clumps (CLOWN_ANCHORS is the small list to move onto anemones), in bounds and clear of the finds and story places', () => {
    const coral = P.scatterCoral();
    for (const a of M.CLOWN_ANCHORS) {
      const k = coral.find((c) => Math.abs(c.x - a[0]) < 0.06 && Math.abs(c.z - a[1]) < 0.06);
      expect(k, `a clump at ${a}`).toBeTruthy(); expect(k.zone).toBe('coral'); expect(a[2]).toBeCloseTo(k.s, 1);
    }
    expect(M.CLOWN_ANCHORS).toHaveLength(3);
    for (const f of M.CLOWNS) for (let t = 0; t < 200; t += 0.9) {
      const p = M.clownPose(f, t, {}); const a = M.CLOWN_ANCHORS[f.anchor];
      expect(inBounds(p.x, p.z, 1.5)).toBe(true);
      expect(Math.hypot(p.x - a[0], p.z - a[1])).toBeLessThan(a[2] * 0.8 + 1.1);
      expect(clearOf(p.x, p.z, AIR, 0), `fish ${f.id} at ${p.x},${p.z}`).toBe(true);
      expect(up(p)).toBeGreaterThan(0.1); expect(up(p)).toBeLessThan(0.9);
    }
  });
  it('weave: the radius breathes in and out over the clump\'s own edge', () => {
    const f = M.CLOWNS[0]; const a = M.CLOWN_ANCHORS[f.anchor]; let lo = Infinity; let hi = 0;
    for (let t = 0; t < 120; t += 0.2) { const p = M.clownPose(f, t, {}); const r = Math.hypot(p.x - a[0], p.z - a[1]); lo = Math.min(lo, r); hi = Math.max(hi, r); }
    expect(hi - lo).toBeGreaterThan(0.5); expect(lo).toBeLessThan(a[2] * 0.8 + 0.1); expect(hi).toBeGreaterThan(a[2] * 0.8 + 0.4);
  });
});

describe('the seahorses', () => {
  it('hold on to three tall kelp stalks of the Kelp Garden and sway; the third lets go now and then, drifts under a metre and takes hold again', () => {
    const kelp = P.scatterKelp();
    for (const h of M.HORSES) {
      const k = kelp.find((b) => Math.abs(b.x - h.x) < 0.01 && Math.abs(b.z - h.z) < 0.01);
      expect(k, `a stalk at ${h.x},${h.z}`).toBeTruthy(); expect(k.h).toBeGreaterThan(h.h + 2); expect(P.zoneAt(h.x, h.z)).toBe('kelp');
      expect(clearOf(h.x, h.z, AIR, 0.2)).toBe(true);
    }
    for (const h of M.HORSES) {
      let drifted = 0; let maxOff = 0; let swayLo = 0; let swayHi = 0;
      for (let t = 0; t < 300; t += 0.25) {
        const p = M.horsePose(h, t, {});
        if (p.hold < 0.5) drifted++;
        maxOff = Math.max(maxOff, Math.hypot(p.x - h.x, p.z - h.z)); swayLo = Math.min(swayLo, p.sway); swayHi = Math.max(swayHi, p.sway);
        expect(inBounds(p.x, p.z, 1.5)).toBe(true);
      }
      expect(swayHi - swayLo).toBeGreaterThan(0.1);
      if (h.drifts) { expect(drifted).toBeGreaterThan(10); expect(maxOff).toBeGreaterThan(0.4); expect(maxOff).toBeLessThan(1.0); } else { expect(drifted).toBe(0); expect(maxOff).toBeLessThan(1e-9); }
    }
    expect(M.horsePose(M.HORSES[2], 0, {}).hold).toBe(1);
  });
});

describe('the mantas', () => {
  it('glide wide slow loops 3 to 5 m up, above the float ceiling, in bounds, and 10 m off the parade\'s lane and everything on it', () => {
    const [[ax, az], [bx, bz]] = M.PARADE_LANE;
    const distToLane = (x, z) => {
      const dx = bx - ax; const dz = bz - az; const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(x - (ax + u * dx), z - (az + u * dz));
    };
    for (const m of M.MANTAS) {
      let lo = Infinity; let loop = 0;
      for (let t = 0; t < 300; t += 0.5) {
        const p = M.mantaPose(m, t, {});
        expect(inBounds(p.x, p.z, 3)).toBe(true);
        expect(up(p)).toBeGreaterThan(FLOAT_CEILING + 0.6); expect(up(p)).toBeLessThan(5.2);
        lo = Math.min(lo, distToLane(p.x, p.z));
        loop = Math.max(loop, Math.hypot(p.x - m.cx, p.z - m.cz));
      }
      expect(lo).toBeGreaterThan(10); expect(loop).toBeGreaterThan(8);
    }
    // the lane is the parade's own (the numbers are reefparade.js's)
    for (let k = 0; k <= PARADE.secs; k += 0.5) { const p = paradeAt(k); if (!p.manta) continue; expect(distToLane(p.manta.x, p.manta.z)).toBeLessThan(0.5); for (const m of M.MANTAS) for (let t = 0; t < 200; t += 4) expect(Math.hypot(M.mantaPose(m, t, {}).x - p.manta.x, M.mantaPose(m, t, {}).z - p.manta.z)).toBeGreaterThan(9); }
  });
});

describe('the whale', () => {
  it('passes high and slow over the Deep every 90 s, above the float ceiling and under the shimmer, mostly out of sight, with a calf close behind', () => {
    const deep = M.DEEP_ZONE; let near = 0; let total = 0; let best = Infinity;
    for (let t = 0; t < M.WHALE.secs; t += 0.5) {
      const w = M.whalePose(false, t, {}); const c = M.whalePose(true, t, {});
      expect(up(w)).toBeGreaterThan(5); expect(up(w)).toBeLessThan(P.SURFACE_Y - 1.6); expect(FLOAT_CEILING).toBeLessThan(up(w) - 1.4 * M.WHALE.size);
      expect(up(c)).toBeGreaterThan(4.2);
      expect(Math.hypot(w.x - c.x, w.z - c.z)).toBeLessThan(8);
      const d = Math.hypot(w.x - deep.x, w.z - deep.z); best = Math.min(best, d);
      if (d < 40) near++; total++;
    }
    expect(best).toBeLessThan(8); // the pass is over the Deep
    expect(near / total).toBeLessThan(0.35); // and the rest of the lap it is beyond the fog
    const w0 = M.whalePose(false, 0, {}); const w1 = M.whalePose(false, M.WHALE.secs, {}); // a lap is 90 s exactly
    for (const k of ['x', 'y', 'z', 'yaw', 'pitch']) expect(w1[k]).toBeCloseTo(w0[k], 6);
    expect(Math.hypot(M.whalePose(false, M.WHALE_PASS, {}).x - deep.x, M.whalePose(false, M.WHALE_PASS, {}).z - deep.z)).toBeLessThan(8);
  });
  it('moves at a slow glide (3 to 4 m a second), never fast', () => {
    for (let t = 0; t < 90; t += 5) { const a = M.whalePose(false, t, {}); const b = M.whalePose(false, t + 1, {}); const v = Math.hypot(b.x - a.x, b.z - a.z); expect(v).toBeGreaterThan(2.5); expect(v).toBeLessThan(4.5); }
  });
});

describe('the moray eels', () => {
  it('each in its own rock crack, one by the Coral Garden\'s rocks and one by the Sunken Boat, clear of every find and the other rocks', () => {
    expect(M.EEL_DENS).toHaveLength(2);
    expect(P.zoneAt(M.EEL_DENS[0].x, M.EEL_DENS[0].z)).toBe('coral');
    expect(Math.hypot(M.EEL_DENS[1].x - (-32.8), M.EEL_DENS[1].z - (-31.5))).toBeLessThan(10); expect(P.zoneAt(M.EEL_DENS[1].x, M.EEL_DENS[1].z)).toBe('deep');
    const own = S.lifeColliders().map((c) => `${c.x},${c.z},${c.r}`);
    const others = S.placeAvoid().filter((d) => !own.includes(d.join(',')));
    const kelp = P.scatterKelp();
    for (const e of M.EEL_DENS) {
      expect(inBounds(e.x, e.z, 3)).toBe(true);
      for (const d of others) expect(Math.hypot(e.x - d[0], e.z - d[1]), `(${e.x}, ${e.z}) vs ${d}`).toBeGreaterThanOrEqual(d[2] + e.r - 0.35);
      for (const k of kelp) expect(Math.hypot(e.x - k.x, e.z - k.z)).toBeGreaterThan(e.r + 0.3);
      expect(area.colliders.some((q) => q.x === e.x && q.z === e.z && q.r === e.r)).toBe(true); // solid, so she cannot float through the rocks
    }
    for (const a of S.OCTOPI) for (const e of M.EEL_DENS) expect(Math.hypot(a.x - e.x, a.z - e.z)).toBeGreaterThan(4);
  });
  it('sway, smile and blink, and the body never leaves the crack (it starts inside the den and ends within a metre of the mouth)', () => {
    const e = M.EEL_DENS[0]; let blinks = 0; let swayLo = 1; let swayHi = -1;
    for (let t = 0; t < 120; t += 0.2) {
      const p = M.eelPose(e, t, {});
      swayLo = Math.min(swayLo, p.sway); swayHi = Math.max(swayHi, p.sway);
      expect(p.grin).toBeGreaterThan(0.35); expect(p.grin).toBeLessThanOrEqual(1);
      if (p.blink > 0.5) blinks++;
      const a = M.eelSpine(e, p, 0, {}); const z = M.eelSpine(e, p, 1, {});
      expect(a.z).toBeLessThan(-0.4); expect(z.z).toBeLessThan(1.1); expect(Math.abs(z.x)).toBeLessThan(0.2);
      for (const s of [0, 0.3, 0.6, 1]) { const q = M.eelSpine(e, p, s, {}); expect(q.y).toBeGreaterThan(0.2); for (const k of ['x', 'y', 'z', 'r']) expect(Number.isFinite(q[k])).toBe(true); }
    }
    expect(swayHi - swayLo).toBeGreaterThan(1.5); expect(blinks).toBeGreaterThan(0);
  });
});

describe('the squid', () => {
  it('a school of six in open water 2.5 to 4.5 m up, in bounds, clear of the finds and story places, jetting in short bursts and gliding between', () => {
    let jetting = 0; let total = 0; let fastest = 0; let slowest = Infinity;
    for (let t = 0; t < 200; t += 0.2) {
      for (const q of M.SQUIDS) {
        const p = M.squidPose(q, t, { tone: [0, 0, 0] });
        expect(inBounds(p.x, p.z, 2)).toBe(true); expect(clearOf(p.x, p.z, AIR, 0), `squid ${q.id} at ${p.x},${p.z}`).toBe(true);
        expect(up(p)).toBeGreaterThan(FLOAT_CEILING + 0.3); expect(up(p)).toBeLessThan(4.5);
        total++; if (p.jet > 0.5) jetting++;
      }
      const a = M.squidPose(M.SQUIDS[0], t, { tone: [0, 0, 0] }); const b = M.squidPose(M.SQUIDS[0], t + 0.2, { tone: [0, 0, 0] });
      const v = Math.hypot(b.x - a.x, b.z - a.z) / 0.2; fastest = Math.max(fastest, v); slowest = Math.min(slowest, v);
    }
    expect(jetting / total).toBeGreaterThan(0.08); expect(jetting / total).toBeLessThan(0.3);
    expect(fastest).toBeGreaterThan(3 * slowest); // a burst is several times the glide
  });
  it('blush pink in the jet and fade to pale in the glide', () => {
    const q = M.SQUIDS[1]; let pink = 0; let pale = 0;
    for (let t = 0; t < 60; t += 0.1) {
      const p = M.squidPose(q, t, { tone: [0, 0, 0] });
      const dp = Math.hypot(p.tone[0] - M.SQUID_PINK[0], p.tone[1] - M.SQUID_PINK[1], p.tone[2] - M.SQUID_PINK[2]);
      const dq = Math.hypot(p.tone[0] - M.SQUID_PALE[0], p.tone[1] - M.SQUID_PALE[1], p.tone[2] - M.SQUID_PALE[2]);
      if (dp < 25) pink++; if (dq < 25) pale++;
    }
    expect(pink).toBeGreaterThan(5); expect(pale).toBeGreaterThan(5);
  });
});

describe('the drawing', () => {
  const wound = (soup, from, to) => {
    let good = 0; let bad = 0;
    for (let i = from; i < to; i += 3) {
      const v = (j) => [soup.p[(i + j) * 3], soup.p[(i + j) * 3 + 1], soup.p[(i + j) * 3 + 2]];
      const A = v(0); const Bv = v(1); const Cv = v(2);
      const e1 = Bv.map((x, q) => x - A[q]); const e2 = Cv.map((x, q) => x - A[q]);
      const c = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      let d = 0; for (let q = 0; q < 3; q++) d += c[q] * (soup.n[i * 3 + q] + soup.n[(i + 1) * 3 + q] + soup.n[(i + 2) * 3 + q]);
      if (d > 1e-9) good++; else if (d < -1e-9) bad++;
    }
    return bad / Math.max(1, good + bad);
  };
  it('writes outward-wound triangles with matching normals, finite, a few hundred a creature (jellyfish drawn both sides)', () => {
    const soup = new D.Soup(); soup.begin(); const sizes = {}; const mark = (key, fn) => { const k = soup.k; fn(); sizes[key] = (soup.k - k) / 3; };
    const pose = { tone: [0, 0, 0] };
    mark('clown', () => { M.clownPose(M.CLOWNS[0], 5, pose); D.drawClown(soup, M.CLOWNS[0], pose); });
    mark('horse', () => { M.horsePose(M.HORSES[0], 5, pose); D.drawHorse(soup, M.HORSES[0], pose); });
    mark('manta', () => { M.mantaPose(M.MANTAS[0], 5, pose); D.drawManta(soup, M.MANTAS[0], pose); });
    mark('whale', () => { M.whalePose(false, 5, pose); D.drawWhale(soup, null, pose); });
    mark('eel', () => { const e = M.EEL_DENS[0]; const ep = M.eelPose(e, 5, {}); D.drawEel(soup, e, ep, () => 0); });
    mark('squid', () => { M.squidPose(M.SQUIDS[0], 5, pose); D.drawSquid(soup, M.SQUIDS[0], pose, 5); });
    mark('jelly', () => { M.jellyPose(M.JELLIES[0], 5, pose); D.drawJelly(soup, M.JELLIES[0], pose); });
    for (const [k, v] of Object.entries(sizes)) { expect(v, k).toBeGreaterThan(80); expect(v, k).toBeLessThan(1300); }
    // every creature but the (double-sided) jellyfish is wound outward
    expect(wound(soup, 0, (soup.k - sizes.jelly * 3))).toBeLessThan(0.03);
    for (const x of soup.p.slice(0, soup.k * 3)) expect(Number.isFinite(x)).toBe(true);
    for (const x of soup.n.slice(0, soup.k * 3)) expect(Number.isFinite(x)).toBe(true);
  });
  it('the jellyfish is see-through and added to the water, written to no depth; the rest is solid vertex colour', () => {
    const j = D.moreMesh(new D.Soup(10), 'x', true); const s = D.moreMesh(new D.Soup(10), 'y');
    expect(j.mat.transparent).toBe(true); expect(j.mat.blending).toBe(THREE.AdditiveBlending); expect(j.mat.depthWrite).toBe(false); expect(j.mat.vertexColors).toBe(true);
    expect(s.mat.transparent).toBe(false); expect(s.mat.vertexColors).toBe(true);
    expect(j.mesh.userData.noMerge).toBe(true);
  });
});

describe('the life on a walk', () => {
  const walk = (opts) => { const scene = new THREE.Scene(); const life = createReefMoreLife({ scene, ...opts }); return { scene, life }; };
  const draws = (scene) => { let n = 0; scene.traverse((o) => { if (o.isMesh) n++; }); return n; };
  const snapshot = (scene) => { const out = []; scene.traverse((o) => { if (o.isMesh) out.push(Array.from(o.geometry.attributes.position.array.slice(0, 600))); }); return out; };
  const tris = (scene) => { let n = 0; scene.traverse((o) => { if (o.isMesh) n += o.geometry.drawRange.count / 3; }); return n; };

  it('is four draws (at most the four the brief allows), and counts the rungs', () => {
    const want = { high: { jellies: 8, clownfish: 6, horses: 3, mantas: 2, whales: 2, eels: 2, squid: 6 }, low: { jellies: 5, clownfish: 4, horses: 2, mantas: 1, whales: 1, eels: 1, squid: 4 } };
    for (const [tier, c] of [[null, want.high], [{ name: 'low', rung: 3 }, want.low], [{ shadows: false }, want.low]]) {
      const { scene, life } = walk({ tier });
      expect(draws(scene)).toBe(4);
      expect(life.counts).toMatchObject(c);
      expect(life.spottable).toHaveLength(c.jellies + c.clownfish / 2 + c.horses + c.mantas + 1 + c.eels + c.squid);
      life.dispose(); expect(draws(scene)).toBe(0);
    }
  });
  it('the triangles it adds are within the budget (high about 8 to 12 thousand, the low rungs fewer)', () => {
    const hi = walk({}); const lo = walk({ tier: { name: 'low', rung: 3 } });
    expect(tris(hi.scene)).toBeGreaterThan(5000); expect(tris(hi.scene)).toBeLessThan(13000);
    expect(tris(lo.scene)).toBeLessThan(tris(hi.scene) * 0.8);
  });
  it('moves with the clock, and the same clock gives the same picture twice', () => {
    const run = () => { const { scene, life } = walk({}); const cat = new THREE.Vector3(0, 0, 0); for (let i = 0; i < 40; i++) life.update(0.1, i * 0.1, cat); return snapshot(scene); };
    expect(run()).toEqual(run());
    const { scene, life } = walk({}); const cat = new THREE.Vector3(0, 0, 0); const first = snapshot(scene);
    for (let i = 0; i < 50; i++) life.update(0.1, 0, cat);
    expect(snapshot(scene)).not.toEqual(first);
  });
  it('reduced motion draws it once and keeps it (the whale over the Deep)', () => {
    const { scene, life } = walk({ reducedMotion: true });
    const cat = new THREE.Vector3(30, 0, 30); const first = snapshot(scene);
    for (let i = 0; i < 100; i++) life.update(0.1, i, cat);
    expect(snapshot(scene)).toEqual(first);
    const whale = life.spottable.find((a) => a.type === 'rfwhale');
    expect(Math.hypot(whale.pos.x - M.DEEP_ZONE.x, whale.pos.z - M.DEEP_ZONE.z)).toBeLessThan(8);
  });
  it('registers each animal as a photo and journal subject, with a label and a range, and the Reef\'s area hands the walk both lists', () => {
    const { life } = walk({});
    expect(new Set(life.spottable.map((a) => a.type))).toEqual(new Set(NEW_IDS));
    for (const a of life.spottable) { expect(a.pos).toBeInstanceOf(THREE.Vector3); expect(a.label).toMatch(/^a /); expect(a.range).toBeGreaterThanOrEqual(5); expect(JOURNAL_TYPES).toContain(a.type); }
    expect(life.spottable.find((a) => a.type === 'rfwhale').range).toBeGreaterThanOrEqual(20);
    const src = read('src/world/reef.js');
    expect(src).toMatch(/spottable: \[\.\.\.sea\.spottable, \.\.\.more\.spottable\]/);
    expect(src).toMatch(/more\.update\(\.\.\.a\)/); expect(src).toMatch(/more\.dispose\(\)/);
  });
});

describe('the journal pages', () => {
  it('seven more cards in the Reef\'s set, with names from start-up and hints from the lazy words, and the ids saved by the progression', () => {
    expect(REEF_LIFE_PAGES.map((p) => p[0]).slice(3)).toEqual(NEW_IDS);
    const at = JOURNAL_TYPES.indexOf(NEW_IDS[0]);
    expect(JOURNAL_TYPES.slice(at, at + 7)).toEqual(NEW_IDS);
    for (const id of NEW_IDS) {
      const page = REEF_LIFE_PAGES.find((p) => p[0] === id); const card = CRITTER_INFO.find((c) => c.id === id);
      expect(card.reef).toBe(true); expect(card.name).toBe(page[3]); expect(card.hint).toBe(HINTS[id]); expect(REEF_HINTS[id]).toBe(HINTS[id]);
      expect(REEF_PAGE_WORDS[id].name()).toBe(page[3]); expect(card.emoji).toBe(page[1]);
      withOffWords(() => expect(bannedIn(`${card.name} ${card.hint}`)).toBeNull());
    }
    expect(new Set(JOURNAL_TYPES).size).toBe(JOURNAL_TYPES.length);
    const p = createProgression(memoryStorage());
    for (const id of NEW_IDS) p.recordSighting(id);
    p.recordSighting('rfwhale');
    expect(p.state.journal).toMatchObject({ rfjelly: 1, rfwhale: 2, rfsquid: 1, rfmoray: 1 });
  });
});

describe('the words, in both sets', () => {
  const ids = Object.keys(LINES).filter((i) => !['reef.life.seal', 'reef.life.octopus', 'reef.life.dolphin'].includes(i));
  const scary = /\b(drown\w*|die|dies|dead|hurt\w*|panic\w*|gasp\w*|choke\w*|scared|scary|afraid|danger\w*|dark|lost forever|trapped|stuck|collapse\w*|lonely|fail\w*|bite\w*|sting\w*|teeth)\b/i;
  it('seven labels in the phrase table, short and kind, the same plain base in the everyday set with no series word', () => {
    expect(ids).toEqual(['reef.life.jelly', 'reef.life.clown', 'reef.life.horse', 'reef.life.manta', 'reef.life.whale', 'reef.life.moray', 'reef.life.squid']);
    for (const id of ids) {
      expect(hasPhrase(id), id).toBe(true);
      const s = phrase(id); expect(s).toMatch(/^a /); expect(s.length).toBeLessThanOrEqual(60); expect(s).not.toMatch(scary);
      withOffWords(() => { expect(bannedIn(phrase(id)), id).toBeNull(); expect(phrase(id)).not.toMatch(scary); });
    }
    withOffWords(() => { expect(phrase('reef.life.jelly')).toBe('a moon jellyfish'); expect(phrase('reef.life.whale')).toBe('a gentle whale'); expect(phrase('reef.life.squid')).toBe('a school of squid'); });
    for (const id of NEW_IDS) { expect(HINTS[id]).not.toMatch(scary); expect(HINTS[id].length).toBeLessThanOrEqual(90); }
  });
  it('every phrase(...) call in the new files is a literal id in the table', () => {
    for (const f of ['src/world/reefmorelive.js', 'src/world/reefmoreparts.js', 'src/world/reefmore.js']) {
      for (const m of read(f).replace(/\/\/.*$/gm, '').matchAll(/\bphrase\(([^)]*)\)/g)) { expect(m[1]).toMatch(/^'[a-z0-9.]+'$/); expect(Object.keys(LINES)).toContain(m[1].slice(1, -1)); }
    }
  });
});

describe('the source rules', () => {
  it('draw no random number, read no clock; the plans import no THREE', () => {
    for (const f of ['src/world/reefmore.js', 'src/world/reefmoreparts.js', 'src/world/reefmorelive.js']) {
      expect(read(f).replace(/\/\/.*$/gm, ''), f).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date/);
    }
    expect(read('src/world/reefmore.js')).not.toMatch(/from 'three'/);
  });
});
