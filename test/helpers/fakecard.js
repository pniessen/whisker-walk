// A stand-in for the confirm card and the few DOM calls src/ui/freshcat.js makes, with no real DOM:
// the card's elements are found by the selectors the chunk uses, a click on the Yes button answers Yes
// only while it carries data-confirm="yes" (as src/ui/confirmcard.js does), and a pad and a clock are plain objects.
export function fakeEl(id = '') {
  const el = {
    id, attrs: {}, classes: new Set(), listeners: {}, children: {}, style: {}, textContent: '', _html: '', isConnected: true,
    disabled: false,
    classList: { add: (c) => el.classes.add(c), remove: (c) => el.classes.delete(c), contains: (c) => el.classes.has(c) },
    setAttribute(k, v) { el.attrs[k] = String(v); },
    getAttribute(k) { return el.attrs[k] ?? null; },
    removeAttribute(k) { delete el.attrs[k]; },
    addEventListener(t, f) { (el.listeners[t] ??= []).push(f); },
    fire(t, e = {}) {
      const ev = { preventDefault() { ev.prevented = true; }, ...e };
      for (const f of el.listeners[t] ?? []) f(ev);
      return ev;
    },
    remove() { el.isConnected = false; },
    focus() {},
    set innerHTML(v) { el._html = v; },
    get innerHTML() { return el._html; },
    querySelector(sel) { const c = el.children[sel]; return c && c.isConnected !== false ? c : null; },
    insertAdjacentHTML() {},
  };
  return el;
}

/** The confirm card as the chunk sees it. `ask(opts)` makes the card; `yes.click()` answers Yes when allowed. */
export function fakeConfirm() {
  const doc = { getElementById: (id) => (id === 'confirm-card' && state.card?.isConnected ? state.card : null), head: { appendChild() {} }, createElement: () => fakeEl() };
  doc.getElementById = (id) => (id === 'confirm-card' && state.card?.isConnected ? state.card : id === 'fresh-cat-css' ? null : null);
  const state = { card: null, opts: null, answered: null, asks: 0 };
  const confirmCard = {
    ask(opts) {
      if (state.card?.isConnected) return false;
      state.asks += 1;
      state.opts = opts;
      const card = fakeEl('confirm-card');
      const btns = fakeEl();
      const extra = fakeEl();
      const status = fakeEl('fresh-hold-status');
      const yes = fakeEl('confirm-card-yes');
      yes.setAttribute('data-confirm', 'yes');
      const ring = fakeEl();
      const drop = () => { card.isConnected = false; yes.isConnected = false; };
      yes.children['.fill'] = ring;
      yes.click = () => {
        const ev = yes.fire('click', { detail: 0 });
        if (ev.prevented) return;
        if (yes.getAttribute('data-confirm') === 'yes') { drop(); state.answered = 'yes'; opts.onYes(); }
      };
      yes.insertAdjacentHTML = (where, html) => {
        if (html.includes('id="fresh-save"')) {
          const sv = fakeEl('fresh-save');
          sv.click = () => sv.fire('click', {});
          card.children['#fresh-save'] = sv;
        }
      };
      btns.insertAdjacentHTML = (where, html) => {
        if (html.includes('fresh-extra')) {
          card.children['.fresh-extra'] = extra;
          card.children['#fresh-hold-status'] = status;
          // the Bring back card writes its lines in the same call
          extra.innerHTML = html;
        }
      };
      card.children['.nearby-card-btns'] = btns;
      card.children['#confirm-card-yes'] = yes;
      card.children['#confirm-card-no'] = fakeEl('confirm-card-no');
      card.children['#confirm-card-no'].click = () => { drop(); state.answered = 'no'; };
      state.card = card;
      return true;
    },
  };
  return { confirmCard, doc, state };
}

/** A pad as navigator.getGamepads() gives it: button 2 is X. */
export function fakeNav() {
  const pad = { connected: true, mapping: 'standard', buttons: Array.from({ length: 10 }, () => ({ pressed: false, value: 0 })) };
  return { pad, nav: { getGamepads: () => [pad] }, hold(i, on = true) { pad.buttons[i] = { pressed: on, value: on ? 1 : 0 }; } };
}
