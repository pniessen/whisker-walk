import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

// Teleport gates, milestone 1 (docs/superpowers/plans/2026-11-23-teleport-gates.md): the three looks, their budgets, the
// dormant and calm variants, what is solid, the owner's two choices (the look of each gate, where and facing which way
// she lands), and the card and the swirl in each look. The pictures are verify-teleport-gates-m1.html.

const { teleKit } = await import('./helpers/tele.js');
const { ARRIVE_IN, GATE_REACH, GATE_PREFETCH_REACH } = await import('../src/gateways.js');
const { isWalkableAt } = await import('../src/player.js');
const { floodFrom } = await import('./helpers/flood.js');
const { setGrow } = await import('../src/grow.js');
const { withOffWords, bannedIn } = await import('./helpers/offwords.js');
const park = await import('../src/world/park.js');
const greenhouse = await import('../src/world/greenhouse.js');
const { GREENHOUSE_SPAWN } = await import('../src/world/greenhouseplan.js');
const T = await import('../src/teleport.js');
const UI = await import('../src/teleui.js');
const G = await import('../src/world/telegate.js');

await teleKit();
const { TELE_ENDS, TELE_LOOK, TELE_ARRIVAL_FACING, ARRIVAL_FACINGS, arriveFor, teleRow } = T;
const { LOOK_BUDGET, LOOK_NAMES, buildTeleGate, addTeleGates, teleSolids, discTint, setTeleClock } = G;
const PG = TELE_ENDS.park[0];
const GP = TELE_ENDS.greenhouse[0];

const row = (look, extra = {}) => teleRow({ id: `x-${look}`, gateway: 'g', x: 10, z: -20, faces: 'west', to: 'park', twin: 'y', look, placement: 'inside', arrive: { x: 13.6, z: -20, yaw: Math.PI / 2 }, ...extra });
const meshesOf = (g) => { const out = []; g.traverse((o) => { if (o.isMesh) out.push(o); }); return out; };
const trisOf = (m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;

afterEach(() => setTeleClock(null));

describe('the three looks, in the plan\'s budget', () => {
  it('the looks are the three names the plan gives, all in the gate table\'s vocabulary', () => {
    expect([...LOOK_NAMES]).toEqual(['stonering', 'archway', 'hollow', 'cleft', 'grotto', 'hatch']);
    expect(LOOK_BUDGET).toEqual({ meshes: 6, triangles: 480, transparent: 1 });
  });
  for (const look of LOOK_NAMES) {
    for (const suit of [null, 'space', 'dive']) {
      it(`${look}${suit ? ` (${suit} tint)` : ''}: at most 6 meshes, 480 triangles and one transparent draw; the disc is the one, the rest are opaque`, () => {
        const g = buildTeleGate(row(look, { suit }));
        const meshes = meshesOf(g);
        const tris = meshes.reduce((n, m) => n + trisOf(m), 0);
        expect(meshes.length).toBeLessThanOrEqual(LOOK_BUDGET.meshes);
        expect(meshes.map((m) => m.name).sort()).toEqual(['teleBody', 'teleDisc', 'teleMotes']);
        expect(tris).toBeLessThanOrEqual(LOOK_BUDGET.triangles);
        expect(tris).toBeGreaterThan(100); // a real thing, not a placeholder
        const clear = meshes.filter((m) => m.material.transparent);
        expect(clear.map((m) => m.name)).toEqual(['teleDisc']);
        expect(clear.length).toBeLessThanOrEqual(LOOK_BUDGET.transparent);
        expect(g.name).toBe('telegate');
        expect(g.userData.look).toBe(look);
        expect(g.position.x).toBe(10);
        expect(g.rotation.y).toBeCloseTo(Math.PI / 2, 9); // local -z points west, the way she walks through
      });
    }
    it(`${look}: the disc is light, additive, seen from both sides, never a dark hole; the disc and the motes neither cast nor merge; its geometry is finite`, () => {
      const g = buildTeleGate(row(look));
      const disc = g.getObjectByName('teleDisc');
      expect(disc.material.blending).toBe(THREE.AdditiveBlending);
      expect(disc.material.side).toBe(THREE.DoubleSide);
      expect(disc.material.depthWrite).toBe(false);
      expect(disc.material.color.getHSL({}).l).toBeGreaterThan(0.6);
      expect(disc.material.map).toBeTruthy(); // the swirl painted on it
      for (const n of ['teleDisc', 'teleMotes']) expect(g.getObjectByName(n).userData.noMerge && g.getObjectByName(n).userData.noCast, n).toBe(true);
      for (const m of meshesOf(g)) {
        for (const v of m.geometry.attributes.position.array) expect(Number.isFinite(v), `${m.name} position`).toBe(true);
        if (m.name === 'teleBody') for (const v of m.geometry.attributes.color.array) expect(v).toBeGreaterThanOrEqual(0);
      }
    });
    it(`${look}: stands on the ground, under 6.5 m tall, and nothing sinks more than a hand below the grass`, () => {
      const g = buildTeleGate(row(look), { ground: { y: () => 2 } });
      expect(g.position.y).toBe(2);
      const box = new THREE.Box3().setFromObject(g);
      expect(box.min.y - 2).toBeGreaterThan(-0.15); // a hedge lump may sink a hand into the lawn
      expect(box.max.y - 2).toBeLessThan(6.5);
    });
    it(`${look}: the disc is plainly in the doorway, not hidden behind the body (it is near the gate's plane and within its width)`, () => {
      const g = buildTeleGate(row(look));
      g.updateMatrixWorld(true);
      const disc = new THREE.Box3().setFromObject(g.getObjectByName('teleDisc'));
      const body = new THREE.Box3().setFromObject(g.getObjectByName('teleBody'));
      expect(disc.min.y).toBeGreaterThanOrEqual(-0.01);
      expect(disc.max.y).toBeGreaterThan(2);
      // the gate faces west: its width runs along world z and its depth along world x
      expect(disc.max.z - disc.min.z).toBeLessThan(body.max.z - body.min.z);
      expect(disc.max.z - disc.min.z).toBeGreaterThan(1);
    });
  }

  it('dormant: the body alone, greyer, no disc, no motes, no transparent draw', () => {
    for (const look of LOOK_NAMES) {
      const awake = buildTeleGate(row(look));
      const dormant = buildTeleGate(row(look), { awake: false });
      expect(meshesOf(dormant).map((m) => m.name), look).toEqual(['teleBody']);
      expect(meshesOf(dormant).filter((m) => m.material.transparent), look).toHaveLength(0);
      expect(dormant.userData.awake).toBe(false);
      expect(awake.userData.awake).toBe(true);
      const bodyColour = (g) => g.getObjectByName('teleBody').material.color;
      expect(bodyColour(dormant).r + bodyColour(dormant).g + bodyColour(dormant).b, look).toBeLessThan(3);
      // both are the same shape: only the light is missing
      expect(trisOf(dormant.getObjectByName('teleBody')), look).toBe(trisOf(awake.getObjectByName('teleBody')));
    }
  });

  it('calm (reduced motion): nothing turns and nothing drifts; awake and not calm: both do, read from one clock', () => {
    const calm = buildTeleGate(row('stonering'), { calm: true });
    for (const n of ['teleDisc', 'teleMotes']) expect(calm.getObjectByName(n).onBeforeRender.toString(), n).toBe(new THREE.Mesh().onBeforeRender.toString());
    let now = 0;
    setTeleClock(() => now);
    const live = buildTeleGate(row('stonering'));
    const disc = live.getObjectByName('teleDisc');
    const motes = live.getObjectByName('teleMotes');
    const tex = disc.material.map;
    now = 1;
    disc.onBeforeRender(); motes.onBeforeRender();
    const a = [tex.rotation, motes.rotation.y, motes.position.y, disc.material.opacity];
    now = 2;
    disc.onBeforeRender(); motes.onBeforeRender();
    const b = [tex.rotation, motes.rotation.y, motes.position.y, disc.material.opacity];
    expect(b[0]).toBeGreaterThan(a[0]);
    expect(b[1]).toBeGreaterThan(a[1]);
    expect(b[2]).not.toBe(a[2]);
    // slow and smooth: the glow's opacity moves by under 0.1 and the swirl turns about one radian a second
    for (const o of [a[3], b[3]]) { expect(o).toBeGreaterThan(0.5); expect(o).toBeLessThanOrEqual(0.7); }
    expect(b[0] - a[0]).toBeLessThan(1.5);
    // the same clock gives the same frame, twice
    now = 1;
    disc.onBeforeRender();
    expect(tex.rotation).toBe(a[0]);
  });

  it('the tint: warm for a plain gate, cooler for the Moon\'s, bluer for the Reef\'s', () => {
    expect(discTint(row('stonering'))).toBe(0xffeeb4);
    expect(discTint(row('stonering', { suit: 'space' }))).not.toBe(discTint(row('stonering', { suit: 'dive' })));
    expect(discTint(row('hollow', { suit: 'dive' }))).toBe(0x9fd8ff);
    expect(discTint(row('hollow'))).not.toBe(discTint(row('archway')));
  });
});

describe('what is solid', () => {
  const circle = (end) => teleSolids(end);
  it('the ring and the arch have two pillars either side along their width; the hollow, its trunk behind the way through', () => {
    expect(circle(row('stonering')).map((c) => [c.x, c.z]).sort((p, q) => p[1] - q[1])).toEqual([[10, -21.3], [10, -18.7]]);
    const arch = circle(row('archway'));
    expect(arch).toHaveLength(2);
    expect(arch.map((c) => c.z).sort((p, q) => p - q).map((z) => +z.toFixed(6))).toEqual([-20.95, -19.05]);
    const trunk = circle(row('hollow'));
    expect(trunk).toHaveLength(1);
    expect(trunk[0].x).toBeCloseTo(10 - 1.3, 9); // she walks west, the trunk is west of the doorway
    expect(trunk[0].z).toBeCloseTo(-20, 9);
  });
  it('a facing turns the frame: north is the same circles turned a quarter', () => {
    const w = circle(row('hollow', { faces: 'west' }))[0];
    const n = circle(row('hollow', { faces: 'north' }))[0];
    expect([n.x, n.z].map((v) => +v.toFixed(6))).toEqual([10, -21.3]);
    expect(w.r).toBe(n.r);
    const s = circle(row('hollow', { faces: 'south' }))[0];
    expect([s.x, s.z].map((v) => +v.toFixed(6))).toEqual([10, -18.7]);
  });
  it('the doorway itself is open: nothing solid within 0.2 m of her standing at the gate, in any look', () => {
    for (const look of LOOK_NAMES) for (const faces of ['north', 'south', 'east', 'west']) {
      const e = row(look, { faces });
      for (const c of circle(e)) expect(Math.hypot(c.x - e.x, c.z - e.z) - c.r, `${look} ${faces}`).toBeGreaterThan(0.2);
    }
  });
  it('addTeleGates adds one group per end, hands back each end\'s solids, and a dormant end is still solid', () => {
    const scene = new THREE.Scene();
    const ends = [row('stonering'), row('hollow', { id: 'x2', x: 30 })];
    const { colliders } = addTeleGates(scene, ends, { awakeOf: (e) => e.id !== 'x2' });
    expect(scene.children.filter((c) => c.name === 'telegate')).toHaveLength(2);
    expect(colliders).toHaveLength(3);
    expect(scene.children.filter((c) => c.name === 'telegate').map((c) => c.userData.awake)).toEqual([true, false]);
    expect(G.NO_TELE.colliders).toEqual([]);
  });
});

describe('the owner\'s two choices, as constants', () => {
  it('each gate\'s look is named in TELE_LOOK, a real look, and is what its table row says', () => {
    expect(Object.keys(TELE_LOOK).sort()).toEqual(['greenhouse-park', 'moon-park', 'park-greenhouse', 'park-moon', 'reef-seaside', 'seaside-reef', 'crystal-docks', 'docks-crystal', 'farm-snowville', 'snowville-farm'].sort());
    for (const e of [PG, GP]) {
      expect(LOOK_NAMES, e.id).toContain(TELE_LOOK[e.id]);
      expect(e.look, e.id).toBe(TELE_LOOK[e.id]);
    }
  });
  it('the arrival facing is toward (the default) or away; the table\'s arrive is arriveFor at that choice', () => {
    expect(Object.keys(ARRIVAL_FACINGS)).toEqual(['toward', 'away']);
    expect(TELE_ARRIVAL_FACING).toBe('toward');
    for (const e of [PG, GP]) expect(e.arrive).toEqual(arriveFor(e.faces, e.x, e.z, TELE_ARRIVAL_FACING));
    expect(arriveFor('west', -10, 44, 'toward')).toEqual({ x: -6.4, z: 44, yaw: Math.PI / 2 });
    const away = arriveFor('west', -10, 44, 'away');
    expect([away.x, away.z]).toEqual([-3, 44]);
    expect(away.yaw).toBeCloseTo(-Math.PI / 2, 12);
    expect(arriveFor('north', 0, 0, 'toward')).toEqual({ x: 0, z: 3.6, yaw: 0 });
    expect(arriveFor('south', 0, 0, 'away')).toEqual({ x: 0, z: -7, yaw: 0 }); // turned round (pi + pi, as a yaw in -pi..pi)
    expect(() => arriveFor('west', 0, 0, 'sideways')).toThrow(/sideways/);
  });
  it('the camera stands 4.4 m behind her: toward leaves it clear of the stones, and away puts the gate behind it', () => {
    // she faces yaw; behind her is the opposite way; the camera is 4.4 m back along it
    const camera = (mode) => {
      const a = arriveFor('west', 0, 0, mode);
      const fx = -Math.sin(a.yaw);
      const fz = -Math.cos(a.yaw);
      return { x: a.x - fx * 4.4, z: a.z - fz * 4.4, a };
    };
    const toward = camera('toward');
    expect(Math.hypot(toward.x, toward.z)).toBeGreaterThanOrEqual(8 - 1e-9); // out behind her, in the open: the gate in front of her
    const away = camera('away');
    expect(Math.abs(away.x)).toBeGreaterThan(2.5); // 7 - 4.4 = 2.6 m from the gate's plane: clear of the stones (1.3 m + their width)
    expect(away.x).toBeGreaterThan(0);
  });
  describe('both choices land her on open lawn she can walk to, out of the gate\'s reach and inside its warm-up', () => {
    setGrow(false);
    const areas = { park: park.build(new THREE.Scene(), {}), greenhouse: greenhouse.build(new THREE.Scene(), {}) };
    const spawn = { park: park.SPAWN, greenhouse: GREENHOUSE_SPAWN };
    const flood = {};
    const reach = (id) => (flood[id] ??= floodFrom(areas[id], spawn[id], (x, z) => isWalkableAt(areas[id], x, z)));
    for (const mode of Object.keys(ARRIVAL_FACINGS)) {
      for (const [id, e] of [['park', PG], ['greenhouse', GP]]) {
        it(`${mode} in the ${id}: open, reached on foot from the spawn, outside the collider list by 3 m, and the camera's spot is open too`, () => {
          const land = arriveFor(e.faces, e.x, e.z, mode);
          expect(isWalkableAt(areas[id], land.x, land.z)).toBe(true);
          expect(reach(id).reaches(land.x, land.z)).toBe(true);
          for (const c of areas[id].colliders) expect(Math.hypot(c.x - land.x, c.z - land.z) - (c.r ?? 0), `collider (${c.x}, ${c.z})`).toBeGreaterThan(1.5);
          const d = Math.hypot(land.x - e.x, land.z - e.z);
          expect(d).toBeGreaterThan(GATE_REACH + 1);
          expect(d).toBeLessThan(GATE_PREFETCH_REACH);
          expect(d).toBeGreaterThanOrEqual(ARRIVE_IN - 1e-9);
          const fx = -Math.sin(land.yaw);
          const fz = -Math.cos(land.yaw);
          expect(isWalkableAt(areas[id], land.x - fx * 4.4, land.z - fz * 4.4), 'the camera\'s spot').toBe(true);
        });
      }
    }
  });
});

describe('the card and the swirl, in each look', () => {
  it('the card has an emblem of the look, the question in the look\'s words, the two buttons and their tags', () => {
    for (const look of LOOK_NAMES) {
      const html = UI.cardHtml({ name: 'The Moon', look, tint: 0xe6e2ff });
      expect(html).toContain(`tele-emblem tele-emblem-${look}`);
      expect(html).toContain('--tele-a:#e6e2ff');
      expect(html).toContain(look === 'stonering' ? 'The stones are glowing. Go through to the Moon?' : 'The gate is glowing. Go through to the Moon?');
      expect(html.match(/<button /g)).toHaveLength(2);
    }
    expect(UI.cardHtml({ name: 'X', look: '<script>' })).toContain('tele-emblem-stonering'); // an unknown look cannot become markup
    withOffWords(() => { expect(UI.cardHtml({ name: 'The Moon', look: 'stonering' })).toContain('>Go through to the Moon?<'); });
  });
  it('the swirl takes the gate\'s colour, and an odd one falls back to the warm default', () => {
    expect(UI.swirlHtml({ name: 'The Reef', tint: 0x9fd8ff })).toContain('--tele-a:#9fd8ff');
    expect(UI.swirlHtml({ name: 'The Reef', tint: 'red; background:url(x)' })).toContain('--tele-a:#ffe7a6');
    expect(UI.CSS).toMatch(/var\(--tele-a,#ffe7a6\)/);
    expect(UI.hex(0x00ff10)).toBe('#00ff10');
  });
  it('the touch prompt reads "Go through" and the pad and TV cards carry the pad\'s tags', async () => {
    const t = await teleKit({ padTag: (tok) => ` <i>${tok}</i>` });
    const html = (await import('../src/teleui.js')).cardHtml({ name: 'The Moon' });
    expect(html).toMatch(/Go through <i>⟦confirm⟧<\/i>/);
    expect(html).toMatch(/Not now <i>⟦back⟧<\/i>/);
    // the buttons are 48 px tall (84 px at couch size), so a thumb or a pad's cursor finds them
    expect(UI.CSS).toMatch(/\.tele-card \.btn\{min-height:48px/);
    expect(UI.CSS).toMatch(/html\.tv \.tele-card \.btn\{min-height:calc\(84px/);
    await teleKit();
    expect(t).toBe(T);
  });
  it('the everyday words of the card and the swirl hold no series word, for each look', () => {
    withOffWords(() => {
      for (const look of LOOK_NAMES) {
        expect(bannedIn(UI.cardHtml({ name: 'The Reef', look })), look).toBeNull();
        expect(bannedIn(T.walkOn(PG.id, { edition: 'canon' }, false).line)).toBeNull();
      }
    });
  });
});

describe('the walk\'s draw of the gates (teleport.draw)', () => {
  it('draws the gates of the place with the flag on, awake (the spike rows are always awake), moving unless reduced motion, and none with the flag off', async () => {
    const { setTele } = await import('../src/teleflag.js');
    const { setGreenhouse } = await import('../src/greenhouseflag.js');
    setTele(true); setGreenhouse(true);
    try {
      const state = { edition: 'canon', walks: { park: 2 } };
      const scene = new THREE.Scene();
      const solids = T.draw(scene, 'park', state, { y: () => 0 }, false);
      const gate = scene.children.find((c) => c.name === 'telegate' && c.userData.endId === 'park-greenhouse');
      expect(gate.userData.awake).toBe(true); // (two Park walks: the archway and the Moon's ring wake together)
      expect(scene.children.find((c) => c.userData.endId === 'park-moon').userData.awake).toBe(true);
      // and before two Park walks both sleep
      const sleepy = new THREE.Scene();
      T.draw(sleepy, 'park', { edition: 'canon', walks: {} }, { y: () => 0 }, false);
      expect(sleepy.children.filter((c) => c.name === 'telegate').map((c) => c.userData.awake)).toEqual([false, false]);
      expect(gate.getObjectByName('teleDisc').onBeforeRender).not.toBe(new THREE.Mesh().onBeforeRender);
      expect(solids).toHaveLength(4); // two pillars each
      const calmScene = new THREE.Scene();
      T.draw(calmScene, 'park', state, { y: () => 0 }, true);
      expect(calmScene.children.find((c) => c.userData.endId === 'park-greenhouse').getObjectByName('teleDisc').onBeforeRender).toBe(new THREE.Mesh().onBeforeRender);
      setTele(false);
      const none = new THREE.Scene();
      expect(T.draw(none, 'park', state, { y: () => 0 }, false)).toEqual([]);
      expect(none.children).toHaveLength(0);
    } finally { setTele(null); setGreenhouse(null); }
  });
});
