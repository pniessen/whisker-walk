// Stage "snowvillec" of Snowville (see snowvillestages.js): the snowmobile (round four). Its plan, its drawing (the ring, the marks, the garage and the bench in the merged buckets) and its live (the
// machine, the hop-on, the ride, the second seat, the helmet find). The slot was reserved empty in V1; it is filled here, so a chunk that has not loaded still answers null.
import { ST } from './snowvillestages.js';
import { mobileColliders } from './snowvillemobileplan.js';
import { drawMobile } from './snowvillemobileparts.js';
import { createMobileLive } from './snowvillemobilelive.js';

Object.assign(ST, {
  c: Object.freeze({
    colliders: mobileColliders,
    draw: (kit, M) => drawMobile(kit, M),
    mobile: createMobileLive, // the machine on a walk (round four)
  }),
});
