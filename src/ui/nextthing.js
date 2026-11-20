// The home screen's "next thing" line (guided-first-walk design, section 6,
// .claude/plans/guided-first-walk-design.md, 2026-11-15): one line, always
// exactly one, in a soft band just above Start. The first rule that is true
// wins. Pure: a function of the save (and the few things the home screen
// knows that the save does not), plus its one line of HTML. The words are in
// tutorialwords.js (home.<id>); names of places, things to wear and ranks come
// from the game's own tables, so the series switch changes them in one place.
import { CATALOG, rankFor } from '../progression.js';
import { isClanEdition, areaInEdition, placeName, accessoryName, effectiveArea } from '../edition.js';
import { isClanId } from '../clanhomes.js';
import { clanMomentDue } from './clanpicker.js';
import { tamingProgress, denResidents, TAME_FEEDS } from '../colony.js';
import { line } from '../tutorialwords.js';
import { escapeHtml } from '../escapehtml.js';

// How close "nearly enough" is (rule 10), and how many visits a thing to wear
// is pointed at before the line moves on (rule 8).
export const NEARLY_POINTS = 15;
export const TOLD_VISITS = 3;

const own = (obj, k) => !!obj && typeof obj === 'object' && Object.hasOwn(obj, k);
const count = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
// A place's name inside a sentence: "the Woods", not "The Woods".
const inSentence = (name) => String(name).replace(/^The /, 'the ');

// nextThing(state, ctx) -> { rule, id, pic, text, action, place?, thing? }
//   rule    1..12, the design's number
//   id      the tutorialwords id
//   text    the sentence, PLAIN TEXT (it can carry a cat's name)
//   action  what a tap does: 'present' | 'start' | 'pick' | 'place' |
//           'dressup' | 'den' | null (plain text, not a button)
//   place   the area a 'place' tap makes today's walk
//   thing   the accessory id rule 8 points at (the caller counts the visit)
// ctx:
//   catalog          CATALOG (a parameter so a test can hand in a small one)
//   present          a present is waiting to be opened (the visit greeting)
//   toldNow          the thing rule 8 already pointed at on THIS visit
//   denVisitedToday  she has been to the den today (this device's note)
//   guideName        the guide cat's name, for a guided walk left half done
//   now              epoch ms, for the colony's rules
export function nextThing(state, { catalog = CATALOG, present = false, toldNow = null, denVisitedToday = false, guideName = null, now = Date.now() } = {}) {
  const s = state && typeof state === 'object' ? state : {};
  const edition = s.edition;
  const areas = catalog.areas;
  const walks = s.walks && typeof s.walks === 'object' ? s.walks : {};
  const owned = Array.isArray(s.unlocked?.areas) ? s.unlocked.areas : [];
  const points = count(s.points);
  const say = (rule, id, pic, slots, action = null, extra = {}) => ({ rule, id, pic, text: line(id, slots), action, ...extra });
  const nameOf = (areaId) => inSentence(placeName(areaId, edition, catalog) || areaId);

  // 1. A present is waiting to be opened.
  if (present) return say(1, 'home.present', '🎁', {}, 'present');

  // 2. No walk has ever been finished.
  if (!Object.values(walks).some((n) => count(n) > 0)) return say(2, 'home.first', '🐾', {}, 'start');

  // 3. The guided walk was left half done.
  if (s.tutorial?.first === 'part') {
    return typeof guideName === 'string' && guideName
      ? say(3, 'home.part', '🐾', { name: guideName }, 'start')
      : say(3, 'home.part-friend', '🐾', {}, 'start');
  }

  // 4 to 6 are the home group's; Legacy Edition has none, so they never fire.
  if (isClanEdition(s)) {
    // 4. The pick is ready and not made.
    if (clanMomentDue(s, catalog)) return say(4, 'home.pick', '🏡', {}, 'pick');
    const home = isClanId(s.clanPick?.mine) && own(areas, s.clanPick.mine) ? s.clanPick.mine : null;
    if (home) {
      const gate = (id) => {
        const req = areas[id].requires;
        return !req || count(walks[req.area]) >= req.walks;
      };
      const open = (id) => owned.includes(id) || (gate(id) && points >= count(areas[id].price));
      // 5. Her land is open and she has never walked there.
      if (open(home)) {
        if (count(walks[home]) === 0) return say(5, 'home.camp', '🏡', { place: nameOf(home) }, 'place', { place: home });
      } else {
        // 6. Her land is still locked: the nearest open land on the way.
        let via = areas[home].requires?.area;
        for (let i = 0; i < 8 && own(areas, via) && !open(via) && areas[via].requires; i++) via = areas[via].requires.area;
        if (own(areas, via) && open(via)) return say(6, 'home.way', '🧭', { place: nameOf(via) }, 'place', { place: via });
      }
    }
  }

  // 7. A new place opens after one more walk here. A free one first.
  const here = own(areas, s.area) ? effectiveArea({ area: s.area, edition }, catalog) : null;
  const soon = Object.keys(areas).filter((id) => {
    const a = areas[id];
    return !owned.includes(id) && areaInEdition(a, edition) && !!a.requires && a.requires.area === here
      && count(walks[here]) === a.requires.walks - 1;
  }).sort((a, b) => (count(areas[a].price) > 0) - (count(areas[b].price) > 0));
  // Two places that both cost coins are a choice, so the line names both
  // (the Park opens the Farm and the Docks, once the Fairground is hers). A
  // free place opens by itself and is named alone, as it always was.
  // Three that all cost coins are named all three (the Park opens the Farm,
  // the Fairground and the Docks), in the catalog's order. The Docks then
  // open the Seaside alone.
  if (soon.length >= 3 && soon.slice(0, 3).every((id) => count(areas[id].price) > 0)) {
    return say(7, 'home.opens-three', '🗺️', { place: nameOf(soon[0]), place2: nameOf(soon[1]), place3: nameOf(soon[2]) });
  }
  if (soon.length >= 2 && count(areas[soon[0]].price) > 0 && count(areas[soon[1]].price) > 0) {
    return say(7, 'home.opens-two', '🗺️', { place: nameOf(soon[0]), place2: nameOf(soon[1]) });
  }
  if (soon.length) return say(7, 'home.opens', '🗺️', { place: nameOf(soon[0]) });

  // Things to wear she does not own and could buy, cheapest first (the
  // catalog's order breaks a tie). A visit prize is won, never bought.
  const wearables = Object.keys(catalog.accessories)
    .filter((id) => !catalog.accessories[id].prize && !(Array.isArray(s.unlocked?.accessories) && s.unlocked.accessories.includes(id)))
    .map((id) => ({ id, price: count(catalog.accessories[id].price), name: accessoryName(catalog.accessories[id], edition) }))
    .sort((a, b) => a.price - b.price);

  // 8. She can pay for one, and has not been told about it on 3 visits already.
  const can = wearables.find((w) => w.price <= points);
  if (can) {
    const told = s.tutorial?.told;
    const toldEnough = told?.thing === can.id && count(told.visits) >= TOLD_VISITS && toldNow !== can.id;
    if (!toldEnough) return say(8, 'home.wear', '👗', { thing: can.name }, 'dressup', { thing: can.id });
  }

  // 9. A cat has been fed 1 to 5 times: the fullest bar first.
  const colony = s.colony && typeof s.colony === 'object' && Array.isArray(s.colony.feeds) && Array.isArray(s.colony.cats) ? s.colony : null;
  if (colony) {
    const members = colony.id !== null && colony.partner !== null ? 2 : 1;
    let best = null;
    for (const name of [...new Set(colony.feeds.map((f) => f.cat))].sort()) {
      const p = tamingProgress(colony, name, { members, now });
      if (p.tamed || p.have < 1 || p.have >= TAME_FEEDS) continue;
      if (!best || p.have > best.have) best = { name, have: p.have };
    }
    if (best) {
      // That cat's place, when it is one she can walk today.
      const cat = colony.cats.find((c) => c && c.name === best.name);
      const at = cat && own(areas, cat.area) && owned.includes(cat.area) && areaInEdition(areas[cat.area], edition) ? cat.area : null;
      return say(9, 'home.feed', '🐟', { name: best.name, n: best.have }, at ? 'place' : null, at ? { place: at } : {});
    }
  }

  // 10. She is 15 points or fewer short of something to wear.
  const nearly = wearables.find((w) => w.price > points && w.price - points <= NEARLY_POINTS);
  if (nearly) return say(10, 'home.nearly', '🐾', { n: nearly.price - points, thing: nearly.name });

  // 11. A cat lives in the den and has not been visited today.
  if (colony && !denVisitedToday) {
    const residents = denResidents(colony);
    if (residents.length) return say(11, 'home.den', '🏠', { name: residents[0].cat.name }, 'den');
  }

  // 12. Anything else: the next rank. (At the last rank there is none.)
  const lifetime = count(s.lifetimePoints);
  const next = rankFor(lifetime).next;
  if (next) return say(12, 'home.rank', '🏆', { n: next.at - lifetime, rank: next.title });
  return say(12, 'home.top', '🐾', {});
}

// The line's HTML: a button (at least 44 px tall, style.css) when a tap leads
// somewhere, plain text when it does not. The sentence is escaped: it can
// carry a cat's name. The band is a polite live region.
export const NEXT_ATTR = 'data-next';
export function nextThingHtml(thing) {
  if (!thing || !thing.text) return '';
  const inner = `<span class="hb-next-pic" aria-hidden="true">${escapeHtml(thing.pic || '')}</span>`
    + `<span class="hb-next-text">${escapeHtml(thing.text)}</span>`;
  const body = thing.action
    ? `<button type="button" id="hb-next" class="hb-next-line" ${NEXT_ATTR}="${escapeHtml(thing.action)}"`
      + `${thing.place ? ` data-next-place="${escapeHtml(thing.place)}"` : ''}>${inner}<span class="hb-next-go" aria-hidden="true">›</span></button>`
    : `<p id="hb-next" class="hb-next-line">${inner}</p>`;
  return `<div class="hb-next" data-next-rule="${Number(thing.rule) || 0}" aria-live="polite">${body}</div>`;
}
