// The den shop's start-up stub (den shop UX, M1). The shop's code
// (denshopview.js and denshop.js) is a lazy chunk: this loads it at the first
// den walk, when the den's own area chunk is fetched too, and passes every
// call on. Until it has arrived the shop is closed and asks nothing, so the
// backstack, the gamepad and walk.js can call it exactly as before.
//
// Nothing here may import denshopview.js or denshop.js statically; a test
// (test/denshoplazy.test.js) reads the source to keep it so.
import { PAD_BUTTONS } from '../gamepadinput.js';

const defaultLoad = () => import('./denshopview.js');

export function createLazyDenShop(opts = {}, load = defaultLoad) {
  let view = null;
  let loading = null;
  let active = false;
  let wantOpen = false;

  function ensure() {
    if (view) return Promise.resolve(view);
    if (!loading) {
      loading = Promise.resolve()
        .then(load)
        .then((mod) => {
          view = mod.createDenShopView(opts);
          return view;
        })
        .catch(() => { loading = null; return null; }); // offline: tried again next time
    }
    return loading;
  }

  return {
    setActive(on) {
      active = !!on;
      if (view) { view.setActive(active); return; }
      if (!active) return;
      ensure().then((v) => {
        if (!v) return;
        v.setActive(active); // the latest word: a walk that ended meanwhile stays off
        if (wantOpen && active) v.open();
        wantOpen = false;
      });
    },
    open() {
      if (view) { view.open(); return; }
      wantOpen = true;
      ensure().then((v) => {
        if (!v) return;
        if (wantOpen) { wantOpen = false; v.open(); }
      });
    },
    // The home screen's My den button: the sheet with no walk under it. `o.onWalkIn` runs after it closes.
    openHome(o = {}) {
      if (view) { view.openHome(o); return; }
      ensure().then((v) => { if (v) v.openHome(o); else opts.onUnavailable?.(); });
    },
    // The pad's shortcut buttons while the panel is up (L1/R1 tabs, X put away, Start done); true = taken.
    padButton(i) {
      if (!view) return false;
      // The pause card of a den walk says "Press Y for the Den shop": the pad is in menu mode there, so Y answers here too.
      if (i === PAD_BUTTONS.Y && active && !view.isOpen) { view.open(); return true; }
      return view.padButton(i);
    },
    close(arg) { if (view) view.close(arg); else wantOpen = false; },
    get isOpen() { return !!view && view.isOpen; },
    get isAsking() { return !!view && view.isAsking; },
    get isActive() { return active; },
    get isHome() { return !!view && view.isHome; },
    get isPlacing() { return !!view && view.isPlacing; },
    stopPlacing() { if (view) view.stopPlacing(); },
    notNow() { if (view) view.notNow(); },
  };
}
