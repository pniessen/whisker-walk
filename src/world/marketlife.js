// =============================================================================
// THE MARKET'S LIFE (Market step 3). The square's area life (areaData.life):
// walk.js makes it once per walk with its context ({ scene, dusk,
// reducedMotion, ... }), main.js calls update(dt, t, catPos, camera, session)
// every frame, endWalk calls dispose(). Part of the Market chunk.
//
// THE LOOK. It sets the square's dusk once, as the old look hook did
// (setMarketDusk: the lanterns lit and the stalls packed up on a dusk walk).
//
// THE APPLES (V1, world/marketfruit.js). Each frame, until it has happened, it
// looks for the fruit stall's crate (the tippable of kind 'applecrate') in
// session.tippables.list turning `tipped`, by her paw (tip) or her partner's
// (tipById, the `tip` net event): both screens see the same entry go over.
// Once it is nearly over (ROLL_AT) it makes the six apples once, on paths
// over the plan's square (PLAN_AREA) from the crate's spot and the tipped crate's yaw (its group.rotation.y, which tippables.js derives from
// the spot, so it is the same on both screens), and rolls them on walk
// seconds.
//
// THE PETALS (V2). It watches session.knockables for the flower stall's
// bucket (MARKET_BUCKET_ID) to land (down, its fall played out), on either
// screen, and then shows the petals, made at the start, hidden, round the
// bucket's curated landing spot. Once. The bucket holds a bunch of blooms
// (marketfruit.js createBucketBlooms), put in the knockable's own group the
// first frame it sees it, so they fall with it.
//
// THE STREET MUSICIAN (V7, world/marketfolk.js). When the walk hands it the
// people factory (ctx.people, the pack's createPeopleKit), it stands one
// person at the plan's pitch (MUSICIAN), built through the one figure
// function the stallholders use, bowing a fiddle on the walk's seconds. They
// never move. No factory (the picture pages, the plain tests): nobody. Each
// frame they are near or far detail by her distance (ctx.lodNear, the live
// rung's near distance, comes with the factory; the figure's switch).
//
// THE SOUNDS (V9, world/marketsound.js). When the walk hands it the game's
// audio (ctx.audio), the tune by the musician, the pigeons' coos (the walk's
// pigeons, ctx.critters' birds that read as pigeons; their patch,
// PIGEON_PATCH, without critters), the chatter by the four treat stalls; the
// bicycle's bell (below). All silent, the context never asked for, while the
// game is muted.
//
// THE SIX FINDS (V6, world/marketfinds.js findAt). Every frame it fills one
// spot from her paws (catPos), the session (rest, perched, the cat's heading),
// her paws' own speed over the frame (a perch snap or a respawn not counted:
// the walk's session holds no player, so this is the speed), how long she has stood
// still, a pigeon taking off near her this frame, and the apple crate going
// over this frame, and asks findAt which of the six she is at. A find not yet
// seen this walk is noted on her save (noteMarketFind: the first time ever
// pays AWARDS.marketfind and says its line; every walk counts once on its
// page, by the discovery log's key, so a walk picked up again counts nothing
// twice).
//   * Without a log or a progression (the picture pages) nothing is noted;
//     the moments still play.
//   * In a room each device runs its own walk, so each player is noted on her
//     own save, once. The crate's going over is the tippable's `tipped`, the
//     same on both screens (her paw or her partner's, the `tip` event).
//   * STILL is the Rooftops' (roofsmoments.js): her paws within STILL_EPS of
//     where she came to rest; a step further starts it again. It also starts
//     again when a rest (a drink, a nap) ends, so standing on at the fountain
//     after a drink is not listening to the musician 2 m off.
//   * A PIGEON TAKES OFF when one of the walk's pigeons turns `fleeing`
//     (critters.js: she came within its reach, or a meow); the nearest that
//     did this frame is the spot's pigeonFlush.
//
// THE BICYCLE (V8). When she lands in its basket (session.perched on the
// basket's perch), the bicycle (area.bicycle, its own group) rocks on its
// stand, ±BASKET_ROCK.amp about its own length, dying away over
// BASKET_ROCK.secs, and its bell rings twice (sound.bell()). Every landing,
// not only the first. Under reduced motion it is held still, and still rings.
// When her partner lands in it (a remote's cat at the basket, up at its
// height: remotecats.js entry.h), it rocks the same, and the bell rings as
// loud as she is near (loudness(d, BELL.ear)), or not at all out of earshot.
// Nothing is sent: each screen sees each cat land.
//
// Nothing per frame allocates: the watches are index loops over the session's
// own lists and the life's own arrays, the spot is one object filled in place,
// and the apples write into their one InstancedMesh.
// =============================================================================
import { setMarketDusk } from './market.js';
import { MARKET_REGISTRATION, marketArea, MUSICIAN, PIGEON_PATCH, TREAT_STALLS, stallById } from './marketplan.js';
import { applePaths, createApples, createPetals, createBucketBlooms, rollPaths, createRollers, WOOL, WOOL_COLOURS, MARKET_WOOL_SALT } from './marketfruit.js';
import { inWatchZone } from '../marketrules.js';
import { createMusician } from './marketfolk.js';
import { createMarketSound, BELL } from './marketsound.js';
import { loudness } from './roofssound.js';
import { findAt, noteMarketFind, MARKET_FIND_ANCHORS } from './marketfinds.js';
import { createErrands } from './marketerrandlive.js';

export const MARKET_BUCKET_ID = 'market-bucket-1';
const CRATE_KIND = 'applecrate';
const BASKET_KIND = 'yarnbasket';
// The apples roll once the crate is nearly over: its tip animation (0.5 s,
// tippables.js) has this much left. Both screens play the same anim.
const ROLL_AT = 0.25;
// The paths are walked on the plan's own square, never the live record: the
// walk adds this device's own colliders to it (scratch posts, gate frames,
// rests, a birthday cake), which differ between screens (walk.js).
const PLAN_AREA = marketArea();
// The wool rolls only across calm cobbles: out of every treat stall's watch zone (a metre of margin
// round it, in its own frame) and off each hide's dash to its treat, so a ball never lands where a stallholder looks
const DASH_CLEAR = 0.6;
function woolAvoid(x, z) {
  for (const id of TREAT_STALLS) {
    const s = stallById(id);
    if (inWatchZone(s, x, z, false)) return true;
    const ax = s.hide.x, az = s.hide.z, bx = s.treat.x, bz = s.treat.z;
    const L2 = (bx - ax) ** 2 + (bz - az) ** 2;
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / L2));
    if (Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t)) < DASH_CLEAR) return true;
  }
  return false;
}
// still: her paws within this of where she came to rest (roofsmoments.js's)
export const STILL_EPS = 0.05; // m
// a step over this speed is a perch snap or a respawn, not her running
const SNAP_SPEED = 12; // m/s
// the bicycle's rock when a cat lands in its basket: ±amp rad about its own
// length, `hz` times a second, dying away to still over `secs`
export const BASKET_ROCK = Object.freeze({ amp: (2 * Math.PI) / 180, secs: 1.5, hz: 1.6 });
// a partner is in the basket: her cat within `near` m of it, drawn at least
// its height less `below` up (remotecats.js entry.h)
const PARTNER_IN = Object.freeze({ near: 0.15, below: 0.2 });
const BASKET = MARKET_FIND_ANCHORS.basket;

function findBy(list, key, value) {
  if (!list) return null;
  for (let i = 0; i < list.length; i++) if (list[i][key] === value) return list[i];
  return null;
}

// createMarketLife(area, ctx) -> { update(dt, t, catPos, camera, session), dispose(), musician, sound }.
// `area` is the built record (its look and its anchors.apples). `musician`
// and `sound` are marketfolk.js's and marketsound.js's, or null without a
// people factory or an audio.
export function createMarketLife(area, ctx = {}) {
  setMarketDusk(area, ctx.dusk ? 1 : 0);
  const scene = ctx.scene ?? null;
  const reducedMotion = ctx.reducedMotion ?? false;
  const crateAt = area?.anchors?.apples ?? null;
  const bucketRow = MARKET_REGISTRATION.propSet.knockables.find((k) => k.id === MARKET_BUCKET_ID);
  let petals = scene && bucketRow ? createPetals(scene, bucketRow.fallTo) : null;
  let blooms = scene && bucketRow ? createBucketBlooms() : null;
  let bloomsIn = false;
  let apples = null;
  let crate = null;
  let wool = null;
  let basketEntry = null;
  let bucket = null;
  let shown = false;
  let disposed = false;
  const people = typeof ctx.people === 'function' ? ctx.people : null;
  let musician = scene && people
    ? createMusician(scene, MUSICIAN, { people, lodNear: ctx.lodNear, reducedMotion, y: ctx.ground?.y?.(MUSICIAN.x, MUSICIAN.z) })
    : null;
  // the walk's pigeons (critters.js): birds whose spawn reads as a pigeon
  const pigeons = (ctx.critters?.list ?? []).filter((c) => c?.type === 'bird' && c.def?.labelAs === 'pigeon');
  const pigeonWas = pigeons.map((c) => !!c.fleeing);
  let sound = ctx.audio
    ? createMarketSound(ctx.audio, { pigeons: pigeons.length ? pigeons : [PIGEON_PATCH], musician: MUSICIAN, stalls: TREAT_STALLS.map((id) => stallById(id).at) })
    : null;

  // finding
  const log = ctx.log ?? null;
  const progression = ctx.progression ?? null;
  const found = new Set(); // this walk's
  const spot = { x: 0, y: 0, z: 0, speed: 0, still: 0, perched: null, rest: null, pigeonFlush: null, crateTipped: false, yaw: null };
  const flush = { x: 0, z: 0 };
  const restAt = { x: 0, y: 0, z: 0, set: false };
  let restWas = false;
  const last = { x: 0, z: 0, set: false, speed: 0 };
  let crateWas = null; // the crate's `tipped` last frame, once it is found

  // the six missions (marketerrandlive.js): only on a walk with a scene
  const errands = scene ? createErrands({ scene, ground: ctx.ground, log, progression, reducedMotion }) : null;

  // the bicycle
  const bicycle = area?.bicycle ?? null;
  const rockFrom = bicycle ? bicycle.rotation.x : 0;
  let rockT = -1; // seconds into a rock, or -1
  let inBasket = false;
  const partnersIn = new Set(); // remotes' entries in the basket now (a partner who left is dropped)
  let listNow = null; // the remotes' list this frame, for dropGone
  const dropGone = (e) => { if (!listNow || !listNow.includes(e)) partnersIn.delete(e); };

  function stillness(dt, p, resting) {
    const moved = !restAt.set || Math.hypot(p.x - restAt.x, p.y - restAt.y, p.z - restAt.z) >= STILL_EPS;
    if (moved || (restWas && !resting)) {
      restAt.x = p.x;
      restAt.y = p.y;
      restAt.z = p.z;
      restAt.set = true;
      spot.still = 0;
    } else {
      spot.still += dt;
    }
    restWas = resting;
  }

  // her speed: her paws' over the frame (a snap keeps the last)
  function speedOf(dt, p) {
    if (last.set && dt > 0) {
      const v = Math.hypot(p.x - last.x, p.z - last.z) / dt;
      if (v <= SNAP_SPEED) last.speed = v;
    }
    last.x = p.x;
    last.z = p.z;
    last.set = true;
    return last.speed;
  }

  // the nearest pigeon that took off this frame, within 3 m or not (findAt judges)
  function pigeonsUp(p) {
    let best = Infinity;
    for (let i = 0; i < pigeons.length; i++) {
      const c = pigeons[i];
      const now = !!c.fleeing;
      if (now && !pigeonWas[i] && p) {
        const q = c.group.position;
        const d = Math.hypot(q.x - p.x, q.z - p.z);
        if (d < best) {
          best = d;
          flush.x = q.x;
          flush.z = q.z;
        }
      }
      pigeonWas[i] = now;
    }
    return best < Infinity ? flush : null;
  }

  function rock() {
    if (!bicycle || reducedMotion) return;
    rockT = 0;
  }

  function rocking(dt) {
    if (rockT < 0 || !bicycle) return;
    rockT += dt;
    if (rockT >= BASKET_ROCK.secs) {
      rockT = -1;
      bicycle.rotation.x = rockFrom;
      return;
    }
    const k = 1 - rockT / BASKET_ROCK.secs;
    bicycle.rotation.x = rockFrom + BASKET_ROCK.amp * k * Math.sin(2 * Math.PI * BASKET_ROCK.hz * rockT);
  }

  const atBasket = (p) => !!p && Math.hypot(p.x - BASKET.x, p.z - BASKET.z) <= 0.05;

  // her landing, and her partners'
  function basket(catPos, session) {
    const now = atBasket(session?.perched);
    if (now && !inBasket) {
      rock();
      sound?.bell(1);
    }
    inBasket = now;
    const list = session?.remotes?.list;
    listNow = Array.isArray(list) ? list : null;
    if (partnersIn.size) partnersIn.forEach(dropGone); // gone from the room: no longer in it
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const q = e?.group?.position;
      const isIn = !!q && Math.hypot(q.x - BASKET.x, q.z - BASKET.z) <= PARTNER_IN.near && (e.h ?? 0) >= BASKET.y - PARTNER_IN.below;
      if (isIn && !partnersIn.has(e)) {
        partnersIn.add(e);
        rock();
        if (catPos) sound?.bell(loudness(Math.hypot(catPos.x - BASKET.x, catPos.z - BASKET.z), BELL.ear));
      } else if (!isIn && partnersIn.has(e)) partnersIn.delete(e);
    }
  }

  return {
    get musician() { return musician; },
    get sound() { return sound; },
    update(dt, t, catPos = null, camera = null, session = null) {
      if (disposed) return;
      musician?.update(t);
      if (musician && catPos) musician.detail(Math.hypot(catPos.x - MUSICIAN.x, catPos.z - MUSICIAN.z));
      sound?.update(dt, catPos, t);
      crate ??= findBy(session?.tippables?.list, 'kind', CRATE_KIND);
      const tippedNow = !!crate?.tipped;
      const wentOver = crateWas !== null && tippedNow && !crateWas;
      if (crate) crateWas = tippedNow;
      const up = pigeonsUp(catPos);
      basket(catPos, session);
      rocking(dt);
      if (catPos) errands?.update(dt, t, catPos, session);
      if (catPos) {
        const resting = !!session?.rest;
        stillness(dt, catPos, resting);
        spot.x = catPos.x;
        spot.y = catPos.y;
        spot.z = catPos.z;
        spot.speed = speedOf(dt, catPos);
        spot.perched = session?.perched ?? null;
        spot.rest = session?.rest ?? null;
        spot.yaw = session?.cat?.rotation?.y ?? null;
        spot.pigeonFlush = up;
        spot.crateTipped = wentOver;
        const here = findAt(MARKET_FIND_ANCHORS, spot);
        if (here && !found.has(here)) {
          found.add(here);
          if (log && progression) noteMarketFind(here, { log, progression });
        }
      }
      if (!apples && scene && crateAt) {
        if (crate?.tipped && crate.anim <= ROLL_AT) {
          apples = createApples(scene, applePaths(PLAN_AREA, crateAt, crate.group.rotation.y), { reducedMotion });
          apples.start();
        }
      }
      apples?.update(dt);
      // the yarn basket: the wool rolls once it is nearly over, the same on both screens
      basketEntry ??= findBy(session?.tippables?.list, 'kind', BASKET_KIND);
      if (!wool && scene && basketEntry?.tipped && basketEntry.anim <= ROLL_AT) {
        const at = basketEntry.group.position;
        wool = createRollers(scene, rollPaths(PLAN_AREA, at, basketEntry.group.rotation.y, WOOL, MARKET_WOOL_SALT, woolAvoid), {
          reducedMotion, spec: WOOL, salt: MARKET_WOOL_SALT, colours: WOOL_COLOURS, name: 'marketWool',
        });
        wool.start();
      }
      wool?.update(dt);
      if (blooms && !bloomsIn) {
        bucket ??= findBy(session?.knockables?.list, 'id', MARKET_BUCKET_ID);
        if (bucket?.group) {
          bucket.group.add(blooms.mesh);
          bloomsIn = true;
        }
      }
      if (petals && !shown) {
        bucket ??= findBy(session?.knockables?.list, 'id', MARKET_BUCKET_ID);
        if (bucket?.down && bucket.anim <= 0) {
          petals.show();
          shown = true;
        }
      }
    },
    dispose() {
      disposed = true;
      found.clear();
      partnersIn.clear();
      if (bicycle) bicycle.rotation.x = rockFrom;
      apples?.dispose();
      wool?.dispose();
      petals?.dispose();
      blooms?.dispose();
      musician?.dispose();
      sound?.dispose();
      errands?.dispose();
      apples = null;
      wool = null;
      petals = null;
      blooms = null;
      musician = null;
      sound = null;
    },
  };
}
