// "Delete my online data" (the Cloud save sheet, for grown-ups): asks the
// server to delete what this device put there, and then makes the device stop
// putting it back. The SQL is docs/supabase-v9-delete.sql.
//
// Two server calls, each idempotent ('none' means nothing was there, which
// counts as done, so trying again after a half-finished delete is safe):
//   delete_player  this device's cat profile, its friendships and its colony
//                  sharing (always asked: a device that never saved a cat
//                  name just gets 'none')
//   delete_save    the cloud save this device is linked to, if it is linked
//
// What changes on the device, and only for the part the server confirmed:
//   player gone -> the saved cat name is cleared (state.petName back to null,
//                  exactly what a brand-new player has). Without a name the
//                  game never pushes a profile (rooms.pushProfileNow) and the
//                  colony sync stops at 'needs-name' with no network call, so
//                  nothing goes back up on the next launch. The colony link
//                  (colony id, partner) is cleared as an 'unpaired' pull
//                  would; every cat and feed stays.
//   save gone   -> the device is unlinked from the save code (sync.unlink),
//                  so the next walk doesn't upload it again.
// Nothing else on the device is touched: progress, album, kept copies, the
// met list, and the device id and secret (the local colony's cats are keyed
// to the id, and a new name later makes a fresh profile under it).
//
// run() -> { outcome, player, save }, where player/save are the server's
// words ('not-linked' for a device with no cloud save) and outcome is:
//   'done'        both parts are gone (or were never there)
//   'unavailable' the server doesn't have the functions yet: nothing changed
//   'offline'     no answer (or a garbled one): nothing changed, try again
//   'denied'      the server refused this device's secret: nothing changed
//   'busy'        the server's limit on wrong answers: nothing changed
//   'partial'     one part is gone and the other isn't (see player/save)
import { note } from '../diagnostics.js';

const DONE = new Set(['ok', 'none', 'not-linked']);

export function createOnlineDelete({ MP, pid, getCloud, getPsecret, sync, progression }) {
  let running = null;

  // Local effects, each only once the server has confirmed its part.
  function forgetPlayer() {
    if (progression.state.petName !== null) progression.setPetName(null);
    const c = progression.state.colony;
    if (c.id !== null || c.partner !== null) progression.setColonyLink({ id: null, partner: null });
  }

  async function doRun() {
    const cloud = MP ? getCloud() : null;
    if (!cloud || typeof pid !== 'string' || !pid) return { outcome: 'unavailable', player: null, save: null };
    const player = await cloud.deletePlayer(pid, getPsecret());
    // The functions come together in one SQL file: missing here means
    // missing there too, so don't touch anything.
    if (player === 'unavailable') return { outcome: 'unavailable', player, save: null };
    if (DONE.has(player)) {
      forgetPlayer();
      // A profile push that was already on its way when the delete landed
      // would have made the row again. With the name cleared nothing new is
      // sent, so one more delete settles it; its answer changes nothing here.
      if (player === 'ok') await cloud.deletePlayer(pid, getPsecret());
    }
    let save = 'not-linked';
    try {
      save = await sync.deleteCloudSave();
    } catch (err) {
      note('cloud', err);
      save = 'offline';
    }
    if (save === 'ok' || save === 'none') sync.unlink();
    // The parts there were to delete: the save only when the device is linked.
    const parts = save === 'not-linked' ? [player] : [player, save];
    const done = parts.filter((w) => DONE.has(w)).length;
    let outcome;
    if (done === parts.length) outcome = 'done';
    else if (done > 0) outcome = 'partial';
    else if (parts.includes('denied')) outcome = 'denied';
    else if (parts.includes('busy')) outcome = 'busy';
    else if (parts.includes('unavailable')) outcome = 'unavailable';
    else outcome = 'offline';
    // The answers only: never the code, the secret, the id or the name.
    if (outcome !== 'done') note('cloud', `online delete ${outcome} (profile ${player}, save ${save})`);
    return { outcome, player, save };
  }

  return {
    available: !!MP,
    // Single-flight: a second tap while one is running gets the same answer.
    run() {
      if (!running) {
        running = doRun()
          .catch((err) => { note('cloud', err); return { outcome: 'offline', player: null, save: null }; })
          .finally(() => { running = null; });
      }
      return running;
    },
  };
}
