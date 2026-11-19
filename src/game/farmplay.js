// =============================================================================
// Appletree Farm's jobs and discoveries in the walk: what each event of
// src/farmjobs.js pays, says and sounds like.
//
// game/walk.js hands every event the Farm's animals raise to handleFarmEvent
// (the animals' own, from step 2, and the jobs' and finds', from step 3).
// Nothing here is sent to a co-walker, and the only things saved are the two
// awards below, through the discovery log like every other award.
//
// WHAT IS PAID
//   * A job finished: AWARDS.farmjob coins (what a neighbour's quest pays),
//     once a walk for each job, and its journal page counts one more.
//   * A find: AWARDS.farmfind coins the FIRST TIME EVER (its journal page is
//     still empty), and nothing after that. Every walk it is found on counts
//     on its page, once, and gets its quiet line, once.
// Both go by the discovery log's keys, which a walk picked up again carries
// (walkresume.js `paid`): a finished job stays finished, and a find is not
// paid or said twice.
// =============================================================================
import { FARM_JOB_IDS, FARM_HAT_ID, FARM_HAT_KIND, JOB, jobJournalId, findJournalId } from '../farmjobs.js';
import { JOB_WORDS, FIND_WORDS, ANIMAL_TOASTS, jobGoalLine } from '../farmwords.js';

export const jobKey = (id) => `farm-job-${id}`;
export const findKey = (id) => `farm-find-${id}`;

// payFarmJob(id, { log, progression }) → the coins paid (0: already paid this walk).
export function payFarmJob(id, { log, progression }) {
  if (!FARM_JOB_IDS.includes(id)) return 0;
  const points = log.awardOnce('farmjob', jobKey(id), JOB_WORDS[id].done());
  if (points > 0) progression.recordSighting(jobJournalId(id));
  return points;
}

// noteFarmFind(id, { log, progression }) → { fresh, first, points }.
//   fresh   this is the first time on this walk
//   first   and the first time ever: it was paid
export function noteFarmFind(id, { log, progression }) {
  const words = FIND_WORDS[id];
  const key = findKey(id);
  if (!words || log.count(key) > 0) return { fresh: false, first: false, points: 0 };
  const page = findJournalId(id);
  const seen = progression.state?.journal?.[page];
  const first = !(Number.isFinite(seen) && seen > 0);
  const points = first ? log.awardOnce('farmfind', key, words.first()) : 0;
  if (!first) log.mark(key);
  progression.recordSighting(page);
  return { fresh: true, first, points };
}

// The prompt for what E would do (farmjobs.js actionFor).
export function farmPromptText(action) {
  if (!action) return null;
  if (action.kind === 'offer') return JOB_WORDS[action.job]?.prompt() ?? null;
  if (action.kind === 'milk') return JOB_WORDS.cow.milkPrompt();
  if (action.kind === 'deliver') return JOB_WORDS.goat.doorPrompt();
  if (action.kind === 'tryhat') return FIND_WORDS.scarecrow.prompt();
  if (action.kind === 'hatback') return FIND_WORDS.scarecrow.backPrompt();
  return null;
}

// The HUD's one line for the newest job under way, and how far its next spot
// is: { text, meters } or null.
export function farmObjective(farm, catPos) {
  const o = farm?.jobs?.objective();
  const text = jobGoalLine(o);
  if (!text) return null;
  return { text, meters: o.target ? Math.hypot(o.target.x - catPos.x, o.target.z - catPos.z) : undefined };
}

// The farmer's hat as something to carry: made with the walk, out of sight
// until the goat drops it.
export function addFarmHat(carry, area) {
  const door = area.anchors.farmhouseDoor;
  return carry.items.addHidden({ id: FARM_HAT_ID, kind: FARM_HAT_KIND, x: door.x, z: door.z });
}
// Where it lies once it is handed in: on the porch, beside the door.
export function hatAtDoor(carry, area) {
  const door = area.anchors.farmhouseDoor;
  if (carry.mouth.held?.id === FARM_HAT_ID) { carry.mouth.held = null; carry.mouth.grip = 0; }
  carry.items.showAt(FARM_HAT_ID, door.x - 0.35, door.z + 0.55);
}

// A walk picked up again: the jobs it had already finished are finished.
export function restoreFarmJobs(farm, { log, carry, area }) {
  if (!farm?.jobs) return;
  for (const id of FARM_JOB_IDS) {
    if (log.count(jobKey(id)) <= 0) continue;
    farm.jobs.markDone(id);
    if (id === 'goat') hatAtDoor(carry, area);
  }
}

// handleFarmEvent(e, ctx): one event of the animals, the jobs or the finds.
//   ctx   { hud, audio, log, progression, session, once }
//           once(key, text)   a toast shown once a walk
export function handleFarmEvent(e, ctx) {
  const { hud, audio, log, progression, session, once } = ctx;
  const say = ANIMAL_TOASTS[e.type];
  switch (e.type) {
    // ---- the animals (step 2) ----
    case 'moo': audio.moo(); break;
    case 'cluck': audio.cluck(0.35, 1.25); break;
    case 'peep': audio.peep(); break;
    case 'goat-butt': audio.bleat(); once(e.type, say()); break;
    case 'goat-copy': once(e.type, say()); break;
    case 'dog-hello': once(e.type, say()); break;
    case 'chick-follow':
      audio.peep();
      // (while they are being rounded up, the job's own line says it)
      if (session?.farm?.jobs?.state.chicks !== 'active') once(e.type, say());
      break;
    case 'ducklings-follow': audio.peep(); break; // its line is the find's, below
    case 'ride': once(e.type, say()); break;
    case 'dismount': session?.fx?.burst(session.cat.position, 0xcbb8a0, 8); break;
    // ---- the jobs ----
    case 'job-start':
      hud.toast(JOB_WORDS[e.job].start());
      if (e.job === 'chicks') audio.cluck(0.6, 1);
      else if (e.job === 'cow') audio.moo();
      else if (e.job === 'goat') audio.bleat();
      else audio.peep(0.8);
      break;
    case 'job-done':
      payFarmJob(e.job, { log, progression });
      break;
    case 'chick-found': once(e.type, JOB_WORDS.chicks.found()); break;
    case 'chick-home':
      audio.peep();
      if (e.n < JOB.CHICKS) hud.toast(JOB_WORDS.chicks.home(e.n, JOB.CHICKS));
      break;
    case 'cow-milk': audio.moo(); hud.toast(JOB_WORDS.cow.milk()); break;
    case 'goat-skip': audio.bleat(0.6); if (e.leg > 0) once(e.type, JOB_WORDS.goat.skip()); break;
    case 'goat-drop':
      audio.bleat();
      hud.toast(JOB_WORDS.goat.drop());
      session?.carry?.items.placeAt(FARM_HAT_ID, e.x, e.z);
      break;
    case 'mouse-run': audio.peep(0.5); break;
    // ---- the finds ----
    case 'find': {
      const got = noteFarmFind(e.id, { log, progression });
      if (!got.fresh) break;
      if (!got.first && FIND_WORDS[e.id].again) hud.toast(FIND_WORDS[e.id].again());
      if (e.id === 'loftcats') audio.purr?.(1.6);
      break;
    }
    case 'owl-peek': once(e.type, FIND_WORDS.owl.peek()); break;
    case 'apple-thud': audio.landThump?.(); break;
    case 'hat-on': hud.toast(FIND_WORDS.scarecrow.on()); break;
    case 'hat-off': hud.toast(FIND_WORDS.scarecrow.off()); break;
    default: break;
  }
}
