import * as THREE from 'three';
import { bus } from './events.js';
import { litMaterial } from './render/materials.js';

const mat = (color) => litMaterial(color);
const box = (w, h, d, color) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));

const CHASEABLE = new Set(['bird', 'squirrel', 'butterfly', 'seagull', 'crab', 'duck', 'firefly']);
// grounded skittish critters that participate in stalk-and-pounce tag
// (bird included per spec even though it flies once fleeing — see markStalked/pounceCatch)
const STALKABLE = new Set(['squirrel', 'bird', 'mouse']);

function buildCritter(type) {
  const g = new THREE.Group();
  if (type === 'bird' || type === 'seagull') {
    const s = type === 'seagull' ? 1.6 : 1;
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.09 * s, 6, 6), mat(type === 'seagull' ? 0xf0f0f0 : 0x8a5a3a));
    body.position.y = 0.09 * s;
    g.add(body);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03 * s, 0.08 * s, 4), mat(0xf2a04e));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.1 * s, -0.1 * s);
    g.add(beak);
  } else if (type === 'squirrel' || type === 'mouse') {
    const s = type === 'mouse' ? 0.5 : 1;
    const furColor = type === 'mouse' ? 0x8a8a92 : 0xa06a3a;
    const tailColor = type === 'mouse' ? 0x8a8a92 : 0xb87a4a;
    const body = box(0.12 * s, 0.12 * s, 0.22 * s, furColor);
    body.position.y = 0.1 * s;
    g.add(body);
    const tailS = new THREE.Mesh(new THREE.SphereGeometry(0.09 * s, 5, 5), mat(tailColor));
    tailS.position.set(0, 0.2 * s, 0.16 * s);
    g.add(tailS);
  } else if (type === 'butterfly' || type === 'firefly') {
    const color = type === 'firefly' ? 0xf2e04e : 0xe070b0;
    for (const side of [-1, 1]) {
      const wing = box(0.08, 0.01, 0.06, color);
      wing.position.x = side * 0.05;
      g.add(wing);
    }
    if (type === 'firefly') {
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.04, 5, 5),
        litMaterial(0xf2e04e, { emissive: 0xb8a820 }));
      g.add(glow);
    }
  } else if (type === 'duck') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), mat(0x6a9a4a));
    body.position.y = 0.1;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), mat(0x3a7a3a));
    head.position.set(0, 0.28, -0.1);
    g.add(head);
  } else if (type === 'crab') {
    const body = box(0.2, 0.08, 0.14, 0xe06848);
    body.position.y = 0.06;
    g.add(body);
    for (const side of [-1, 1]) {
      const claw = box(0.06, 0.05, 0.08, 0xe06848);
      claw.position.set(side * 0.14, 0.08, -0.06);
      g.add(claw);
    }
  } else if (type === 'dog') {
    const body = box(0.3, 0.28, 0.6, 0xc8a060);
    body.position.y = 0.3;
    g.add(body);
    const head = box(0.22, 0.2, 0.22, 0xc8a060);
    head.position.set(0, 0.55, -0.32);
    g.add(head);
  } else if (type === 'villager') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.1, 8), mat(0x6a8ac0));
    body.position.y = 0.55;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), mat(0xe8c8a8));
    head.position.y = 1.3;
    g.add(head);
    const arm = box(0.08, 0.5, 0.08, 0x6a8ac0);
    arm.geometry.translate(0, 0.25, 0);
    arm.position.set(0.3, 0.9, 0);
    arm.rotation.z = 0.4;
    g.add(arm);
    g.userData.arm = arm;
  }
  return g;
}

let nextId = 1;

export function createCritters(scene, spawns, opts = {}) {
  const fleeScale = opts.fleeScale ?? 1;
  let fleeModifier = 1;
  let clock = 0; // tracks critters.update's own `t` so pounceCatch can time the 20s catch cooldown without a caller-supplied clock
  const list = [];

  function spawn(def) {
    const group = buildCritter(def.type);
    group.position.set(def.x, def.type === 'butterfly' || def.type === 'firefly' ? 1 : 0, def.z);
    scene.add(group);
    const c = {
      id: `${def.type}-${nextId++}`,
      type: def.type,
      def,
      group,
      spottable: true,
      fleeing: false,
      phase: Math.random() * Math.PI * 2,
      cooldown: 0,
      waved: false,
      meowWaveT: 0,
    };
    list.push(c);
    return c;
  }

  for (const def of spawns) spawn(def);
  if (opts.spawnFireflies) {
    for (let i = 0; i < 8; i++) {
      spawn({ type: 'firefly', x: (Math.random() - 0.5) * 60, z: (Math.random() - 0.5) * 60 });
    }
  }
  if (opts.trailButterflies) {
    for (let i = 0; i < 2; i++) {
      const c = spawn({ type: 'butterfly', x: 0, z: 0 });
      c.trail = true; // butterfly wander centers on the cat (see update)
    }
  }

  function remove(c) {
    scene.remove(c.group);
    list.splice(list.indexOf(c), 1);
  }

  const api = {
    list,
    nearest(pos, maxDist) {
      let best = null;
      let bestD = maxDist;
      for (const c of list) {
        if (!CHASEABLE.has(c.type) || c.fleeing) continue;
        const d = c.group.position.distanceTo(pos);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      return best;
    },
    catchAt(pos) {
      for (const c of list) {
        if ((c.type === 'butterfly' || c.type === 'firefly') &&
            c.group.position.distanceTo(pos) < 0.8) {
          remove(c);
          return c;
        }
      }
      return null;
    },
    playMoment(moment) {
      const runner = spawn({ type: 'squirrel', x: moment.from.x, z: moment.from.z });
      runner.moment = { target: new THREE.Vector3(moment.x, 0, moment.z), t: 0 };
    },
    dismayNear(pos, range) {
      for (const c of list) {
        if (c.type === 'villager' && c.group.position.distanceTo(pos) < range) c.meowWaveT = 1.5;
      }
    },
    reactToMeow(pos) {
      for (const c of list) {
        if (c.type === 'villager' && c.group.position.distanceTo(pos) < 6) c.meowWaveT = 1.5;
        if ((c.type === 'bird' || c.type === 'seagull') && !c.fleeing &&
            c.group.position.distanceTo(pos) < 5) {
          c.fleeing = true;
          c.cooldown = 18;
        }
      }
    },
    dispose() {
      for (const c of [...list]) remove(c);
    },
    setFleeModifier(m) {
      fleeModifier = m;
    },
    markStalked(catPos, isStalking) {
      for (const c of list) {
        if (!STALKABLE.has(c.type)) continue;
        const d = c.group.position.distanceTo(catPos);
        if (isStalking && d < 3) c.stalkClose = true;
        else if (!isStalking && d > 6) c.stalkClose = false;
      }
    },
    // tag, not hunting-hunting: no critter is ever removed here — the catch just
    // marks it caught (uncatchable for 20s) and sends it fleeing fast.
    pounceCatch(pos) {
      let best = null;
      let bestD = 0.9;
      for (const c of list) {
        if (!STALKABLE.has(c.type)) continue;
        if (c.caughtUntil && c.caughtUntil > clock) continue;
        const d = c.group.position.distanceTo(pos);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (!best) return null;
      const wasStalked = !!best.stalkClose;
      best.caughtUntil = clock + 20;
      best.fleeing = true;
      best.cooldown = best.type === 'bird' ? 18 : 3;
      best.stalkClose = false;
      return { type: best.type, wasStalked };
    },
    update(dt, t, playerPos, catPos) {
      clock = t;
      for (const c of [...list]) {
        const p = c.group.position;
        const dPlayer = p.distanceTo(playerPos);
        const dCat = p.distanceTo(catPos);
        const threat = Math.min(dPlayer, dCat);

        if (c.moment) {
          // scripted dash: out 3s, back 3s, then despawn
          c.moment.t += dt;
          const target = c.moment.t < 3 ? c.moment.target
            : new THREE.Vector3(c.def.x, 0, c.def.z);
          const dir = target.clone().sub(p).setY(0);
          if (dir.length() > 0.2) p.addScaledVector(dir.normalize(), dt * 5);
          if (c.moment.t > 6) remove(c);
          continue;
        }

        if (c.type === 'bird' || c.type === 'seagull') {
          if (c.fleeing) {
            p.y += dt * 6;
            p.x += Math.sin(c.phase) * dt * 4;
            p.z += Math.cos(c.phase) * dt * 4;
            c.cooldown -= dt;
            if (c.cooldown <= 0) {
              p.set(c.def.x, 0, c.def.z);
              c.fleeing = false;
            }
          } else {
            p.y = Math.abs(Math.sin(t * 3 + c.phase)) * 0.08; // hop
            if (threat < 2.5 * fleeScale * fleeModifier * (c.type === 'seagull' ? 1.4 : 1)) {
              c.fleeing = true;
              c.cooldown = 18;
            }
          }
        } else if (c.type === 'squirrel' || c.type === 'mouse') {
          if (c.fleeing) {
            // pounce-tagged: dash away from the cat for a few seconds, then resume patrol
            const away = p.clone().sub(catPos).setY(0);
            if (away.lengthSq() < 1e-4) away.set(1, 0, 0);
            away.normalize();
            const fleeSpeed = c.type === 'mouse' ? 6.5 : 4.5;
            p.addScaledVector(away, dt * fleeSpeed);
            c.cooldown -= dt;
            if (c.cooldown <= 0) c.fleeing = false;
          } else {
            const a = new THREE.Vector3(c.def.x, 0, c.def.z);
            const bPt = new THREE.Vector3(c.def.x2 ?? c.def.x + 6, 0, c.def.z2 ?? c.def.z);
            const k = (Math.sin(t * 0.6 + c.phase) + 1) / 2;
            p.lerpVectors(a, bPt, k);
          }
        } else if (c.type === 'butterfly' || c.type === 'firefly') {
          const cx = c.trail ? catPos.x : c.def.x;
          const cz = c.trail ? catPos.z : c.def.z;
          p.x = cx + Math.sin(t * 0.8 + c.phase) * 1.5;
          p.z = cz + Math.cos(t * 0.6 + c.phase) * 1.5;
          p.y = 0.8 + Math.sin(t * 2 + c.phase) * 0.3;
        } else if (c.type === 'duck') {
          const r = 2;
          p.x = c.def.x + Math.cos(t * 0.3 + c.phase) * r;
          p.z = c.def.z + Math.sin(t * 0.3 + c.phase) * r;
          c.group.rotation.y = -(t * 0.3 + c.phase);
        } else if (c.type === 'crab') {
          p.x = c.def.x + Math.sin(t * 1.5 + c.phase) * 1.2;
        } else if (c.type === 'dog') {
          c.cooldown -= dt;
          if (dCat < 8 && c.cooldown <= 0) {
            c.cooldown = 12;
            bus.emit('critter:scare', { x: p.x, z: p.z });
          }
          c.group.rotation.y = Math.atan2(catPos.x - p.x, catPos.z - p.z);
        } else if (c.type === 'villager') {
          const arm = c.group.userData.arm;
          if (c.meowWaveT > 0) c.meowWaveT -= dt;
          if (dPlayer < 5 || c.meowWaveT > 0) {
            arm.rotation.z = 2.6 + Math.sin(t * 6) * 0.3; // wave
            if (!c.waved && dPlayer < 5) {
              c.waved = true;
              bus.emit('villager:wave', { id: c.id });
            }
          } else {
            arm.rotation.z = 0.4;
            if (dPlayer > 8) c.waved = false;
          }
        }
      }
    },
  };
  return api;
}
