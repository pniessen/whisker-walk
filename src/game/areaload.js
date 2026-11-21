// Loads area packs (src/world/areas.js) on demand: caches what has come,
// joins a load already in flight, forgets a failure so the next ask retries,
// and gives up on a load that takes too long (a pack that arrives after that
// is still kept, so the next ask is instant).
import { AREA_LOADERS } from '../world/areas.js';
import { note } from '../diagnostics.js';

export const AREA_LOAD_TIMEOUT_MS = 15000;

export class AreaLoadError extends Error {
  constructor(areaId, kind, cause) {
    super(`Area ${areaId}: ${kind}`);
    this.name = 'AreaLoadError';
    this.areaId = areaId;
    this.kind = kind; // 'unknown' | 'failed' | 'timeout'
    this.cause = cause;
  }
}

export function createAreaLoader({ loaders = AREA_LOADERS, timeoutMs = AREA_LOAD_TIMEOUT_MS, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const packs = new Map();
  const inflight = new Map();

  function ensure(id) {
    if (packs.has(id)) return Promise.resolve(packs.get(id));
    if (inflight.has(id)) return inflight.get(id);
    if (!Object.hasOwn(loaders, id)) return Promise.reject(new AreaLoadError(id, 'unknown'));
    let load;
    try { load = Promise.resolve(loaders[id]()); } catch (err) { load = Promise.reject(err); }
    // The pack is kept the moment it arrives, even after a timeout.
    const kept = load.then((pack) => { packs.set(id, pack); return pack; });
    const p = new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimer(() => {
        if (done) return;
        done = true;
        inflight.delete(id);
        reject(new AreaLoadError(id, 'timeout'));
      }, timeoutMs);
      kept.then((pack) => {
        clearTimer(timer);
        inflight.delete(id);
        if (!done) { done = true; resolve(pack); }
      }, (err) => {
        clearTimer(timer);
        inflight.delete(id);
        if (!done) { done = true; reject(new AreaLoadError(id, 'failed', err)); }
      });
    });
    inflight.set(id, p);
    return p;
  }

  function prefetch(id) {
    try { ensure(id).catch((err) => { try { note('area', err); } catch { /* noting must not fail */ } }); } catch { /* never throws */ }
  }

  return {
    loaded: (id) => packs.get(id) ?? null,
    ensure,
    prefetch,
    ensureAll: (ids = Object.keys(loaders)) => Promise.all(ids.map(ensure)),
  };
}
