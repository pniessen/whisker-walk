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
// bucket's curated landing spot. Once.
//
// Nothing per frame allocates: the watch is an index loop over the session's
// own lists, and the apples write into their one InstancedMesh.
// =============================================================================
import { setMarketDusk } from './market.js';
import { MARKET_REGISTRATION, marketArea } from './marketplan.js';
import { applePaths, createApples, createPetals } from './marketfruit.js';

export const MARKET_BUCKET_ID = 'market-bucket-1';
const CRATE_KIND = 'applecrate';
// The apples roll once the crate is nearly over: its tip animation (0.5 s,
// tippables.js) has this much left. Both screens play the same anim.
const ROLL_AT = 0.25;
// The paths are walked on the plan's own square, never the live record: the
// walk adds this device's own colliders to it (scratch posts, gate frames,
// rests, a birthday cake), which differ between screens (walk.js).
const PLAN_AREA = marketArea();

function findBy(list, key, value) {
  if (!list) return null;
  for (let i = 0; i < list.length; i++) if (list[i][key] === value) return list[i];
  return null;
}

// createMarketLife(area, ctx) -> { update(dt, t, catPos, camera, session), dispose() }.
// `area` is the built record (its look and its anchors.apples).
export function createMarketLife(area, ctx = {}) {
  setMarketDusk(area, ctx.dusk ? 1 : 0);
  const scene = ctx.scene ?? null;
  const reducedMotion = ctx.reducedMotion ?? false;
  const crateAt = area?.anchors?.apples ?? null;
  const bucketRow = MARKET_REGISTRATION.propSet.knockables.find((k) => k.id === MARKET_BUCKET_ID);
  let petals = scene && bucketRow ? createPetals(scene, bucketRow.fallTo) : null;
  let apples = null;
  let crate = null;
  let bucket = null;
  let shown = false;
  let disposed = false;

  return {
    update(dt, t, catPos = null, camera = null, session = null) {
      if (disposed) return;
      if (!apples && scene && crateAt) {
        crate ??= findBy(session?.tippables?.list, 'kind', CRATE_KIND);
        if (crate?.tipped && crate.anim <= ROLL_AT) {
          apples = createApples(scene, applePaths(PLAN_AREA, crateAt, crate.group.rotation.y), { reducedMotion });
          apples.start();
        }
      }
      apples?.update(dt);
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
      apples?.dispose();
      petals?.dispose();
      apples = null;
      petals = null;
    },
  };
}
