// THE SERIES-WORDS SNAPSHOT ("switch 0": pin today's game).
//
// A switch is planned that swaps the words this game takes from a book series
// (group names, rank words, composed cat names, a few place and outside-cat
// words) for plain ones in a public version, while the family's version
// ("on") stays exactly as it is today. Before any of that work, this test
// records every such string today's game can show, by calling the game's own
// functions and UI builders, and compares it with a committed fixture:
//
//   test/fixtures/series-words-on.json        this file: tables, names, tags,
//                                             lines and screens, for Clan
//                                             Edition, then a smaller Legacy
//                                             Edition section
//   test/fixtures/series-words-on-play.json   serieswords.play.test.js
//   test/fixtures/series-words-on-home.json   serieswords.home.test.js
//   test/fixtures/series-words-on-world.json  serieswords.world.test.js
//   test/fixtures/series-words-on-source.json serieswords.source.test.js
//
// A failure lists each string that moved as "path: expected X, received Y".
//
// RE-RECORDING. The fixtures are the family's game. Re-record them ONLY when
// the owner or the older playtester has asked for a wording change in the
// "on" game, never to make a refactor pass:
//
//   UPDATE_SERIES_SNAPSHOT=1 npx vitest run test/serieswords
//
// then read the fixture's diff line by line before committing it.
//
// Not here on purpose: the guided first walk's own words (src/tutorialwords.js,
// src/hints.js, src/game/tips.js, the home screen's "next thing" line). They
// are written in neutral words and are still being built.
import { describe, it, expect } from 'vitest';
import {
  PREFIXES, CAT_PREFIXES, RIVAL_PREFIXES, WARRIOR_SUFFIXES, RANK_SUFFIX, CLAN_SUFFIX, RANK_KEYS, RANK_WORDS,
  OUTSIDE_WORDS, PLACE_WORDS, HOME_LINES,
} from '../src/clanwords.js';
import { CAT_NAMES, KIT_NAMES, LEGENDARY_NAMES, KITTYPET_NAMES, isKittypetName } from '../src/straynames.js';
import { prefixFor, warriorSuffixFor, clanRankFor, colonyRankFor, clanNameOf, clanTitleFor, candidateStarNames } from '../src/clannames.js';
import { HOMES, TRUCE_AREAS, clanName, pickableClans, patrolClanFor, ownClanTitle, alliesName, homeWelcome } from '../src/clanhomes.js';
import { rivalFor } from '../src/rivalclans.js';
import { CAST_RANKS, CAST_CORE, RAIDER_SLOTS, ROAM_SLOTS, clanCast, castFor, borderWarriorFor, clanHomeFor, tagOptsFor } from '../src/clancast.js';
import { roleFor, kitsFor } from '../src/clanroles.js';
import { editionTitle, gameTitle, placeName, accessoryName, rivalForWalk, isClanEdition } from '../src/edition.js';
import { TERRITORIES, ISLAND, opensAfterLine, territoryMapModel } from '../src/territories.js';
import { outsideTag, emptyColony, TAME_FEEDS } from '../src/colony.js';
import { collarFor, wanderArrivalLine, wanderStayLine, kittypetTamedLine } from '../src/housecats.js';
import { contestToast } from '../src/markcontest.js';
import { visitAt, INTRUDER_PERIOD, isHostile } from '../src/intruders.js';
import { makeNameTag } from '../src/nametag.js';
import { CATALOG, createProgression, sanitizeClan } from '../src/progression.js';
import { FIGHT_MOVES, unlockToast, teachFor } from '../src/fightmoves.js';
import { CLUES } from '../src/fight.js';
import { BORDER_ASK, borderWords } from '../src/game/borderfight.js';
import { postsFor } from '../src/borderposts.js';
import { targetName, postStatus, promptFor, crossCardHtml, crossExtras, crossingOutcome } from '../src/bordercross.js';
import { discoveryText } from '../src/ui/hud.js';
import { renderJournalHtml } from '../src/journal.js';
import { styleFor, prizeVisit, VISIT_PRIZES } from '../src/visits.js';
import { celebrationHtml } from '../src/ui/visitcelebration.js';
import { FIGHT_TEACH, FIGHT_READ, FIGHT_LINES, renderChallengeHtml, renderFightHtml } from '../src/ui/fightui.js';
import { renderFightMovesHtml, renderStarNamePicker } from '../src/ui/hometabs.js';
import {
  CAMP_SOON_LINE, clanPickerModel, renderClanPickerHtml, renderClanMomentHtml, clanLineHtml, clanMomentDue,
} from '../src/ui/clanpicker.js';
import { renderColonyHtml } from '../src/ui/colonypanel.js';
import { ISLAND_WHERE, renderTerritoryMapHtml } from '../src/ui/territorymap.js';
import { buildDressingModel, placeWhyLine, renderPlacesSheetHtml } from '../src/ui/dressingroom.js';
import { PHRASES } from '../src/chat.js';
import { PERSONALITY_KEYS, replyFor } from '../src/catreplies.js';
import { PHRASE_IDS, phrase } from '../src/clanphrases.js';
import { checkAgainstFixture, htmlText, sorted, uniq, sortKeys, seriesFilter } from './helpers/serieswords.js';

const FIXTURE = 'series-words-on.json';

const CLANS = Object.keys(HOMES);
const OLD_AREAS = Object.keys(RIVAL_PREFIXES);
const AREAS = Object.keys(CATALOG.areas);
const STORED = [...CAT_NAMES, ...KIT_NAMES, ...LEGENDARY_NAMES];
const ME = 'player-me-000001';
const PARTNER = 'player-sib-00002';
const PARTNER_NAME = 'Robin';
// Three ordinary strays and one town cat, by name, for the cases that need a few.
const [A, B, C] = CAT_NAMES.filter((n) => !isKittypetName(n));
const PET = KITTYPET_NAMES[0];

// ---- saves ------------------------------------------------------------------

function memStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

// A real default save, then only the fields a case is about.
function save({ edition = 'canon', mine = null, partner = null, area = 'neighborhood', open = false, title = null, points = 0 } = {}) {
  const s = JSON.parse(JSON.stringify(createProgression(memStorage()).state));
  s.edition = edition;
  s.area = area;
  s.points = points;
  if (open) {
    s.unlocked.areas = [...AREAS];
    for (const id of AREAS) s.walks[id] = 3;
  }
  if (partner) s.colony.partner = { playerId: PARTNER, petName: PARTNER_NAME, wardrobe: [] };
  s.clanPick = { mine, partner, partnerId: partner ? PARTNER : null };
  if (title) s.clan = { name: title, adopted: false };
  return s;
}

const cat = (name, extra = {}) => ({ name, finder: ME, area: 'neighborhood', x: 1, z: 2, wear: null, tamedBy: null, tamedWalk: null, ...extra });
const feeds = (name, by, n, head = 0) => Array.from({ length: n }, (_, i) => ({ cat: name, by, walk: `walk-${1000 + i}`, head }));
const colonyOf = ({ cats = [], feedList = [], partner = false } = {}) => ({
  ...emptyColony(), id: partner ? 'col-1' : null,
  partner: partner ? { playerId: PARTNER, petName: PARTNER_NAME, wardrobe: [] } : null,
  cats, feeds: feedList,
});
const panel = (colony, over = {}) => renderColonyHtml({
  colony, me: ME, members: colony.partner ? 2 : 1, now: 0, status: { mode: colony.partner ? 'paired' : 'local' },
  owned: ['bell', 'warpaint'], catalog: CATALOG, edition: 'canon', ...over,
});
// The lead of each card on the Colony tab: "<name> | <rank words>".
const cardLeads = (html) => html.split('class="card colony-card').slice(1).map((c) => {
  const t = htmlText(`<div class="card colony-card${c}`);
  return `${t[0]} | ${t[1]}`;
});

// ---- the name tag, with a canvas that draws nothing -------------------------

function withCanvas(fn) {
  const prev = globalThis.document;
  globalThis.document = {
    createElement: () => {
      const ctx = new Proxy({ font: '' }, {
        get: (t, k) => (k in t ? t[k] : k === 'measureText' ? (s) => ({ width: String(s).length * 10 }) : () => {}),
        set: (t, k, v) => { t[k] = v; return true; },
      });
      return { width: 0, height: 0, getContext: () => ctx };
    },
  };
  try { return fn(); } finally {
    if (prev === undefined) delete globalThis.document; else globalThis.document = prev;
  }
}

// What the tag over a group cat's head says, as the tag code holds it: its
// name, its second line, and whether it is the one tag that goes on top.
function tagOf(member) {
  return withCanvas(() => {
    // 2026-11-16: the tag is built the way the game builds it (tagOptsFor: the
    // top tag is chosen by rank id, no longer by the word on the tag).
    const tag = makeNameTag(member.name, tagOptsFor(member));
    return { name: tag.userData.tagName, line: tag.userData.sub, top: tag.userData.top === true };
  });
}

// ---- Clan Edition -----------------------------------------------------------

function vocabulary() {
  // Every title a save's own group can carry before she picks a home: one per
  // name word, found through the game's own seed function.
  const titleBySeed = {};
  const seen = new Set();
  for (let i = 0; seen.size < PREFIXES.length && i < 5000; i++) {
    const seed = `player-${i}`;
    const title = clanTitleFor(seed);
    if (!seen.has(title)) { seen.add(title); titleBySeed[seed] = title; }
  }
  return {
    edition: { title: editionTitle('canon'), page: gameTitle('canon'), unknownEditionReadsAs: editionTitle('nonsense') },
    groupSuffix: CLAN_SUFFIX,
    groupNames: Object.fromEntries(CLANS.map((id) => [id, clanName(id)])),
    homeLines: { ...HOME_LINES },
    rivalGroupNames: Object.fromEntries(OLD_AREAS.map((id) => [id, rivalFor(id).name])),
    rankWords: { ...RANK_WORDS },
    rankEndings: { ...RANK_SUFFIX },
    grownEndings: [...WARRIOR_SUFFIXES],
    outsideWords: { ...OUTSIDE_WORDS },
    placeWords: { ...PLACE_WORDS },
    placeNames: Object.fromEntries(AREAS.map((id) => [id, placeName(id, 'canon', CATALOG)])),
    mapNames: { ...Object.fromEntries(TERRITORIES.map((t) => [t.id, t.name])), island: ISLAND.name, islandWhere: ISLAND_WHERE },
    ownGroupTitles: {
      all: sorted(seen),
      bySeed: titleBySeed,
      unusableSeed: [clanTitleFor(''), clanTitleFor(null)],
      // a saved title loads only if it is one of these (progression.sanitizeClan)
      savedTitleKept: sorted(seen).map((t) => sanitizeClan({ name: t, adopted: true }).name),
      savedTitleDropped: [clanName('woods'), 'MossBand', 'Moss'].map((t) => `${t} -> ${sanitizeClan({ name: t }).name}`),
    },
    prizeNames: Object.fromEntries(Object.keys(CATALOG.accessories)
      .filter((id) => CATALOG.accessories[id].legacyName || CATALOG.accessories[id].name.includes(CLAN_SUFFIX))
      .map((id) => [id, accessoryName(CATALOG.accessories[id], 'canon')])),
    fightMoves: Object.fromEntries(FIGHT_MOVES.map((m) => [m.id, {
      name: m.name, short: m.short, hint: m.hint, when: m.when, learned: unlockToast(m.id),
    }])),
    fightWords: {
      teach: FIGHT_TEACH, teachWithAllMoves: FIGHT_TEACH + teachFor(FIGHT_MOVES.map((m) => m.id)), read: FIGHT_READ,
      lines: { ...FIGHT_LINES }, clues: Object.fromEntries(Object.keys(CLUES).map((k) => [k, CLUES[k].text])),
      ask: 'is on your land!', borderAsk: { ...BORDER_ASK },
    },
  };
}

// name -> rung -> shown text, for every stored stray, kit and legendary name.
function storedNames() {
  const out = {};
  for (const name of STORED) {
    const kind = KIT_NAMES.includes(name) ? 'kit' : LEGENDARY_NAMES.includes(name) ? 'legendary' : 'stray';
    const ladder = {};
    for (let have = 0; have <= TAME_FEEDS; have++) {
      const p = { have, tamed: false };
      // the bar's own reading, then the Colony tab's (there a fed kit is never a kit: colonyRankFor)
      ladder[`fed ${have} of ${TAME_FEEDS}`] = `${clanNameOf(name, p)} (${RANK_WORDS[clanRankFor(p)]})`
        + ` | Colony tab: ${clanNameOf(name, p, colonyRankFor(name, p))} (${RANK_WORDS[colonyRankFor(name, p)]})`;
    }
    ladder.tamed = `${clanNameOf(name, { have: TAME_FEEDS, tamed: true })} (${RANK_WORDS[roleFor(name)]})`;
    const row = {
      kind,
      firstHalf: prefixFor(name),
      forms: {
        [RANK_KEYS.kit]: clanNameOf(name, null, RANK_KEYS.kit),
        [RANK_KEYS.apprentice]: clanNameOf(name, null, RANK_KEYS.apprentice),
        [RANK_KEYS.warrior]: clanNameOf(name, null, RANK_KEYS.warrior),
        [RANK_KEYS.leader]: clanNameOf(name, null, RANK_KEYS.leader),
      },
      grownEnding: warriorSuffixFor(name),
      ladder,
      denRole: RANK_WORDS[roleFor(name)],
      // what a walk's toast adds after the stored name, before she is in the colony
      whenMet: outsideTag(null, name, 'met'),
      whenCross: outsideTag(null, name, 'grudge', (w) => ` a ${w} now!`),
      inColony: outsideTag({ cats: [{ name }] }, name, 'met'),
    };
    if (isKittypetName(name)) {
      row.wandersIn = wanderArrivalLine(name);
      row.joins = kittypetTamedLine(name);
      row.collar = collarFor({ edition: 'canon', colony: { cats: [] } }, name);
    }
    if (roleFor(name) === RANK_KEYS.queen && CAT_NAMES.includes(name)) row.kits = kitsFor(name, 0);
    out[name] = row;
  }
  return out;
}

// All sixteen seats of each group's camp, with what the tag over each says.
function casts() {
  const out = {};
  for (const clan of CLANS) {
    out[clan] = clanCast(clan).map((m) => {
      const tag = tagOf(m);
      return {
        seat: m.slot, rank: m.rank, rankWord: RANK_WORDS[m.rank], name: m.name,
        tag: `${tag.name} / ${tag.line}`, tagOnTop: tag.top,
        shownOnLow: m.slot < CAST_CORE, roams: ROAM_SLOTS.includes(m.slot), raider: RAIDER_SLOTS.includes(m.slot),
      };
    });
  }
  return out;
}

const pickSets = () => {
  const out = [[]];
  for (const a of CLANS) out.push([a]);
  for (let i = 0; i < CLANS.length; i++) for (let j = i + 1; j < CLANS.length; j++) out.push([CLANS[i], CLANS[j]]);
  return out;
};
const pickKey = (p) => (p.length ? `picked ${p.join(' + ')}` : 'nobody picked');

// Whose patrol walks each area's camp border, for every pair of picks.
function rivals() {
  const out = {};
  for (const area of [...OLD_AREAS, ...CLANS, ...TRUCE_AREAS, 'den']) {
    const byName = {};
    for (const picks of pickSets()) {
      const r = rivalFor(area, picks);
      const name = r ? r.name : '(no patrol)';
      (byName[name] ??= []).push(pickKey(picks));
    }
    out[area] = byName;
  }
  return out;
}

// The cat on border patrol for each group (one of its three raiders).
function borderPatrols() {
  const out = {};
  for (const clan of CLANS) {
    const names = new Set();
    for (let key = 0; key < 200; key++) names.add(borderWarriorFor(clan, key).name);
    out[clan] = sorted(names);
  }
  return out;
}

// Who can cross each home territory, and the first visits of the clock.
function intruders() {
  const out = {};
  for (const area of CLANS) {
    const all = new Set();
    for (let k = 0; k < 600; k++) {
      const v = visitAt(area, k * INTRUDER_PERIOD);
      if (v) all.add(`${v.member.name} of ${clanName(v.clan)}`);
    }
    const first = [];
    for (let k = 0; k < 12; k++) {
      const v = visitAt(area, k * INTRUDER_PERIOD);
      first.push(v ? `${v.member.name} of ${clanName(v.clan)}` : '(nobody)');
    }
    out[area] = { canVisit: sorted(all), firstTwelveVisits: first };
  }
  return out;
}

function starNames() {
  const windows = {};
  const seen = new Set();
  for (let i = 0; seen.size < PREFIXES.length && i < 5000; i++) {
    const three = candidateStarNames(`player-${i}`);
    if (!seen.has(three[0])) { seen.add(three[0]); windows[`player-${i}`] = three; }
  }
  return {
    everyNameOffered: sorted(candidateStarNames(ME, PREFIXES.length)),
    offeredTo: windows,
    picker: htmlText(renderStarNamePicker(candidateStarNames(ME), '')),
    pickerWithOneChosen: htmlText(renderStarNamePicker(candidateStarNames(ME), candidateStarNames(ME)[1])),
  };
}

// The second line of a tag for every rank word and group, as tagSubFor
// composes it, and which of them the tag code puts on top.
function tagLines() {
  const out = {};
  for (const rank of Object.keys(RANK_WORDS)) {
    out[rank] = {};
    for (const clan of CLANS) {
      const tag = tagOf({ name: 'Name', rank, clan });
      out[rank][clan] = tag.top ? `${tag.line} (on top)` : tag.line;
    }
  }
  return out;
}

function outsideLines() {
  const stray = A;
  const pet = PET;
  const row = (name) => ({
    met: outsideTag(null, name, 'met'),
    cross: outsideTag(null, name, 'grudge', (w) => ` a ${w} now!`),
    house: outsideTag(null, name, 'house'),
    player: outsideTag(null, name, 'player'),
    unknownKey: outsideTag(null, name, 'nope'),
    inColony: outsideTag({ cats: [{ name }] }, name, 'met'),
  });
  return { [stray]: row(stray), [pet]: row(pet), notAName: outsideTag(null, 5, 'met') };
}

// Lines the game builds from a group name, a composed name or a place word.
function lines() {
  const groupNames = [...CLANS.map(clanName), ...OLD_AREAS.map((id) => rivalFor(id).name)];
  const fresh = save();
  const open = save({ open: true });
  const posts = {};
  for (const area of [...AREAS]) {
    for (const post of postsFor(area)) {
      const locked = postStatus(post, fresh, CATALOG, area);
      const go = postStatus(post, open, CATALOG, area);
      posts[post.id] = {
        to: targetName(post.to, 'canon', CATALOG),
        beforeItOpens: promptFor(locked).text,
        open: promptFor(go).text,
        openForAGuest: promptFor(go, { inRoom: true, isHost: false }).text,
        card: htmlText(crossCardHtml({ name: go.name })),
        after: crossingOutcome({ crossTo: post.to, clan: true, pickPlace: () => true, catalog: CATALOG, edition: 'canon' }).lines,
        afterLed: crossingOutcome({ crossTo: post.to, ledBy: PARTNER_NAME, together: [PARTNER_NAME], clan: true, pickPlace: () => false, catalog: CATALOG, edition: 'canon' }).lines,
      };
    }
  }
  const raiders = CLANS.flatMap((clan) => RAIDER_SLOTS.map((slot) => clanCast(clan)[slot]));
  const fights = {};
  for (const m of raiders) {
    const words = borderWords(m.clan);
    fights[m.name] = {
      atHome: htmlText(renderChallengeHtml({ name: m.name, clan: m.clan })),
      atTheirBorder: htmlText(renderChallengeHtml({ name: m.name, clan: m.clan, ...BORDER_ASK })),
      facedDown: discoveryText({ type: words.award(m.name).type, label: words.award(m.name).text }),
      letsYouPass: words.won(m.name),
      wonThisTime: [words.lost(m.name, true), words.lost(m.name, false)],
    };
  }
  const warpaint = CATALOG.accessories.warpaint;
  const visit = prizeVisit('warpaint');
  const index = VISIT_PRIZES.indexOf('warpaint');
  // the prize as progression.noteVisit hands it to the card: the catalog's name
  const milestone = (style, isNew = true) => ({ visit, index, style, prize: { id: 'warpaint', name: warpaint.name, slot: warpaint.slot, isNew } });
  return {
    homeWelcome: Object.fromEntries(CLANS.map((id) => [id, homeWelcome(id, save({ mine: id }))])),
    homeWelcomeElsewhere: homeWelcome('moor', save({ mine: 'woods' })),
    landOfTodaysWalk: Object.fromEntries(AREAS.map((id) => [id, buildDressingModel(save({ open: true, area: id }), CATALOG).currentPlace.line])),
    campOnTheMap: Object.fromEntries(CLANS.map((id) => [id, `${clanName(id)} camp`])),
    scentedOverYourMark: Object.fromEntries(groupNames.map((n) => [n, { scratch: contestToast(n, 'scratch'), dig: contestToast(n, 'dig'), drop: contestToast(n, 'drop') }])),
    wandererStays: Object.fromEntries(AREAS.map((id) => [id, wanderStayLine(PET, placeName(id, 'canon', CATALOG))])),
    opensAfter: Object.fromEntries(AREAS.filter((id) => CATALOG.areas[id].requires)
      .map((id) => [id, opensAfterLine(CATALOG.areas[id].requires, 1, 'canon', CATALOG)])),
    whyAPlaceIsShut: Object.fromEntries(AREAS.map((id) => [id, placeWhyLine(fresh, CATALOG, id)])),
    borderPosts: posts,
    crossingWithABuddy: crossExtras({ raceRunning: true, questActive: true, carried: 'feather', buddyName: clanCast('woods')[4].name, together: [PARTNER_NAME] }),
    fights,
    journalFooter: htmlText(renderJournalHtml({}, 0, 30, { chasedOff: 4 })).filter((t) => /chased/i.test(t)),
    warPaintPrize: {
      visit,
      styleInTheSchedule: styleFor(index),
      present: htmlText(celebrationHtml(milestone('A'), { petName: 'Mittens', stage: 'revealed' })),
      alreadyOn: htmlText(celebrationHtml(milestone('B'), { petName: 'Mittens' })),
      catGivesIt: htmlText(celebrationHtml(milestone('C'), { petName: 'Mittens', stage: 'revealed' })),
      again: htmlText(celebrationHtml(milestone('B', false), { petName: 'Mittens' })),
    },
  };
}

function screens() {
  const picker = (s) => clanPickerModel(s);
  const first = CLANS[0];
  const second = CLANS[1];
  const pick = {
    cards: htmlText(renderClanPickerHtml(picker(save()), PARTNER_NAME)),
    campSoonLine: CAMP_SOON_LINE,
    cardsWhenACampIsNotReady: htmlText(renderClanPickerHtml(clanPickerModel(save(), TERRITORIES, { ...HOMES, [first]: { ...HOMES[first], pickable: false } }), PARTNER_NAME)),
    cardsWhenATerritoryIsNotBuilt: htmlText(renderClanPickerHtml(clanPickerModel(save(), TERRITORIES.map((t) => (t.id === first ? { ...t, status: 'soon' } : t))), PARTNER_NAME)),
    moment: htmlText(renderClanMomentHtml(picker(save()), PARTNER_NAME)),
    momentIsDue: [clanMomentDue(save({ open: true }), CATALOG), clanMomentDue(save({ open: true, mine: first }), CATALOG)],
    lineBeforeAPick: htmlText(clanLineHtml(picker(save()), PARTNER_NAME, { canChoose: true })),
    lineBeforeTheWoodsOpen: htmlText(clanLineHtml(picker(save()), PARTNER_NAME, { canChoose: false })),
    picked: {},
    partnerOnly: htmlText(renderClanPickerHtml(picker(save({ partner: second })), PARTNER_NAME)),
    both: {
      cards: htmlText(renderClanPickerHtml(picker(save({ mine: first, partner: first })), PARTNER_NAME)),
      line: htmlText(clanLineHtml(picker(save({ mine: first, partner: first })), PARTNER_NAME)),
    },
  };
  for (const id of CLANS) {
    const other = CLANS[(CLANS.indexOf(id) + 1) % CLANS.length];
    const alone = picker(save({ mine: id }));
    const allied = picker(save({ mine: id, partner: other }));
    pick.picked[id] = {
      heading: htmlText(renderClanPickerHtml(alone, PARTNER_NAME))[0],
      change: htmlText(renderClanMomentHtml(alone, PARTNER_NAME)).slice(0, 3),
      line: htmlText(clanLineHtml(alone, PARTNER_NAME)),
      lineWithASibling: htmlText(clanLineHtml(allied, PARTNER_NAME)),
      cardsWithASibling: htmlText(renderClanPickerHtml(allied, PARTNER_NAME)),
    };
  }

  // The Colony tab: every stored cat at every point of the bar, then tamed.
  const colony = { leadByFeeds: {}, banner: {} };
  for (let have = 0; have <= TAME_FEEDS; have++) {
    const c = colonyOf({ cats: STORED.map((n) => cat(n)), feedList: STORED.flatMap((n) => feeds(n, ME, have)) });
    colony.leadByFeeds[`fed ${have}`] = sorted(cardLeads(panel(c)));
  }
  const tamedAll = colonyOf({
    cats: STORED.map((n, i) => cat(n, { tamedBy: ME, tamedWalk: `walk-${2000 + i}` })),
    feedList: STORED.flatMap((n) => feeds(n, ME, TAME_FEEDS)),
  });
  colony.leadTamed = sorted(cardLeads(panel(tamedAll)));
  const [a, b, c] = [A, B, C];
  const three = colonyOf({
    cats: [cat(a, { tamedBy: ME, tamedWalk: 'walk-2000' }), cat(b, { tamedBy: ME, tamedWalk: 'walk-2001' }), cat(c, { tamedBy: ME, tamedWalk: 'walk-2002' })],
    feedList: [a, b, c].flatMap((n) => feeds(n, ME, TAME_FEEDS)),
  });
  colony.heldRoles = {
    medicine: cardLeads(panel(three, { clanRoles: { [RANK_KEYS.medicine]: a, [RANK_KEYS.deputy]: null } })),
    deputy: cardLeads(panel(three, { clanRoles: { [RANK_KEYS.medicine]: null, [RANK_KEYS.deputy]: b } })),
    bothOnOneCat: cardLeads(panel(three, { clanRoles: { [RANK_KEYS.medicine]: c, [RANK_KEYS.deputy]: c } })),
    oneEach: cardLeads(panel(three, { clanRoles: { [RANK_KEYS.medicine]: a, [RANK_KEYS.deputy]: b } })),
  };
  for (const id of CLANS) {
    const other = CLANS[(CLANS.indexOf(id) + 1) % CLANS.length];
    const mine = save({ mine: id });
    const allied = save({ mine: id, partner: other });
    colony.banner[id] = {
      own: htmlText(panel(colonyOf(), { clanName: ownClanTitle(mine), alliesName: alliesName(mine) }))[0],
      withAllies: htmlText(panel(colonyOf({ partner: true }), { clanName: ownClanTitle(allied), alliesName: alliesName(allied) }))[0],
    };
  }
  const unpicked = save({ title: clanTitleFor(ME) });
  colony.banner.beforeAPick = htmlText(panel(colonyOf(), { clanName: ownClanTitle(unpicked), alliesName: alliesName(unpicked) }))[0];
  colony.banner.siblingsInOneGroup = alliesName(save({ mine: CLANS[0], partner: CLANS[0] }));
  // one whole tab, read top to bottom: a kit, an apprentice, a shy cat, a tamed
  // cat in a dress, one the partner found, and a town cat under its place word
  const shown = colonyOf({
    partner: true,
    cats: [
      cat(a), cat(b, { area: 'woods' }), cat(c, { finder: PARTNER, area: 'park' }),
      cat(PET, { tamedBy: ME, tamedWalk: 'walk-2000', wear: 'warpaint' }), cat(KIT_NAMES[0]),
    ],
    feedList: [...feeds(a, ME, 1), ...feeds(b, ME, 3, 2), ...feeds(c, PARTNER, 2), ...feeds(PET, ME, TAME_FEEDS), ...feeds(KIT_NAMES[0], ME, 1)],
  });
  const picked = save({ mine: CLANS[0], partner: CLANS[2] });
  colony.wholeTab = htmlText(panel(shown, { clanName: ownClanTitle(picked), alliesName: alliesName(picked), clanRoles: { [RANK_KEYS.medicine]: PET, [RANK_KEYS.deputy]: null } }));

  const fight = {
    sheetReading: htmlText(renderFightHtml({ phase: 'clue', clue: CLUES.pounce, wins: 1, losses: 0 })),
    sheetWithEveryMove: htmlText(renderFightHtml({ phase: 'idle', wins: 0, losses: 1, line: FIGHT_LINES.lost, specials: FIGHT_MOVES.map((m, i) => ({ id: m.id, name: m.name, used: i === 0 })) })),
    movesToLearn: htmlText(renderFightMovesHtml({ fightsWon: 2 }, { owned: [], canBuy: () => true })),
    movesLearned: htmlText(renderFightMovesHtml({ fightsWon: 25 }, { owned: FIGHT_MOVES.map((m) => m.id) })),
  };

  const mapText = (s) => htmlText(renderTerritoryMapHtml(territoryMapModel(s, CATALOG)));
  const map = {
    firstDay: mapText(save()),
    everythingOpenHomeAndAlly: mapText(save({ open: true, mine: CLANS[0], partner: CLANS[2], area: CLANS[0] })),
    campMarks: Object.fromEntries(CLANS.map((id) => [id, mapText(save({ open: true, mine: id })).filter((t) => t.includes(CLAN_SUFFIX))])),
  };

  const placesOf = (s) => {
    const m = buildDressingModel(s, CATALOG);
    return {
      today: `${m.currentPlace.name}${m.currentPlace.line ? ` · ${m.currentPlace.line}` : ''}`,
      places: m.places.map((p) => `${p.name}${p.lockLine ? ` · ${p.lockLine}` : ''}`),
      sheet: htmlText(renderPlacesSheetHtml(m, { clanLineHtml: clanLineHtml(m.clanPicker, m.clanPartnerName, { canChoose: true }) })),
    };
  };
  const places = {
    firstDay: placesOf(save()),
    everythingOpenAtHome: placesOf(save({ open: true, mine: CLANS[0], partner: CLANS[2], area: CLANS[0] })),
    worn: buildDressingModel({ ...save({ open: true }), equipped: { ...save().equipped, face: 'warpaint' }, unlocked: { ...save({ open: true }).unlocked, accessories: ['bell', 'bandana', 'warpaint'] } }, CATALOG).worn.map((w) => w.name),
  };

  return { pickYourGroup: pick, colony, fight, map, places };
}

// The canned chat phrases and the cats' replies: none carries a table word
// today. Any that does, or that carries a word written beside them, is listed.
function chat() {
  const keep = seriesFilter(
    [...Object.values(RANK_WORDS), ...Object.values(OUTSIDE_WORDS), ...Object.values(PLACE_WORDS), CLAN_SUFFIX],
    [...CLANS.map(clanName), ...OLD_AREAS.map((id) => rivalFor(id).name)],
  );
  const replies = new Set();
  for (const who of [...PERSONALITY_KEYS, 'nobody']) for (const p of PHRASES) for (let seed = 0; seed < 40; seed++) replies.add(replyFor(who, p.id, seed));
  return {
    phrasesRead: PHRASES.length,
    phrasesWithASeriesWord: PHRASES.map((p) => p.text).filter(keep),
    repliesRead: replies.size,
    repliesWithASeriesWord: sorted(replies).filter(keep),
  };
}

function clanEdition() {
  return {
    vocabulary: vocabulary(),
    names: {
      stored: storedNames(),
      camps: casts(),
      patrols: rivals(),
      borderPatrolCats: borderPatrols(),
      intruders: intruders(),
      starNames: starNames(),
    },
    tags: { secondLine: tagLines(), outsideCats: outsideLines() },
    lines: lines(),
    chat: chat(),
    screens: screens(),
  };
}

// ---- Legacy Edition: only where the code asks which edition it is ------------

function legacyEdition() {
  const L = 'legacy';
  const s = save({ edition: L, open: true, mine: CLANS[0], partner: CLANS[2], area: CLANS[0], title: clanTitleFor(ME) });
  const [a, b] = [A, B];
  const colony = colonyOf({
    cats: [cat(a), cat(b, { tamedBy: ME, tamedWalk: 'walk-2000', wear: 'warpaint' }), cat(PET)],
    feedList: [...feeds(a, ME, 1), ...feeds(b, ME, TAME_FEEDS), ...feeds(PET, ME, 3)],
  });
  const m = buildDressingModel(s, CATALOG);
  const warpaint = CATALOG.accessories.warpaint;
  return {
    edition: { title: editionTitle(L), page: gameTitle(L), isClanEdition: isClanEdition(s) },
    placeNames: Object.fromEntries(AREAS.map((id) => [id, placeName(id, L, CATALOG)])),
    prizeNames: Object.fromEntries(Object.keys(CATALOG.accessories)
      .filter((id) => CATALOG.accessories[id].legacyName || CATALOG.accessories[id].name.includes(CLAN_SUFFIX))
      .map((id) => [id, accessoryName(CATALOG.accessories[id], L)])),
    // the card is handed the catalog's own name, whatever the edition
    warPaintPrizeCard: htmlText(celebrationHtml({ visit: prizeVisit('warpaint'), style: 'B', prize: { id: 'warpaint', name: warpaint.name, slot: warpaint.slot, isNew: true } }, { petName: 'Mittens' })),
    ownGroupTitle: ownClanTitle(s),
    alliesName: alliesName(s),
    homeWelcome: homeWelcome(CLANS[0], s),
    patrols: Object.fromEntries([...OLD_AREAS, ...CLANS].map((id) => [id, rivalForWalk(id, L, [])?.name ?? '(no patrol)'])),
    atHome: clanHomeFor(CLANS[0], L, [CLANS[0]]),
    momentIsDue: clanMomentDue(s, CATALOG),
    collar: collarFor({ edition: L, colony: { cats: [] } }, PET),
    opensAfter: Object.fromEntries(AREAS.filter((id) => CATALOG.areas[id].requires)
      .map((id) => [id, opensAfterLine(CATALOG.areas[id].requires, 1, L, CATALOG)])),
    borderPostToTown: promptFor(postStatus(postsFor('woods')[0], s, CATALOG, 'woods')).text,
    colonyTab: htmlText(panel(colony, { edition: L, clanName: ownClanTitle(s) || clanTitleFor(ME), alliesName: clanName(CLANS[2]), clanRoles: { [RANK_KEYS.medicine]: b, [RANK_KEYS.deputy]: b } })),
    places: {
      today: `${m.currentPlace.name}${m.currentPlace.line ? ` · ${m.currentPlace.line}` : ''}`,
      places: m.places.map((p) => `${p.name}${p.lockLine ? ` · ${p.lockLine}` : ''}`),
      hasTerritoryMap: !!m.territoryMap,
      sheet: htmlText(renderPlacesSheetHtml(m)),
    },
    mapModelCamps: territoryMapModel(s, CATALOG).regions.map((r) => `${r.name}: ${r.camp ? 'camp' : 'no camp'}`),
    journalFooter: htmlText(renderJournalHtml({}, 0, 12)).filter((t) => /chased|Golden/i.test(t)),
  };
}

// ---- the phrase table (src/clanphrases.js), added 2026-11-16 ----------------
// Every id of the table with what it says, for the values below. This is where
// the lines that used to be written inside a closure (a fight's end, the chase
// back over a border, the mark prompts) are recorded as OUTPUT; they were
// pinned as source text in series-words-on-source.json before.
function phraseSamples() {
  const group = clanName('woods');
  const theirs = clanName('moor');
  const mate = clanCast('woods')[4].name;
  const foe = clanCast('moor')[RAIDER_SLOTS[0]].name;
  return {
    'group.name': [PREFIXES[0]],
    'tag.rankOfGroup': [RANK_WORDS[RANK_KEYS.leader], group],
    'outside.the': [OUTSIDE_WORDS.met],
    'outside.crossNow': [OUTSIDE_WORDS.grudge],
    'edition.game': [editionTitle('canon')],
    'pick.headingMine': [group],
    'pick.both': [group],
    'pick.lineBoth': [group],
    'home.welcome': [group],
    'map.camp': [group],
    'patrol.prompt': [mate],
    'patrol.endGood': [mate],
    'patrol.endShort': [mate],
    'patrol.award': [mate],
    'house.arrival': [PET, OUTSIDE_WORDS.house, PLACE_WORDS.town],
    'house.joined': [PET, PLACE_WORDS.town],
    'border.chasedBack': [foe],
    'cross.leading': [PARTNER_NAME, 'the Moor'],
    'mark.buddyToo': [mate],
    'mark.scentedOver': [theirs],
    'mark.scentedOverRetake': [theirs],
    'fight.challenge': [foe, theirs, phrase('fight.homeAsk')],
    'fight.homeAward': [foe],
    'fight.homeWon': [foe, theirs],
    'fight.homeLostScar': [foe],
    'fight.homeLost': [foe],
    'fight.homeTogether': [PARTNER_NAME, foe],
    'fight.borderAward': [foe],
    'fight.borderWon': [foe],
    'fight.borderLostScar': [foe],
    'fight.borderLost': [foe],
    'fight.alreadyFacing': [PARTNER_NAME, foe],
  };
}
function phrases() {
  const samples = phraseSamples();
  return Object.fromEntries(PHRASE_IDS.map((id) => [id, phrase(id, ...(samples[id] ?? []))]));
}

function snapshot() {
  return {
    about: 'Every series-derived string today\'s game shows. Recorded by test/serieswords.test.js; see its header before re-recording.',
    clanEdition: clanEdition(),
    legacyEdition: legacyEdition(),
    phrases: phrases(),
  };
}

describe('series words: today\'s game, pinned', () => {
  it('Clan Edition and Legacy Edition show exactly the recorded words', () => {
    checkAgainstFixture(FIXTURE, snapshot());
  });

  it('builds the same snapshot twice in a row', () => {
    expect(JSON.stringify(snapshot())).toBe(JSON.stringify(snapshot()));
  });

  it('covers every stored name, every seat of every camp and every pickable group', () => {
    const snap = snapshot().clanEdition;
    expect(Object.keys(snap.names.stored).length).toBe(STORED.length);
    expect(sorted(Object.keys(snap.names.stored))).toEqual(sorted(Object.keys(CAT_PREFIXES)));
    for (const clan of CLANS) {
      expect(snap.names.camps[clan].length).toBe(CAST_RANKS.length);
      expect(castFor(clan).length).toBe(CAST_RANKS.length);
    }
    expect(sorted(pickableClans())).toEqual(sorted(CLANS));
    expect(uniq(CLANS.map((id) => patrolClanFor(id, [])))).toEqual(sorted(CLANS));
    // an intruder is a threat only at home, and never from either child's group
    expect(isHostile({ clan: CLANS[1] }, { clanHome: true, picks: [CLANS[0]] })).toBe(true);
    expect(sortKeys({ b: 1, a: 2 })).toEqual({ a: 2, b: 1 });
  });

  it('records every phrase of the phrase table, each with every value filled in', () => {
    const said = phrases();
    expect(Object.keys(said)).toEqual([...PHRASE_IDS]);
    for (const id of PHRASE_IDS) {
      expect(typeof said[id], id).toBe('string');
      expect(said[id].length, id).toBeGreaterThan(0);
      expect(said[id], id).not.toMatch(/undefined|null|NaN|\[object/);
    }
    // a sample is for an id the table has
    for (const id of Object.keys(phraseSamples())) expect(PHRASE_IDS, id).toContain(id);
  });
});
