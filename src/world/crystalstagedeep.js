// Stage "crystaldeep" of the Crystal Cave (see crystalstages.js): the second story, the Echo Deep. C0 reserved the slot; C2 fills the hall shell (crystaldeepplan.js,
// crystaldeepparts.js, crystaldeeplive.js): ST.deep = { colliders(), perches(), life(ctx) }. crystal.js reads those once; C3 and C4 add promptAt, interact and credit
// by spreading ST.deep into a new frozen object (the prompt arbiter reads those through the slot). Everything is behind ?deep=1 (crystalDeepOn): off, the slot answers
// null and empty lists and the rim rocks and pebbles are not cleared, so the cave is exactly what it was.
import { ST } from './crystalstages.js';
import { CRYSTAL_CLEARS } from './crystalplan.js';
import { crystalDeepOn } from '../crystalflag.js';
import { DEEP_CLEARS, deepColliders, deepPerches } from './crystaldeepplan.js';
import { createDeepLife } from './crystaldeeplive.js';
import { withLiving, LIVING_SLOT } from './crystaldeeptinklive.js'; // C4: the creature of the story (prompt, interact, credit, goalFor)

if (crystalDeepOn()) for (const c of DEEP_CLEARS) if (!CRYSTAL_CLEARS.includes(c)) CRYSTAL_CLEARS.push(c);

let current = null; // the live of this walk
function track(live) { const end = live.dispose; current = live; live.dispose = () => { if (current === live) current = null; end(); }; return live; }

Object.assign(ST, {
  deep: Object.freeze({
    colliders: () => (crystalDeepOn() ? deepColliders() : []),
    perches: () => (crystalDeepOn() ? deepPerches() : []),
    life: (ctx) => (crystalDeepOn() ? withLiving(ctx, track(createDeepLife(ctx))) : null),
    goalFor: LIVING_SLOT.goalFor,
  }),
});
// C3 (the wall and prisms) and C4 (the creature): the prompt, the action button and a partner step reach both lives made for this walk. Both prompts are asked every frame so each keeps its own target; the wall answers first.
Object.assign(ST, { deep: Object.freeze({ ...ST.deep,
  promptAt: (p) => { const w = current?.promptAt(p) ?? null; const t = LIVING_SLOT.promptAt(p); return w ?? t; },
  interact: () => current?.interact() ?? LIVING_SLOT.interact(),
  credit: (ev) => current?.credit(ev) ?? LIVING_SLOT.credit(ev) }) });
