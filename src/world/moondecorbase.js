// The base's decor rows (props, cables, footprints) and the decor drawing, brought with the rover stage (moonstagerover.js imports this file): see moondecor.js.
import { ST } from './moonstages.js';
import { drawDecor } from './moondecorparts.js';

const D = (a) => (a * Math.PI) / 180;

// The base: the landing site, the dome, the airlock, the Old Dish, the quiet side.
export const BASE_ROWS = Object.freeze([
  // landing site (east and north of the lander, off Pip's bed, the poles and the flag)
  ['crate', 10.2, 39.4, 0.2, 0], ['crate', 11.3, 40.4, 0.9, 1], ['crate', 10.6, 41.4, 0.1, 2], ['pod', 12.2, 43.6, 1.57, 0], ['tank', 9.8, 36, 0, 0],
  ['sign', 8.4, 35, D(200), 0], ['lamp', 12.8, 40, 0, 0], ['beacon', 4.6, 48, 0, 0], ['antenna', -9.6, 37, 0, 0], ['flag', -8, 35, 0, 1],
  ['lamp', -3, 47, 0, 0], ['crate', 5.6, 47.8, 0.4, 1], ['rack', 8.6, 47, D(180), 0],
  // the lander's wake: a wrecked probe and an old lander out on the dust
  ['wreck', 15.5, 47, 0.6, 0], ['wreck', -26, 38.5, 2.4, 1], ['antenna', -24.2, 41.5, 0, 0],
  // solar fields, north and south of the airlock and by the dome
  ['solar', -24, 33.5, 0, 0], ['solar', -20.5, 34, 0.1, 0], ['solar', -27, 17.5, D(10), 0], ['solar', -23.5, 17.2, D(5), 0], ['solar', -44, 28, D(90), 0],
  ['lamp', -23.4, 22, 0, 0], ['lamp', -23.4, 30, 0, 0], ['lamp', -34, 15, 0, 0], ['lamp', -45, 21, 0, 0],
  ['pod', -22.5, 36.5, 0, 1], ['crate', -29, 15.6, 0.6, 0], ['crate', -30.2, 15.1, 0.2, 2], ['tank', -20.5, 20.5, 0, 0], ['sign', -18, 28, D(90), 1],
  ['dish', -39, 38, D(150), 0], ['antenna', -42, 36, 0, 0], ['garden', -44.5, 41.5, 0, 0],
  // the Old Dish's yard
  ['rack', -46, 18.5, D(90), 0], ['tank', -47, 15.5, 0, 0], ['crate', -46.6, 11, 0.5, 1], ['antenna', -48, 9.5, 0, 0], ['sign', -43.5, 18.5, D(250), 0],
  ['beacon', -40.6, 11, 0, 0], ['flag', -45.2, 9.4, 0, 0],
  // paths: footprints between the buildings, and the cable runs
  ['trail', 2, 36.5, -4, 33], ['trail', -4, 33, -13, 30.5], ['trail', -13, 30.5, -19.4, 27.5],
  ['trail', 7.8, 40.5, 17, 37.5], ['trail', -19.4, 24.5, -28, 19], ['trail', -30, 18, -39.5, 13.5],
  ['cable', -34, 17.4, -41.5, 17], ['cable', -41.5, 17, -44.6, 17.2], ['cable', 8.6, 38, 10, 34.5],
  ['cable', -24.5, 31.4, -24.6, 24.4], ['cable', -26.3, 17.6, -26.3, 23.6],
]);

ST.decorRows = { ...ST.decorRows, base: BASE_ROWS };
ST.drawDecor = drawDecor;
