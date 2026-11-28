// =============================================================================
// THE REEF, THE TREASURE CHEST YOU CAN OPEN (2026-11-27). The Treasure Chest on the Sandy Flats (reeffindsplan.js REEF_FIND_MARKS.chest, drawn by
// reeffindparts.js without its lid) is the one closed chest she can see from the start. Standing beside it offers "Open the chest" (the Reef's prompt arbiter, so
// the same action button, key, tap or gamepad press as every other offer, and the TV HUD shows the line like the rest). Pressing it plays a short show:
//   0.0-0.9 s  the lid swings up on its hinge   | 0.5 s  a burst of gold sparkles and bubbles   | 0.9-3.1 s  a tiny Pearl Crown rises out, turning, in a glow
//   1.1 s      the surprise is GIVEN: AWARDS.reefchest paws and the Pearl Crown (worn at once if her head is bare), each once ever   | 3.1 s  the crown fades away
// Nothing is saved but what she owns: owning the Pearl Crown IS "the chest has been opened", on every device the save reaches, so the chest is open (and empty) on
// every later walk and nothing is ever paid twice. The press cannot fail and needs no skill. Draws no random number (the burst's pattern is a fixed hash of the
// particle's number), reads no clock but the walk's dt, adds no caster and no PointLight. Reduced motion: the lid is open at once, no burst, the crown simply
// appears over the chest for the same time.
// createReefChestLife({ scene, THREE, progression, log, audio, say, reducedMotion }) -> { promptAt(catPos), interact(), update(dt, t, catPos), state, dispose() }
// =============================================================================
import { phrase } from '../clanphrases.js';
import { topY as reefY } from './reefwreckplan.js';
import './reefchestwords.js';

// (This is the wreck stage's chunk: it imports nothing of three's and nothing from the base chunk, as reefhuntlive.js does. reef.js hands three's classes in as
// `THREE`, with `mergeGeometries`; the chest's place is copied from reeffindsplan.js REEF_FIND_MARKS.chest and reeffindparts.js CHEST_YAW, and
// test/reefchest.test.js holds the copies equal.)
export const CHEST_AT = Object.freeze({ x: -6.5, z: -15.5, yaw: 0.35 });

export const CROWN_ID = 'pearlcrown';
export const CHEST_REACH = 1.9; // metres from the chest's middle (horizontal; how high she floats never matters)
export const SHOW = Object.freeze({ lid: 0.9, burst: 0.5, give: 1.1, rise: 3.1, lidOpen: 1.95 }); // seconds; lidOpen is the lid's angle (radians) when wide open
const FLAGS = Object.freeze({ noMerge: true, noCast: true, noContactShadow: true });
const SPARKS = 36;
const smooth = (k) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }; // a fixed pattern, not a random stream

const paintGeo = (THREE, geo, hex) => {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex); const n = g.attributes.position.count; const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
const flagged = (m) => { m.castShadow = false; m.receiveShadow = false; Object.assign(m.userData, FLAGS); return m; };

// The lid: a half cylinder along the chest's width, hinged on its back edge (the group's origin), so rotating the group about x lifts the front.
export function lidGeometry(THREE) {
  const dome = new THREE.CylinderGeometry(0.28, 0.28, 0.9, 8, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, 0, 0.28);
  return paintGeo(THREE, dome, 0x6a4224);
}
// A tiny crown of pearls, about 0.3 m wide: a gold ring and nine pearls, one merged mesh.
export function crownGeometry(THREE) {
  const parts = [paintGeo(THREE, new THREE.TorusGeometry(0.13, 0.018, 4, 14).rotateX(Math.PI / 2), 0xe6b43c)];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const r = k === 0 ? 0.045 : 0.032;
    parts.push(paintGeo(THREE, new THREE.SphereGeometry(r, 6, 4).translate(Math.sin(a) * 0.13, 0.04 + (k % 2 ? 0 : 0.035), Math.cos(a) * 0.13), k === 0 ? 0xfffaf4 : 0xf6ecee));
  }
  return THREE.mergeGeometries(parts);
}

export function createReefChestLife({ scene, THREE, progression = null, log = null, audio = null, say = null, reducedMotion = false }) {
  const { x, z } = CHEST_AT;
  const y0 = reefY(x, z);
  const owned = () => !!progression?.state?.unlocked?.accessories?.includes(CROWN_ID);
  let opened = owned(); // the chest is open on this walk (and every later one)
  let showT = -1; // seconds into the show, -1 when none is running
  let given = false;

  const hinge = new THREE.Group();
  hinge.name = 'reef:chest-lid';
  const lidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  hinge.add(flagged(new THREE.Mesh(lidGeometry(THREE), lidMat)));
  // the chest's local frame: yaw CHEST_YAW, the hinge on the back edge, at the box's top
  const frame = new THREE.Group();
  frame.name = 'reef:chest-frame';
  frame.position.set(x, y0, z);
  frame.rotation.y = CHEST_AT.yaw;
  hinge.position.set(0, 0.42, -0.28);
  frame.add(hinge);

  // the warm light spilling out of the open chest, a flat glow inside the lid
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  const glow = flagged(new THREE.Mesh(new THREE.CircleGeometry(0.34, 10).rotateX(-Math.PI / 2), glowMat));
  glow.name = 'reef:chest-glow';
  glow.position.set(0, 0.43, 0);
  frame.add(glow);

  const crownMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.1, emissive: 0x6a5a30, transparent: true, opacity: 1 });
  const crown = flagged(new THREE.Mesh(crownGeometry(THREE), crownMat));
  crown.name = 'reef:chest-crown';
  crown.visible = false;
  frame.add(crown);

  // the burst: gold and pink sparkles and pale bubbles, one Points object, flung out by a fixed pattern and fading
  const pos = new Float32Array(SPARKS * 3);
  const col = new Float32Array(SPARKS * 3);
  const dir = [];
  const palette = [new THREE.Color(0xffd36e), new THREE.Color(0xff8fb4), new THREE.Color(0xfffaf0), new THREE.Color(0x8fe6ff)];
  for (let i = 0; i < SPARKS; i++) {
    const a = hash(i) * Math.PI * 2;
    const sp = 0.5 + hash(i + 50) * 0.9;
    dir.push({ vx: Math.cos(a) * sp * 0.6, vz: Math.sin(a) * sp * 0.6, vy: 0.8 + hash(i + 90) * 1.3 });
    const c = palette[i % 4];
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const sparkMat = new THREE.PointsMaterial({ size: 0.1, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: true });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.name = 'reef:chest-sparks';
  sparks.frustumCulled = false;
  Object.assign(sparks.userData, FLAGS);
  sparks.visible = false;
  frame.add(sparks);
  scene.add(frame);

  const lidAngle = (k) => -SHOW.lidOpen * smooth(k);
  const setLid = (k) => { hinge.rotation.x = lidAngle(k); };
  setLid(opened ? 1 : 0);
  glowMat.opacity = opened ? 0.18 : 0;
  glow.visible = opened;

  function grant() {
    if (given) return;
    given = true;
    const st = progression?.state;
    if (st?.unlocked?.accessories && !st.unlocked.accessories.includes(CROWN_ID)) st.unlocked.accessories.push(CROWN_ID);
    let worn = false;
    if (st?.equipped && st.equipped.head == null) { st.equipped.head = CROWN_ID; worn = true; }
    progression?.addPoints?.(0); // the save's own "persist now"
    const line = phrase('reef.chest.open');
    if (log) log.awardOnce('reefchest', 'reef-treasure-chest', line); // the paws, once ever, with the line as the toast
    else say?.(line);
    if (worn) say?.(phrase('reef.chest.on'));
    audio?.chime?.();
  }

  const near = (p) => !!p && Math.hypot(p.x - x, p.z - z) < CHEST_REACH;
  let nearNow = false;
  function paintShow(k) {
    // lid
    setLid(reducedMotion ? 1 : k / SHOW.lid);
    // glow inside: rises with the lid, settles to a soft level
    const gl = smooth((k - 0.3) / 0.6);
    glow.visible = gl > 0.01;
    glowMat.opacity = 0.18 + 0.4 * gl * (k < SHOW.rise ? 1 : Math.max(0, 1 - (k - SHOW.rise) * 2));
    // burst
    const b = k - SHOW.burst;
    if (!reducedMotion && b > 0 && b < 2.2) {
      sparks.visible = true;
      for (let i = 0; i < SPARKS; i++) {
        const d = dir[i];
        const bubble = i % 4 === 3;
        pos[i * 3] = d.vx * b;
        pos[i * 3 + 1] = 0.45 + d.vy * b * (bubble ? 0.7 : 1) - (bubble ? 0 : 0.9 * b * b);
        pos[i * 3 + 2] = d.vz * b;
      }
      sparkGeo.attributes.position.needsUpdate = true;
      sparkMat.opacity = Math.min(1, b * 4) * Math.max(0, 1 - b / 2.2);
    } else { sparks.visible = false; sparkMat.opacity = 0; }
    // the crown: up out of the chest, turning, then gone
    const cr = (k - SHOW.lid) / (SHOW.rise - SHOW.lid);
    crown.visible = cr > 0 && cr < 1.15;
    if (crown.visible) {
      const up = smooth(cr / 0.7);
      crown.position.set(0, 0.5 + 0.75 * up, 0);
      crown.rotation.y = reducedMotion ? 0 : cr * 9;
      const s = 1.1 + 1.1 * up;
      crown.scale.setScalar(s);
      crownMat.opacity = Math.min(1, cr * 5) * (cr > 0.85 ? Math.max(0, 1 - (cr - 0.85) / 0.3) : 1);
    }
  }

  return {
    get state() { return { opened, showing: showT >= 0, given }; },
    meshes: [frame],
    promptAt(catPos) {
      nearNow = !opened && showT < 0 && near(catPos);
      return nearNow ? phrase('reef.chest.prompt') : null;
    },
    interact() {
      if (!nearNow || opened || showT >= 0) return null;
      nearNow = false;
      showT = 0;
      audio?.chime?.();
      return null;
    },
    update(dt) {
      if (showT < 0) return;
      showT += dt > 0 ? dt : 0;
      if (showT >= SHOW.give) grant();
      if (showT >= SHOW.rise + 0.4) {
        showT = -1; opened = true;
        crown.visible = false; sparks.visible = false;
        setLid(1); glow.visible = true; glowMat.opacity = 0.18;
        return;
      }
      paintShow(showT);
    },
    dispose() {
      scene.remove(frame);
      hinge.children[0].geometry.dispose(); lidMat.dispose();
      glow.geometry.dispose(); glowMat.dispose();
      crown.geometry.dispose(); crownMat.dispose();
      sparkGeo.dispose(); sparkMat.dispose();
    },
  };
}
