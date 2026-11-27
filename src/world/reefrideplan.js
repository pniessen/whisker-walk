// =============================================================================
// THE REEF RIDES: THE PLAN (milestone R12). Pure data, no THREE, no clock, no random number. Where the two racks stand (open sand east of the hatch beside
// the Sunken Boat, 3 m clear of every solid, find, pocket, mouse and scenic spot, and well off the Sealab's footprint), how near she must be to hop on,
// and the rectangles a mount may never enter (the Sealab's footprint; the galleon's when its stage names one). The sim itself is reefride.js (R11).
// =============================================================================

import { LAB_FOOT } from './reeflabplan.js';

// x, z: the rack's middle; yaw: the way a mount faces on it (the walk's heading: forward is (sin yaw, cos yaw)); reach: m from the mount's middle at which
// the button offers "hop on" (a little more than the mount's own radius); park: the parked mount's collider radius (a cat walks round it).
export const RACKS = Object.freeze({
  scooter: Object.freeze({ id: 'scooter', seatId: 'reef-scooter', page: 'rfscooter', x: -25, z: -37, yaw: Math.PI, reach: 2.2, park: 0.8 }),
  saucer: Object.freeze({ id: 'saucer', seatId: 'reef-saucer', page: 'rfsaucer', x: -21.5, z: -36.5, yaw: Math.PI, reach: 2.9, park: 1.5 }),
});
export const RACK_IDS = Object.freeze(Object.keys(RACKS));

// A rectangle a mount may not enter: the Sealab's footprint (the building plus its apron), and the galleon's (a later stage hands its own in).
export const rideKeepOut = (extra = []) => [{ minX: LAB_FOOT.minX, maxX: LAB_FOOT.maxX, minZ: LAB_FOOT.minZ, maxZ: LAB_FOOT.maxZ }, ...extra.map((k) => ({ ...k }))];

// The solids a rack's base adds to the world today: none (a low platform a cat steps over); the parked mounts are the live's own colliders.
export const rackColliders = () => [];
export const seatOf = (id) => RACKS[id]?.seatId ?? null;
// How high a parked mount rests over the seabed (its middle): the scooter hovers a hand above the platform, the saucer on its three legs.
export const REST = Object.freeze({ scooter: 0.55, saucer: 0.95 });
