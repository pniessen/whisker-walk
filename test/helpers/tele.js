// The teleport gates' chunk (src/teleport.js) set up as src/telehook.js sets it up, with the real start-up pieces it is
// handed, for a test: teleKit({ coopReady, couch }) -> the chunk's module. Overrides replace a piece (a couch table, say).
import { teleOn } from '../../src/teleflag.js';
import { greenhouseOn } from '../../src/greenhouseflag.js';
import { placeName, isClanEdition } from '../../src/edition.js';
import { walkOnMove } from '../../src/gatecross.js';
import { lower } from '../../src/territories.js';
import { padTag } from '../../src/tvseam.js';
import { escapeHtml } from '../../src/escapehtml.js';
import { coopReady } from '../../src/coop/table.js';
import { CATALOG } from '../../src/progression.js';
import * as t from '../../src/teleport.js';

export async function teleKit(overrides = {}) {
  t.setup({ teleOn, greenhouseOn, placeName, walkOnMove, lower, padTag, escapeHtml, coopReady, catalog: CATALOG, isClan: isClanEdition, couch: () => false, ...overrides });
  return t;
}
