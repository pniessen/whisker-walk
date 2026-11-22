// ww-private-family-file
// Milestone 0's stand-in plan: one bare room on one level, so the private build has something to
// build through the house engine's plan argument before the real plan (milestone 1) exists. It holds
// no layout facts about anything real. The room id is a token the exclusion test looks for.
import { FAMILY_SENTINEL } from './sentinel.js';

export const PLACEHOLDER_ROOM_ID = 'ww-family-room-0';

const freeze = Object.freeze;
export const FAMILY_PLACEHOLDER_PLAN = freeze({
  id: 'family',
  name: FAMILY_SENTINEL,
  levels: freeze([freeze({ id: 'ground', y: 0 })]),
  rooms: freeze([freeze({ id: PLACEHOLDER_ROOM_ID, level: 'ground', minX: -4, maxX: 4, minZ: -4, maxZ: 4 })]),
  stairs: freeze([]),
  doorways: freeze([]),
  windows: freeze([]),
  bounds: freeze({ minX: -12, maxX: 12, minZ: -12, maxZ: 12 }),
  frontDoor: freeze({ x: 0, z: 4, faces: 'south', arrive: freeze({ x: 0, z: 1, yaw: 0 }) }),
  start: 'ground',
});
