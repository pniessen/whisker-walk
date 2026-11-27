// The Reef's friendly sea life (seals, octopuses, a dolphin family): the plans (deterministic, in bounds, clear of colliders and finds), the pure poses (the same
// answer twice, the seals never nearer her than their keep, the octopus's peek, hide and colours, the dolphins high above the float), the drawing (outward winding,
// triangles, four draws), reduced motion, the rungs, the journal and photo registration, the two word sets and the source rules.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';

stubCanvasDocument();
const S = await import('../src/world/reefseals.js');
const D = await import('../src/world/reefsealsparts.js');
const { createReefSealsLife } = await import('../src/world/reefsealslive.js');
const { LINES, HINTS } = await import('../src/world/reeflifewords.js');
const P = await import('../src/world/reefplan.js');
const C = await import('../src/world/reefcritters.js');
const { build } = await import('../src/world/reef.js');
const { phrase, hasPhrase } = await import('../src/clanphrases.js');
const { CRITTER_INFO, renderJournalHtml } = await import('../src/journal.js');
const { JOURNAL_TYPES, createProgression } = await import('../src/progression.js');
const { REEF_LIFE_PAGES, REEF_PAGE_WORDS, REEF_HINTS } = await import('../src/reefpages.js');
const { memoryStorage } = await import('./helpers/storage.js');

const read = (f) => readFileSync(f, 'utf8');
const B = P.REEF_BOUNDS;
const area = build(new THREE.Scene());
const SW = S.swimAvoid();
const clearOf = (x, z, discs, margin = 0) => discs.every((d) => Math.hypot(x - d[0], z - d[1]) >= d[2] + margin - 1e-6);
const triangles = (soup) => soup.k / 3;

describe('the plans', () => {
  it('the salts are all different from every other creature\'s', () => {
    const all = [...Object.values(S.SALTS), ...Object.values(C.SALTS)];
    expect(new Set(all).size).toBe(all.length);
  });
  it('are deterministic: every plan and pose reads the same twice', () => {
    expect(S.swimAvoid()).toEqual(S.swimAvoid());
    expect(S.placeAvoid()).toEqual(S.placeAvoid());
    const a = { x: 3, z: -4 }; const cat = { x: 1, z: -2 };
    for (const s of S.SEALS.filter((q) => q.kind === 'swim')) expect(S.sealPose(s, 41.3, a, cat, {})).toEqual(S.sealPose(s, 41.3, a, cat, {}));
    for (const o of S.OCTOPI) expect(S.octopusPose(o, 9, 0.3, { tone: [0, 0, 0] })).toEqual(S.octopusPose(o, 9, 0.3, { tone: [0, 0, 0] }));
    for (const d of S.DOLPHINS) expect(S.dolphinPose(d, 12, a, {})).toEqual(S.dolphinPose(d, 12, a, {}));
  });
  it('the three rocks (the two dens and the sleeper\'s) are in bounds and clear of every collider, find, story point, spawn court, ladder and the kelp', () => {
    const own = S.lifeColliders().map((c) => [c.x, c.z, c.r]);
    const others = S.placeAvoid().filter((d) => !own.some((o) => o[0] === d[0] && o[1] === d[1] && o[2] === d[2]));
    const kelp = P.scatterKelp();
    const sites = [...S.OCTOPI.map((o) => [o.x, o.z, o.r]), [S.SEAL_ROCK.x, S.SEAL_ROCK.z, S.SEAL_ROCK.r]];
    expect(sites).toHaveLength(3);
    for (const [x, z, r] of sites) {
      expect(x).toBeGreaterThan(B.minX + 3); expect(x).toBeLessThan(B.maxX - 3); expect(z).toBeGreaterThan(B.minZ + 3); expect(z).toBeLessThan(B.maxZ - 3);
      for (const d of others) expect(Math.hypot(x - d[0], z - d[1]), `(${x}, ${z}) vs ${d}`).toBeGreaterThanOrEqual(d[2] + r - 0.35);
      for (const k of kelp) expect(Math.hypot(x - k.x, z - k.z), `kelp at ${k.x}, ${k.z}`).toBeGreaterThan(r + 0.3);
    }
    // the dens are in the gardens they belong to; the sleeper's rock is on the Sandy Flats
    const zoneOf = (id) => P.ZONES.find((z) => z.id === id);
    expect(Math.hypot(S.OCTOPI[0].x - zoneOf('coral').x, S.OCTOPI[0].z - zoneOf('coral').z)).toBeLessThan(zoneOf('coral').r);
    expect(Math.hypot(S.OCTOPI[1].x - zoneOf('kelp').x, S.OCTOPI[1].z - zoneOf('kelp').z)).toBeLessThan(zoneOf('kelp').r);
    expect(P.zoneAt(S.SEAL_ROCK.x, S.SEAL_ROCK.z)).toBe('flats');
  });
  it('the rocks are colliders of the Reef\'s area, so she cannot float through them', () => {
    for (const c of S.lifeColliders()) expect(area.colliders.some((q) => q.x === c.x && q.z === c.z && q.r === c.r)).toBe(true);
  });
  it('the rungs: two seals, a sleeper, two octopuses, three dolphins; low and lite keep one swimming seal, one octopus, a parent and one calf', () => {
    expect(S.LIFE_COUNT.high).toEqual({ swimmers: 2, sleeper: 1, octopuses: 2, dolphins: 3 });
    for (const r of ['low', 'lite']) expect(S.LIFE_COUNT[r]).toEqual({ swimmers: 1, sleeper: 0, octopuses: 1, dolphins: 2 });
    expect(S.lifeRung(null)).toBe('high'); expect(S.lifeRung({ name: 'low', rung: 3 })).toBe('low'); expect(S.lifeRung({ shadows: false })).toBe('lite');
  });
});

describe('the seals', () => {
  const swimmers = S.SEALS.filter((s) => s.kind === 'swim');
  it('stay in bounds, clear of the coral and rocks, and never nearer to her than their keep, wherever she is and whenever', () => {
    let near = 0; let total = 0; let worstClear = Infinity;
    for (let cx = B.minX + 4; cx <= B.maxX - 4; cx += 8) {
      for (let cz = B.minZ + 4; cz <= B.maxZ - 4; cz += 7) {
        const cat = { x: cx, z: cz };
        for (let t = 0; t < 120; t += 3.7) {
          for (const s of swimmers) {
            const o = S.sealPose(s, t, cat, cat, {});
            expect(o.x).toBeGreaterThanOrEqual(B.minX + 1.4); expect(o.x).toBeLessThanOrEqual(B.maxX - 1.4);
            expect(o.z).toBeGreaterThanOrEqual(B.minZ + 1.4); expect(o.z).toBeLessThanOrEqual(B.maxZ - 1.4);
            const d = Math.hypot(o.x - cat.x, o.z - cat.z);
            expect(d, `seal ${s.id} at t=${t} cat ${cx},${cz}`).toBeGreaterThanOrEqual(S.SEAL_KEEP - 0.3);
            total++;
            if (!clearOf(o.x, o.z, SW, 0.2)) near++;
            for (const dsc of SW) worstClear = Math.min(worstClear, Math.hypot(o.x - dsc[0], o.z - dsc[1]) - dsc[2]);
            expect(o.y).toBeGreaterThanOrEqual(P.reefY(o.x, o.z) + 0.45);
          }
        }
      }
    }
    // clear of every collider by their own radius and the body's margin (the very few pinned by coral on three sides still never sit inside one)
    expect(near / total).toBeLessThan(0.02);
    expect(worstClear).toBeGreaterThan(-0.5); // (the body's margin is 0.7: a seal pinned between the coral and her is never a metre in)
  });
  it('circle 3 to 6 m from the point they follow, with a closer look at her now and then', () => {
    const a = { x: -40, z: 2 }; let min = Infinity; let max = 0; // (open water: the coral pushes a seal further out)
    for (let t = 0; t < 400; t += 0.5) for (const s of swimmers) { const o = S.sealPose(s, t, a, null, {}); const d = Math.hypot(o.x - a.x, o.z - a.z); min = Math.min(min, d); max = Math.max(max, d); }
    expect(max).toBeLessThan(6.2); expect(min).toBeGreaterThan(2.0); expect(min).toBeLessThan(3.3); // the look pulls in to about 2.2 to 3 m
    let loops = 0; let rolls = 0;
    for (let t = 0; t < 120; t += 0.1) { const o = S.sealPose(swimmers[0], t, a, null, {}); if (o.pitch > 3) loops++; if (o.roll > 3) rolls++; }
    expect(loops).toBeGreaterThan(0); expect(rolls).toBeGreaterThan(0); // it loops and rolls
  });
  it('the sleeper lies on its rock, breathing', () => {
    const sl = S.SEALS.find((s) => s.kind === 'sleep');
    const a = S.sleeperPose(sl, 0, {}); const b = S.sleeperPose(sl, 1.7, {});
    expect(a.x).toBe(S.SEAL_ROCK.x); expect(a.y).toBeGreaterThan(P.reefY(a.x, a.z) + S.SEAL_ROCK.h);
    expect(a.breathe).not.toBe(b.breathe);
  });
});

describe('the octopuses', () => {
  it('peek now and then, wave while peeking, and step back (no peek, a deeper body, eyes half closed) when she is near', () => {
    for (const o of S.OCTOPI) {
      let peeked = 0; let waved = 0;
      for (let t = 0; t < 60; t += 0.25) {
        const p = S.octopusPose(o, t, 0, { tone: [0, 0, 0] });
        expect(p.peek).toBeGreaterThanOrEqual(0); expect(p.peek).toBeLessThanOrEqual(1);
        if (p.peek > 0.5) peeked++; if (p.wave > 0.5) waved++;
        const h = S.octopusPose(o, t, 1, { tone: [0, 0, 0] });
        expect(h.peek).toBe(0); expect(h.wave).toBe(0); expect(h.bz).toBeLessThan(p.bz + 1e-9); expect(h.bz).toBeLessThan(0);
      }
      expect(peeked).toBeGreaterThan(5); expect(waved).toBeGreaterThan(2);
    }
  });
  it('its colour slowly cycles through orange, red and purple', () => {
    const o = S.OCTOPI[0]; const seen = new Set();
    for (let t = 0; t < 40; t += 0.5) {
      const p = S.octopusPose(o, t, 0, { tone: [0, 0, 0] });
      let best = 0; let bd = Infinity;
      S.OCTO_TONES.forEach((c, i) => { const d = Math.hypot(c[0] - p.tone[0], c[1] - p.tone[1], c[2] - p.tone[2]); if (d < bd) { bd = d; best = i; } });
      if (bd < 30) seen.add(best);
    }
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });
  it('its eight arms stay above the sand floor, finite, and tapered', () => {
    const o = S.OCTOPI[1]; const p = S.octopusPose(o, 14, 0, { tone: [0, 0, 0] });
    for (let i = 0; i < S.ARM_COUNT; i++) {
      const base = S.armSpine(o, p, i, 0, 14, {}); const tip = S.armSpine(o, p, i, 1, 14, {});
      for (const v of [base, tip]) { for (const k of ['x', 'y', 'z', 'r']) expect(Number.isFinite(v[k])).toBe(true); expect(v.y).toBeGreaterThan(0.04); }
      expect(tip.r).toBeLessThan(base.r);
    }
    expect(S.ARM_COUNT).toBe(8);
  });
});

describe('the dolphins', () => {
  it('glide a loop above the float ceiling (3 to 6 m over the seabed), in bounds, with the calves close beside the parent', () => {
    const anchors = [{ x: 0, z: 0 }, { x: -46, z: 40 }, { x: 46, z: -40 }, { x: 20, z: -20 }];
    for (const a of anchors) for (let t = 0; t < 90; t += 1.3) {
      const parent = S.dolphinPose(S.DOLPHINS[0], t, a, {});
      for (const d of S.DOLPHINS) {
        const p = S.dolphinPose(d, t, a, {});
        const up = p.y - P.reefY(p.x, p.z);
        expect(up).toBeGreaterThan(3.3); expect(up).toBeLessThan(6.1);
        expect(p.x).toBeGreaterThan(B.minX); expect(p.x).toBeLessThan(B.maxX); expect(p.z).toBeGreaterThan(B.minZ); expect(p.z).toBeLessThan(B.maxZ);
        if (d.role === 'calf') expect(Math.hypot(p.x - parent.x, p.z - parent.z)).toBeLessThan(2.4);
      }
    }
    expect(S.DOLPHIN_LEVEL - 0.8).toBeGreaterThan(2.2 + 1); // the lowest arch is well above where she can float
  });
  it('arch in and out of a wave line: the height rises and falls round DOLPHIN_LEVEL', () => {
    let lo = Infinity; let hi = -Infinity;
    for (let t = 0; t < 30; t += 0.1) { const p = S.dolphinPose(S.DOLPHINS[0], t, { x: -40, z: 30 }, {}); const up = p.y - P.reefY(p.x, p.z); lo = Math.min(lo, up); hi = Math.max(hi, up); }
    expect(lo).toBeLessThan(S.DOLPHIN_LEVEL - 0.5); expect(hi).toBeGreaterThan(S.DOLPHIN_LEVEL + 0.5);
  });
});

describe('the drawing', () => {
  it('writes outward-wound triangles with matching normals, a few hundred a seal, an octopus and a dolphin', () => {
    const soup = new D.Soup(); soup.begin();
    const a = { x: 0, z: 0 }; const pose = {};
    S.sealPose(S.SEALS[0], 3, a, null, pose); D.drawSeal(soup, S.SEALS[0], pose);
    const seal = triangles(soup); let k = soup.k;
    const op = { tone: [0, 0, 0] }; S.octopusPose(S.OCTOPI[0], 5, 0, op); D.drawOctopus(soup, S.OCTOPI[0], op, 5, () => 0);
    const octo = (soup.k - k) / 3; k = soup.k;
    S.dolphinPose(S.DOLPHINS[0], 5, a, pose); D.drawDolphin(soup, S.DOLPHINS[0], pose, false);
    const dol = (soup.k - k) / 3;
    expect(seal).toBeGreaterThan(300); expect(seal).toBeLessThan(900);
    expect(octo).toBeGreaterThan(300); expect(octo).toBeLessThan(1200);
    expect(dol).toBeGreaterThan(200); expect(dol).toBeLessThan(900);
    let good = 0; let bad = 0;
    for (let i = 0; i < soup.k; i += 3) {
      const v = (j) => [soup.p[(i + j) * 3], soup.p[(i + j) * 3 + 1], soup.p[(i + j) * 3 + 2]];
      const A = v(0); const Bv = v(1); const Cv = v(2);
      const e1 = Bv.map((x, q) => x - A[q]); const e2 = Cv.map((x, q) => x - A[q]);
      const c = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      let d = 0; for (let q = 0; q < 3; q++) d += c[q] * (soup.n[i * 3 + q] + soup.n[(i + 1) * 3 + q] + soup.n[(i + 2) * 3 + q]);
      if (d > 1e-9) good++; else if (d < -1e-9) bad++;
    }
    expect(bad / (good + bad)).toBeLessThan(0.01);
    for (const x of soup.p.slice(0, soup.k * 3)) expect(Number.isFinite(x)).toBe(true);
  });
});

describe('the life on a walk', () => {
  const walk = (opts) => { const scene = new THREE.Scene(); const life = createReefSealsLife({ scene, ...opts }); return { scene, life }; };
  const draws = (scene) => { let n = 0; scene.traverse((o) => { if (o.isMesh) n++; }); return n; };
  const snapshot = (scene) => { const out = []; scene.traverse((o) => { if (o.isMesh) out.push(Array.from(o.geometry.attributes.position.array.slice(0, 600))); }); return out; };

  it('is four draws and counts the rungs', () => {
    for (const [tier, c] of [[null, { seals: 3, octopuses: 2, dolphins: 3 }], [{ name: 'low', rung: 3 }, { seals: 1, octopuses: 1, dolphins: 2 }], [{ shadows: false }, { seals: 1, octopuses: 1, dolphins: 2 }]]) {
      const { scene, life } = walk({ tier });
      expect(draws(scene)).toBe(4);
      expect(life.counts).toMatchObject(c);
      expect(life.spottable).toHaveLength(c.seals + c.octopuses + c.dolphins);
      life.dispose(); expect(draws(scene)).toBe(0);
    }
  });
  it('moves with the clock, and the same clock gives the same picture twice', () => {
    const run = () => { const { scene, life } = walk({}); const cat = new THREE.Vector3(0, 0, 0); for (let i = 0; i < 40; i++) life.update(0.1, i * 0.1, cat); return snapshot(scene); };
    const a = run(); const b = run();
    expect(a).toEqual(b);
    const { scene, life } = walk({}); const cat = new THREE.Vector3(0, 0, 0); life.update(0.1, 0, cat); const first = snapshot(scene);
    for (let i = 0; i < 50; i++) life.update(0.1, 0, cat);
    expect(snapshot(scene)).not.toEqual(first);
  });
  it('reduced motion freezes the seals, the octopus arms and the dolphins at their pose (only a step back when she comes close redraws an octopus)', () => {
    const { scene, life } = walk({ reducedMotion: true });
    const cat = new THREE.Vector3(30, 0, 30);
    life.update(0.1, 0, cat); const first = snapshot(scene);
    for (let i = 0; i < 100; i++) life.update(0.1, i, cat);
    expect(snapshot(scene)).toEqual(first);
    const den = S.denMouth(S.OCTOPI[0]);
    life.update(0.1, 0, new THREE.Vector3(den.x + 0.4, 0, den.z));
    expect(snapshot(scene)).not.toEqual(first);
  });
  it('an octopus steps back when she comes within 1.5 m of its den\'s mouth, and comes back when she leaves', () => {
    const { scene, life } = walk({});
    const den = S.denMouth(S.OCTOPI[0]);
    const octoMesh = () => { let m = null; scene.traverse((o) => { if (o.name === 'reef:octopuses') m = o; }); return Array.from(m.geometry.attributes.position.array); };
    const away = new THREE.Vector3(den.x + 8, 0, den.z);
    for (let i = 0; i < 20; i++) life.update(0.1, i * 0.1, away);
    const before = octoMesh();
    const close = new THREE.Vector3(den.x + 1.0, 0, den.z);
    const cs = []; for (let i = 0; i < 40; i++) { life.update(0.1, 2 + i * 0.1, close); }
    expect(octoMesh()).not.toEqual(before);
    void cs;
  });
  it('registers each animal as a photo and journal subject, with a label and a range', () => {
    const { life } = walk({});
    expect(new Set(life.spottable.map((a) => a.type))).toEqual(new Set(['rfseal', 'rfoctopus', 'rfdolphin']));
    for (const a of life.spottable) { expect(a.pos).toBeInstanceOf(THREE.Vector3); expect(a.label).toMatch(/^a /); expect(a.range).toBeGreaterThanOrEqual(6); expect(JOURNAL_TYPES).toContain(a.type); }
    expect(area.life).toBeTypeOf('function');
  });
});

describe('the journal pages', () => {
  it('three more cards in the Reef\'s set, with names from start-up and hints from the lazy words, and the ids saved by the progression', () => {
    expect(REEF_LIFE_PAGES.map((p) => p[0]).slice(0, 3)).toEqual(['rfseal', 'rfoctopus', 'rfdolphin']); // (seven more follow: test/reefmore.test.js)
    for (const [id, , , name] of REEF_LIFE_PAGES) {
      const card = CRITTER_INFO.find((c) => c.id === id);
      expect(card.reef).toBe(true); expect(card.name).toBe(name); expect(card.hint).toBe(HINTS[id]); expect(REEF_HINTS[id]).toBe(HINTS[id]);
      expect(REEF_PAGE_WORDS[id].name()).toBe(name);
      expect(JOURNAL_TYPES).toContain(id);
      withOffWords(() => expect(bannedIn(`${card.name} ${card.hint}`)).toBeNull());
    }
    const p = createProgression(memoryStorage());
    p.recordSighting('rfseal'); p.recordSighting('rfdolphin'); p.recordSighting('rfdolphin');
    expect(p.state.journal).toMatchObject({ rfseal: 1, rfdolphin: 2 });
    p.recordSighting('rfnope'); expect(p.state.journal.rfnope).toBeUndefined();
  });
  it('the journal draws the three cards only with the Reef on', () => {
    const html = renderJournalHtml({ rfseal: 2 }, 0, 9);
    expect(html).not.toMatch(/Curious Seal/);
  });
});

describe('the words, in both sets', () => {
  const ids = Object.keys(LINES);
  const scary = /\b(drown\w*|die|dies|dead|hurt\w*|panic\w*|gasp\w*|choke\w*|scared|scary|afraid|danger\w*|dark|lost forever|trapped|stuck|collapse\w*|lonely|fail\w*)\b/i;
  it('three labels in the phrase table, short and kind, the same plain base in the everyday set with no series word', () => {
    expect(ids.slice(0, 3)).toEqual(['reef.life.seal', 'reef.life.octopus', 'reef.life.dolphin']); // (seven more follow: test/reefmore.test.js)
    for (const id of ids) {
      expect(hasPhrase(id), id).toBe(true);
      const s = phrase(id); expect(s).toMatch(/^a /); expect(s.length).toBeLessThanOrEqual(60); expect(s).not.toMatch(scary);
      withOffWords(() => { expect(bannedIn(phrase(id)), id).toBeNull(); expect(phrase(id)).not.toMatch(scary); });
    }
    withOffWords(() => { expect(phrase('reef.life.seal')).toBe('a curious seal'); expect(phrase('reef.life.octopus')).toBe('a shy octopus'); expect(phrase('reef.life.dolphin')).toBe('a dolphin family'); });
    for (const h of Object.values(HINTS)) { expect(h).not.toMatch(scary); expect(h.length).toBeLessThanOrEqual(90); }
  });
  it('every phrase(...) call in the sea life\'s files is a literal id in the table', () => {
    for (const f of ['src/world/reefsealslive.js', 'src/world/reefsealsparts.js', 'src/world/reefseals.js']) {
      for (const m of read(f).replace(/\/\/.*$/gm, '').matchAll(/\bphrase\(([^)]*)\)/g)) { expect(m[1]).toMatch(/^'[a-z0-9.]+'$/); expect(ids).toContain(m[1].slice(1, -1)); }
    }
  });
});

describe('the source rules', () => {
  it('draw no random number, read no clock; the plan and its parts import no THREE where they need none', () => {
    for (const f of ['src/world/reefseals.js', 'src/world/reefsealsparts.js', 'src/world/reefsealslive.js', 'src/world/reeflifewords.js']) {
      expect(read(f).replace(/\/\/.*$/gm, ''), f).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date/);
    }
    expect(read('src/world/reefseals.js')).not.toMatch(/from 'three'/);
  });
});
