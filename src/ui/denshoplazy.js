// The den shop's start-up stub (den shop UX, M1). The shop's code
// (denshopview.js and denshop.js) is a lazy chunk: this loads it at the first
// den walk, when the den's own area chunk is fetched too, and passes every
// call on. Until it has arrived the shop is closed and asks nothing, so the
// backstack, the gamepad and walk.js can call it exactly as before.
//
// Nothing here may import denshopview.js or denshop.js statically; a test
// (test/denshoplazy.test.js) reads the source to keep it so.
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
    close(arg) { if (view) view.close(arg); else wantOpen = false; },
    get isOpen() { return !!view && view.isOpen; },
    get isAsking() { return !!view && view.isAsking; },
    notNow() { if (view) view.notNow(); },
  };
}
