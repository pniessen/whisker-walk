import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// path()'s gravel paints a canvas texture; a stub canvas is enough here (as
// test/borderpost.world.test.js does).
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { buildGateLook, addGatewayDressing, NO_GATES, LEAF_BLOCKS, LEAF_R, LEAF_OPEN, openAngle } = await import('../src/world/gateway.js');
const { CAT_RADIUS } = await import('../src/player.js');
const { GATEWAY_ENDS, endById, gatewayEnd, GATE_HALF, GATE_POST_R } = await import('../src/gateways.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { LAND } = await import('../src/territories.js');
const { STREET_LAND } = await import('../src/worldmap.js');
const { phrase } = await import('../src/clanphrases.js');
const { placeName } = await import('../src/edition.js');
const { CATALOG } = await import('../src/progression.js');
const { standInWords } = await import('./helpers/standinwords.js');
const { addWordSet, removeWordSet, setSeriesMode, SERIES_ON } = await import('../src/wordset.js');

// Does any vertex of `geo` carry `hex` (as Three stores it, linear), within 1/255?
function hasColour(geo, hex) {
  const c = new THREE.Color(hex);
  const col = geo.attributes.color;
  const tol = 1 / 255;
  for (let i = 0; i < col.count; i++) {
    if (Math.abs(col.getX(i) - c.r) <= tol && Math.abs(col.getY(i) - c.g) <= tol && Math.abs(col.getZ(i) - c.b) <= tol) return true;
  }
  return false;
}

describe('gate looks', () => {
  for (const look of ['signpost', 'fairgate', 'farmgate', 'promenade']) {
    it(`${look}: two meshes, at most 400 triangles, a vertex-coloured body and a leaf the merge leaves alone`, () => {
      const end = Object.values(GATEWAY_ENDS).flat().find((e) => e.look === look);
      const g = buildGateLook(end);
      expect(g.name).toBe('gateway');
      expect(g.userData.endId).toBe(end.id);
      const meshes = []; g.traverse((o) => { if (o.isMesh) meshes.push(o); });
      expect(meshes.map((m) => m.name).sort()).toEqual(['gateBody', 'gateLeaf']);
      expect(meshes.reduce((n, m) => n + m.geometry.index.count / 3, 0)).toBeLessThanOrEqual(400);
      const body = meshes.find((m) => m.name === 'gateBody');
      expect(body.geometry.attributes.color).toBeDefined();
      const leaf = meshes.find((m) => m.name === 'gateLeaf');
      expect([leaf.userData.noCast, leaf.userData.noMerge]).toEqual([true, true]);
      const scene = new THREE.Scene(); scene.add(g); mergeStaticProps(scene);
      expect(scene.getObjectByName('gateLeaf')).toBeDefined();
    });
  }

  it('stands at its end, on the ground', () => {
    const { end } = endById('park-farm');
    const ground = { flat: false, y: () => 0.5 };
    const g = buildGateLook(end, { ground });
    expect([g.position.x, g.position.y, g.position.z]).toEqual([42, 0.5, 10]);
  });

  it('the band is the neighbour\'s map colour', () => {
    const body = buildGateLook(endById('park-farm').end).getObjectByName('gateBody');
    expect(hasColour(body.geometry, STREET_LAND.farm)).toBe(true); // within 1/255
    const town = buildGateLook(endById('park-town').end).getObjectByName('gateBody');
    expect(hasColour(town.geometry, LAND.town)).toBe(true);
  });

  it("a 'none' look is null", () => {
    const door = gatewayEnd({ id: 'd', gateway: 'g', x: 0, z: 0, faces: 'north', to: 'park', twin: 'e', look: 'none', placement: 'inside', arrive: { x: 0, z: 3, yaw: Math.PI } });
    expect(buildGateLook(door)).toBeNull();
  });
});

const alley = () => gatewayEnd({ id: 'roofs-town', gateway: 'g', x: 14, z: 45.55, faces: 'south', to: 'neighborhood', twin: 't', look: 'alleydoor', placement: 'inside', arrive: { x: 14, z: 42, yaw: 0 } });

describe('the alley door', () => {
  it('the alley door: brick piers and a lintel, a dark doorway, a green door', () => {
    const g = buildGateLook(alley());
    expect(g.name).toBe('gateway');
    const meshes = []; g.traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(meshes.map((m) => m.name).sort()).toEqual(['gateBody', 'gateLeaf']);
    expect(meshes.reduce((n, m) => n + m.geometry.index.count / 3, 0)).toBeLessThanOrEqual(400);
    const body = meshes.find((m) => m.name === 'gateBody');
    body.geometry.computeBoundingBox();
    const bb = body.geometry.boundingBox;
    expect(bb.max.y - bb.min.y).toBeGreaterThanOrEqual(2.2);
    expect(bb.min.x).toBeLessThanOrEqual(-GATE_HALF);
    expect(bb.max.x).toBeGreaterThanOrEqual(GATE_HALF);
  });

  it('it opens into the place, not through the wall', () => {
    expect(openAngle('alleydoor')).toBe(-(Math.PI - 0.12));
    expect(openAngle('signpost')).toBe(LEAF_OPEN);
    const end = alley();
    const scene = new THREE.Scene();
    const d = addGatewayDressing(scene, 'roofs', { ends: [end], isOpen: () => true });
    const list = [];
    d.attach(list);
    expect(list).toHaveLength(0);
    scene.updateMatrixWorld(true);
    const leaf = scene.children.find((c) => c.userData.endId === end.id).getObjectByName('gateLeaf');
    const mid = new THREE.Box3().setFromObject(leaf).getCenter(new THREE.Vector3());
    // folded back flat against the wall: inward side or on the edge line, the
    // far end near the line, all of it beyond the hinge post away from the latch
    const box = new THREE.Box3().setFromObject(leaf);
    expect(box.max.z).toBeLessThanOrEqual(end.z + 0.01);
    expect(box.min.z).toBeGreaterThanOrEqual(end.z - 0.5);
    expect(mid.z).toBeLessThan(end.z + 0.01);
    // south-facing: local +x is world -x, so the hinge post is at end.x + GATE_HALF
    expect(box.min.x).toBeGreaterThanOrEqual(end.x + GATE_HALF - 0.01);
    d.setOpen(end.id, false);
    expect(list).toHaveLength(LEAF_BLOCKS);
  });

  it('every other look still swings its open leaf out', () => {
    for (const look of ['signpost', 'fairgate', 'farmgate', 'promenade']) {
      const end = Object.values(GATEWAY_ENDS).flat().find((e) => e.look === look);
      const scene = new THREE.Scene();
      addGatewayDressing(scene, 'park', { ends: [end], isOpen: () => true });
      expect(scene.children.find((c) => c.name === 'gateway').getObjectByName('gateLeaf').parent.rotation.y).toBe(LEAF_OPEN);
    }
  });
});

describe('addGatewayDressing', () => {
  it('the Park gets three gates, two lanes and two posts a gate', () => {
    const scene = new THREE.Scene();
    const d = addGatewayDressing(scene, 'park');
    expect(scene.children.filter((c) => c.name === 'gateway').map((c) => c.userData.endId)).toEqual(['park-town', 'park-fair', 'park-farm']);
    expect(scene.children.filter((c) => c.userData.gateLane)).toHaveLength(2);
    expect(d.colliders).toHaveLength(6);
    // park-farm faces east, so its posts stand along z
    expect(d.colliders.slice(4)).toEqual([{ x: 42, z: 10 - GATE_HALF, r: GATE_POST_R }, { x: 42, z: 10 + GATE_HALF, r: GATE_POST_R }]);
  });

  it('shut until open, and setOpen swings it', () => {
    const scene = new THREE.Scene();
    const d = addGatewayDressing(scene, 'park', { isOpen: (e) => e.id === 'park-town' });
    const leafOf = (id) => scene.children.find((c) => c.userData.endId === id).getObjectByName('gateLeaf').parent;
    expect(leafOf('park-town').rotation.y).not.toBe(0);
    expect(leafOf('park-farm').rotation.y).toBe(0);
    d.setOpen('park-farm', true); expect(Math.abs(leafOf('park-farm').rotation.y)).toBeCloseTo(Math.PI / 2, 9);
    d.setOpen('park-farm', true); expect(Math.abs(leafOf('park-farm').rotation.y)).toBeCloseTo(Math.PI / 2, 9);
    d.setOpen('park-farm', false); expect(leafOf('park-farm').rotation.y).toBe(0);
    expect(() => d.setOpen('nope', true)).not.toThrow();
  });

  it('an open leaf swings out of the area, the way the end faces', () => {
    const scene = new THREE.Scene();
    addGatewayDressing(scene, 'park', { isOpen: () => true });
    scene.updateMatrixWorld(true);
    for (const id of ['park-town', 'park-fair', 'park-farm']) {
      const { end } = endById(id);
      const leaf = scene.children.find((c) => c.userData.endId === id).getObjectByName('gateLeaf');
      const box = new THREE.Box3().setFromObject(leaf);
      const mid = box.getCenter(new THREE.Vector3());
      const out = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }[end.faces];
      // the open leaf's middle lies beyond the gate line, on the far side
      expect((mid.x - end.x) * out[0] + (mid.z - end.z) * out[1]).toBeGreaterThan(0.5);
    }
  });

  it('lanes lie on the ground, top-level, where the data says', () => {
    const scene = new THREE.Scene();
    addGatewayDressing(scene, 'park', { ground: { flat: false, y: () => 0.25 } });
    const lanes = scene.children.filter((c) => c.userData.gateLane);
    // named 'path', so the wet and dusk tints and the paw prints treat it as one
    expect(lanes.every((l) => l.name === 'path')).toBe(true);
    expect(lanes.every((l) => l.isMesh && Math.abs(l.position.y - 0.26) < 1e-9)).toBe(true);
    // park-farm's lane runs (16, 10) to (42, 10)
    expect(lanes.some((l) => Math.abs(l.position.x - 29) < 1e-9 && Math.abs(l.position.z - 10) < 1e-9)).toBe(true);
  });

  it('never touches area colliders and draws nothing for a place with no gates', () => {
    const scene = new THREE.Scene();
    const d = addGatewayDressing(scene, 'woods');
    expect(d.colliders).toEqual([]);
    expect(scene.children).toHaveLength(0);
    expect(() => d.dispose()).not.toThrow();
  });

  it("a 'none' look draws nothing and blocks nothing", () => {
    const door = gatewayEnd({ id: 'd', gateway: 'g', x: 0, z: 0, faces: 'north', to: 'park', twin: 'e', look: 'none', placement: 'inside', arrive: { x: 0, z: 3, yaw: Math.PI } });
    const scene = new THREE.Scene();
    expect(addGatewayDressing(scene, 'neighborhood', { ends: [door] }).colliders).toEqual([]);
    expect(scene.children).toHaveLength(0);
  });

  it('a shut leaf blocks: attach puts its circles on the live list, opening takes them off', () => {
    const scene = new THREE.Scene();
    const d = addGatewayDressing(scene, 'park', { isOpen: (e) => e.id === 'park-town' });
    const posts = d.colliders.slice();
    d.setOpen('park-fair', true); // before attach: only recorded
    const list = [{ x: 0, z: 0, r: 1 }];
    d.attach(list);
    const blocks = (id) => {
      const { end } = endById(id);
      return list.filter((c) => c.r === LEAF_R && Math.hypot(c.x - end.x, c.z - end.z) < GATE_HALF);
    };
    // only the shut end (park-farm) blocks; park-town started open, park-fair was opened
    expect(list).toHaveLength(1 + LEAF_BLOCKS);
    expect(blocks('park-farm')).toHaveLength(LEAF_BLOCKS);
    expect(blocks('park-fair')).toHaveLength(0);
    // the circles close the gap: no two neighbours (posts included) leave room for the cat
    const line = [posts[4], ...blocks('park-farm'), posts[5]].sort((a, b) => a.z - b.z);
    for (let i = 1; i < line.length; i++) {
      expect(Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z)).toBeLessThan(line[i].r + line[i - 1].r + 2 * CAT_RADIUS);
    }
    d.setOpen('park-farm', true);
    expect(list).toHaveLength(1);
    d.setOpen('park-farm', true);
    expect(list).toHaveLength(1);
    d.setOpen('park-farm', false);
    d.setOpen('park-farm', false);
    expect(blocks('park-farm')).toHaveLength(LEAF_BLOCKS);
    expect(list).toHaveLength(1 + LEAF_BLOCKS);
    d.setOpen('park-town', false);
    expect(list).toHaveLength(1 + 2 * LEAF_BLOCKS);
    expect(d.colliders).toEqual(posts); // the posts never change
  });

  it('NO_GATES does nothing', () => {
    expect(NO_GATES.colliders).toEqual([]);
    expect(() => { NO_GATES.attach([]); NO_GATES.setOpen('park-town', true); NO_GATES.dispose(); }).not.toThrow();
  });
});

// Rooftops step 4: the town's gate to the Rooftops carries a painted name
// board (end.sign), one mesh on the latch post, facing back down the street.
describe('the name board on the town\'s north signpost', () => {
  const roofsEnd = () => endById('town-roofs').end;
  const nameFor = (e) => placeName(e.to, 'canon', CATALOG);
  const signOf = (g) => { const out = []; g.traverse((o) => { if (o.name === 'gateSign') out.push(o); }); return out; };

  it('town-roofs: exactly one gateSign mesh, out of the merge and the shadow pass', () => {
    const signs = signOf(buildGateLook(roofsEnd()));
    expect(signs).toHaveLength(1);
    expect(signs[0].isMesh).toBe(true);
    expect([signs[0].userData.noMerge, signs[0].userData.noCast]).toEqual([true, true]);
  });

  it('stands on the latch post, 1.7-2.4 m up, its face looking back down the street', () => {
    const end = roofsEnd();
    const scene = new THREE.Scene();
    addGatewayDressing(scene, 'neighborhood', { ends: [end] });
    scene.updateMatrixWorld(true);
    const sign = scene.getObjectByName('gateSign');
    const mid = new THREE.Box3().setFromObject(sign).getCenter(new THREE.Vector3());
    // the latch post is at +GATE_HALF along the edge; for a north-facing end that is +x
    const latch = { x: end.x + GATE_HALF, z: end.z };
    const hinge = { x: end.x - GATE_HALF, z: end.z };
    const d = (p) => Math.hypot(mid.x - p.x, mid.z - p.z);
    expect(d(latch)).toBeLessThan(d(hinge));
    expect(d(latch)).toBeLessThan(0.5);
    expect(mid.y).toBeGreaterThan(1.7);
    expect(mid.y).toBeLessThan(2.4);
    // its face (local +z) points into the Neighborhood, back toward the cat walking north to it
    const n = sign.getWorldDirection(new THREE.Vector3());
    expect(n.z).toBeGreaterThan(0.99);
    // and it stands in front of the post, on that inward side
    expect(mid.z - end.z).toBeGreaterThan(GATE_POST_R * 0.5);
  });

  it('no other end has a name board, and town-roofs is still at most 400 + 12 triangles', () => {
    for (const end of Object.values(GATEWAY_ENDS).flat()) {
      const g = buildGateLook(end);
      if (!g) continue;
      expect(signOf(g).length, end.id).toBe(end.id === 'town-roofs' ? 1 : 0);
    }
    const meshes = []; buildGateLook(roofsEnd()).traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(meshes.map((m) => m.name).sort()).toEqual(['gateBody', 'gateLeaf', 'gateSign']);
    expect(meshes.reduce((n, m) => n + m.geometry.index.count / 3, 0)).toBeLessThanOrEqual(412);
  });

  it('survives the static-prop merge as its own mesh', () => {
    const scene = new THREE.Scene();
    addGatewayDressing(scene, 'neighborhood', { ends: [roofsEnd()] });
    mergeStaticProps(scene);
    expect(scene.getObjectByName('gateSign')).toBeDefined();
  });

  it("paints the place's shown name through the phrase table, read when the gate is built", () => {
    const scene = new THREE.Scene();
    addGatewayDressing(scene, 'neighborhood', { nameFor });
    const sign = scene.getObjectByName('gateSign');
    expect(sign.userData.text).toBe(phrase('gate.sign', placeName('roofs', 'canon', CATALOG)));
    expect(sign.userData.text).toBe('Rooftops');
    expect(sign.material.map).toBeTruthy();
    // without a name it is still a board, just plain paint
    const bare = new THREE.Scene();
    addGatewayDressing(bare, 'neighborhood');
    expect(bare.getObjectByName('gateSign').userData.text).toBeNull();
    expect(bare.getObjectByName('gateSign').material.map).toBeNull();
  });

  it('the words follow the word set in use: the place name and the phrase', () => {
    const words = standInWords();
    for (const [id, set, want] of [
      ['gate-sign-place', words, () => phrase('gate.sign', words.PLACE_WORDS.roofs)],
      ['gate-sign-phrase', { ...words, PHRASES: { 'gate.sign': (n) => `To ${n}` } }, () => `To ${words.PLACE_WORDS.roofs}`],
    ]) {
      addWordSet(id, set);
      try {
        setSeriesMode(id);
        const scene = new THREE.Scene();
        addGatewayDressing(scene, 'neighborhood', { nameFor });
        const text = scene.getObjectByName('gateSign').userData.text;
        expect(text, id).toBe(want());
        expect(text, id).not.toContain('Rooftops');
      } finally {
        setSeriesMode(SERIES_ON);
        removeWordSet(id);
      }
    }
  });
});
