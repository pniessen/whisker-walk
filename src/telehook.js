// The start-up side of the teleport gates (milestone 0): a slot and a loader, nothing else. With ?gates=1 the one lazy
// chunk (src/teleport.js, with src/teleui.js and src/world/telegate.js in it) and couch play's table of ready places
// come together, at boot and at every walk's start, and `tele.kit` holds the chunk; without the switch nothing is
// fetched and `tele.kit` stays null, so the walk's few hook lines do nothing and no gate exists.
import { teleOn } from './teleflag.js';
import { greenhouseOn } from './greenhouseflag.js';
import { placeName, isClanEdition } from './edition.js';
import { CATALOG } from './progression.js';
import { coop } from './coopseam.js';
import { walkOnMove } from './gatecross.js';
import { lower } from './territories.js';
import { padTag } from './tvseam.js';
import { escapeHtml } from './escapehtml.js';

export const tele = { kit: null };
let loading = null;

// `area`: the place she will walk in; if it draws a suit the kit is fetched too (a start there after closing the app).
export function teleLoad(area) {
  if (!teleOn()) return Promise.resolve(null);
  loading ??= Promise.all([import('./teleport.js'), import('./coop/table.js')])
    .then(([t, co]) => {
      t.setup({ teleOn, greenhouseOn, placeName, walkOnMove, lower, padTag, escapeHtml, coopReady: co.coopReady, catalog: CATALOG, isClan: isClanEdition, couch: () => coop.poll !== null });
      return (tele.kit = t);
    }, () => { loading = null; return null; });
  return loading.then((t) => { if (t && area) t.warm(area); return t; });
}
