// Stage "launch" of the Moon (see moonstages.js).
import { ST } from './moonstages.js';
import { drawLaunchStanding, drawLaunchWing } from './moonlaunchparts.js';
import { drawBeams, drawLane } from './moonjumpparts.js';
import { drawRifts, drawRingPosts } from './moonboundparts.js';
import { createLaunchLive } from './moonlaunchlive.js';
import { createJumpLive } from './moonjumplive.js';
import { createBoundLive } from './moonboundlive.js';


Object.assign(ST, { drawLaunchStanding, drawLaunchWing, drawBeams, drawLane, drawRifts, drawRingPosts, createLaunchLive, createJumpLive, createBoundLive });

const D = (a) => (a * Math.PI) / 180;

// The Launch Complex (pad at 42, -34): the tank yard, the Launch Desk's apron, the mound.
export const LAUNCH_ROWS = Object.freeze([
  ['tank', 52.2, -33, 0, 0], ['tank', 51.6, -43, 0, 0], ['crate', 52, -30, 0.3, 0], ['crate', 51.2, -29.2, 1.1, 2], ['pod', 40, -45.5, 0, 0], ['pod', 44.4, -46.2, 0.2, 1],
  ['solar', 50, -47, D(-20), 0], ['solar', 47, -48, D(-10), 0], ['antenna', 36, -46, 0, 0], ['dish', 32.5, -33, D(220), 0], ['rack', 31.6, -25.2, D(150), 0],
  ['lamp', 33.4, -30.6, 0, 0], ['lamp', 36.6, -24.4, 0, 0], ['lamp', 47.4, -25.6, 0, 0], ['sign', 29.4, -31.2, D(200), 0], ['beacon', 53.2, -38, 0, 0], ['flag', 36, -27, 0, 1],
  ['crate', 28, -24.6, 0.5, 1], ['wreck', 20, -30, 2.2, 1], ['lamp', 21.4, -34.4, 0, 0], ['sign', 29.4, -44, D(10), 1],
  ['trail', 28.4, -27.2, 33, -30.5], ['trail', 33, -30.5, 36.4, -32.3], ['trail', 27, -29, 24, -35], ['trail', 40, -27, 36.5, -29], ['trail', 26, -37, 30, -37.6],
  ['cable', 36, -28.4, 36, -26.4], ['cable', 47.2, -40.6, 51, -42], ['cable', 52.4, -34.4, 52.4, -37.4],
]);
ST.decorRows = { ...ST.decorRows, launch: LAUNCH_ROWS };
