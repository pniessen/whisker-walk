// Split screen S3 (?split=1): a HUD for each half. Lazy: splitview.js imports this only when the flag is on,
// and nothing here runs until the split picture is (even partly) up. Shared mode is exactly today's HUD.
//
// While the split is up (the rule's `active`):
//  - html gets `coop-split` (any part of the split on screen), `coop-split-slide` (mid-slide, 0 < t < 1) or
//    `coop-split-full` (t = 1), and `--sp-t` (the rule's t). The walk's own goal line, goals column, badge row and
//    corner map fade out as (1 - t) and the two half HUDs fade in as t (the crossfade runs with the 400 ms slide).
//  - two containers (#sp-hud-0 left = cat one, #sp-hud-1 right = cat two) sit inside the 5 % safe margins, scaled
//    by --tv-s. Each holds: its own corner minimap (centred on its own cat), the goal line (mirrors the one
//    objective: quests are one per walk, as the single goal line in couch play), the next goal with its "how"
//    line, the badge row, and a low stack with that cat's toasts, its finder chip and its prompt slot.
//  - the per-cat prompt slots (src/coop/hud.js), the finder chip and the toasts that have an owner move into the
//    owning half; a toast with no owner (the walk's own, or both found it) stays centred. Everything goes back
//    when the split goes away.
//  - the pause card, the Ready card, story and tally cards and the world map live in #overlay (z-index 10) and
//    are not touched: the half HUDs sit at z-index 9, under them.
import { coop } from '../coopseam.js';
const chipHook = { set fn(f) { coop.chipHook = f; }, get fn() { return coop.chipHook ?? null; } }; // the coop HUD (hud.js) calls this when it shows a finder chip

export const CSS = `
:root.coop-split-slide .hud-objective,:root.coop-split-slide .hud-goals,:root.coop-split-slide .hud-badges,:root.coop-split-slide .hud-map{opacity:calc(1 - var(--sp-t,0))}
:root.coop-split-full .hud-objective,:root.coop-split-full .hud-goals,:root.coop-split-full .hud-badges,:root.coop-split-full .hud-map{display:none !important}
:root{--sp-s:1}
:root.tv{--sp-s:var(--tv-s,1)}
.sp-hud{position:fixed;z-index:9;top:var(--tv-safe-y,5vh);bottom:var(--tv-safe-y,5vh);width:calc(50vw - var(--tv-safe-x,5vw) - 16px);opacity:var(--sp-t,1);pointer-events:none;display:flex;flex-direction:column;font-family:Avenir,system-ui,sans-serif;color:#fff;font-size:calc(24px * var(--sp-s));--map-size:calc(150px * var(--sp-s))}
.sp-hud.sp0{left:var(--tv-safe-x,5vw)}
.sp-hud.sp1{right:var(--tv-safe-x,5vw);text-align:right}
.sp-head{display:flex;gap:calc(14px * var(--sp-s));align-items:flex-start}
.sp-hud.sp1 .sp-head{flex-direction:row-reverse}
.sp-hud.sp0 .sp-head{padding-right:calc(100px * var(--sp-s))} /* the centre is the rank pill's: the goal pills stop short of it */
.sp-hud.sp1 .sp-head{padding-left:calc(100px * var(--sp-s))}
.sp-map{position:relative;flex:none;width:var(--map-size);display:flex;flex-direction:column;align-items:center;gap:5px}
.sp-map .hud-area{font-size:calc(20px * var(--sp-s));padding:calc(3px * var(--sp-s)) calc(12px * var(--sp-s))}
.sp-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:calc(8px * var(--sp-s))}
.sp-hud.sp0 .sp-info{align-items:flex-start}
.sp-hud.sp1 .sp-info{align-items:flex-end}
.sp-hud .hud-objective{position:static;margin:0;width:fit-content;max-width:100%;font-size:calc(26px * var(--sp-s)) !important;line-height:1.3;padding:calc(6px * var(--sp-s)) calc(18px * var(--sp-s));border-radius:calc(28px * var(--sp-s));text-align:center}
.sp-hud .hud-objective.hidden,.sp-hud .sp-goals.hidden,.sp-hud .sp-badges.hidden{display:none}
.sp-goals{background:rgba(20,26,38,.55);border-radius:12px;padding:calc(6px * var(--sp-s)) calc(12px * var(--sp-s));font-size:calc(24px * var(--sp-s));text-align:left;max-width:100%;text-shadow:0 1px 1px rgba(0,0,0,.6)}
.sp-goals .goal:not(.next){display:none}
.sp-goals .goal-how{font-size:calc(22px * var(--sp-s)) !important}
.sp-badges{display:flex;flex-wrap:wrap;gap:3px;max-width:100%}
.sp-hud.sp1 .sp-badges{justify-content:flex-end}
.sp-badges .hud-badge{width:calc(44px * var(--sp-s));height:calc(44px * var(--sp-s));font-size:calc(26px * var(--sp-s))}
.sp-low{position:absolute;left:0;right:0;bottom:calc(74px * var(--sp-s));display:flex;flex-direction:column;gap:calc(6px * var(--sp-s))}
.sp-hud.sp0 .sp-low{align-items:flex-start}
.sp-hud.sp1 .sp-low{align-items:flex-end}
.sp-toasts{display:flex;flex-direction:column;gap:calc(6px * var(--sp-s));align-items:inherit;max-width:100%}
.sp-toasts .toast{font-size:calc(26px * var(--sp-s)) !important;max-width:100%;border-radius:calc(22px * var(--sp-s))}
:root.coop-split .coop-hints{gap:calc(32px * var(--sp-s))}
:root.coop-split .coop-hints span{box-sizing:border-box;max-width:calc(50% - 16px * var(--sp-s));border-radius:calc(20px * var(--sp-s))}
:root.coop-split .coop-hints span+span{text-align:right}
:root.coop-split .hud-hint{top:calc(130px * var(--sp-s)) !important;bottom:auto !important;max-width:30vw !important}
.sp-hud .coop-slot,.sp-hud .coop-chip{position:static;transform:none;max-width:100%;font-size:calc(24px * var(--sp-s))}
`;

const HEX = [0x3b82f6, 0xf59e0b]; // the two cats' colours on the other cat's map (as src/coop/hud.js HEX)
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const kids = (e, cls) => Array.from(e?.children ?? []).filter((c) => c.classList?.contains(cls));
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * createSplitHud({ doc, deps }) -> { update(res, env), state(), fade(), dispose() }
 *  res: the split rule's answer { active, t, mode }; env: { session, cam2, camera, pos2 } (all optional).
 *  deps: { createMinimap, buildMapLayer } (tests pass stubs; the game imports ui/minimap.js on first use).
 */
export function createSplitHud({ doc = document, deps = null, now = () => Date.now() } = {}) {
  const root = doc.documentElement;
  let style = null;
  let boxes = null; // [{ el, map, area, obj, goals, badges, toasts, low, mini, frame }]
  let t = 0;
  let layerFor = null; let layer = null;
  let sig = '';
  let minis = null; let miniLoad = null;
  const pending = []; // { norm, slot, at }: toasts the coop chunk has emitted with an owner, awaiting their element
  const view = [{ cx: 0, cz: 0, heading: 0 }, { cx: 0, cz: 0, heading: 0 }];
  const el = (cls, tag = 'div') => { const e = doc.createElement(tag); e.className = cls; return e; };

  // The coop chunk says who a toast belongs to (chipShow, right after it toasts it).
  let chipSlot = -1;
  chipHook.fn = (slotsList, text) => {
    chipSlot = slotsList?.length === 1 ? slotsList[0] : -1;
    if (!text || !slotsList || slotsList.length !== 1) return;
    pending.push({ n: norm(text), slot: slotsList[0], at: now() });
    while (pending.length > 8) pending.shift();
  };

  function build() {
    if (!style) { style = doc.createElement('style'); style.textContent = CSS; (doc.head ?? doc.body).appendChild(style); }
    boxes = [0, 1].map((i) => {
      const box = el(`sp-hud sp${i}`);
      box.id = `sp-hud-${i}`;
      box.dataset.half = String(i);
      const head = el('sp-head');
      const map = el('sp-map');
      const area = el('hud-area');
      map.appendChild(area);
      const info = el('sp-info');
      const obj = el('hud-objective hidden');
      const goals = el('sp-goals hidden');
      const badges = el('sp-badges hidden');
      info.append(obj, goals, badges);
      head.append(map, info);
      const low = el('sp-low');
      const toasts = el('sp-toasts');
      toasts.setAttribute('role', 'status');
      low.appendChild(toasts);
      box.append(head, low);
      doc.body.appendChild(box);
      return { el: box, map, area, obj, goals, badges, toasts, low, mini: null };
    });
    sig = '';
    // the per-cat prompt slots and the chip join their half
    for (const s of kids(doc.body, 'coop-slot')) boxes[s.classList.contains('right') ? 1 : 0].low.appendChild(s);
  }

  function teardown() {
    for (const b of boxes ?? []) {
      b.mini?.dispose?.();
      for (const s of [...kids(b.low, 'coop-slot'), ...kids(b.low, 'coop-chip')]) doc.body.appendChild(s);
      const home = doc.getElementById('hud-toasts');
      for (const toast of kids(b.toasts, 'toast')) { delete toast.dataset.sp; home?.appendChild(toast); }
      b.el.remove();
    }
    for (const toast of kids(doc.getElementById('hud-toasts'), 'toast')) delete toast.dataset.sp;
    boxes = null; minis = null; layer = null; layerFor = null;
    root.classList.remove('coop-split', 'coop-split-slide', 'coop-split-full');
    root.style.removeProperty('--sp-t');
    pending.length = 0;
  }

  // The walk's one goal line, goals column and badge row, copied into both halves when they change.
  function mirror() {
    const q = (id) => doc.getElementById(id);
    const o = q('hud-objective'); const g = q('hud-goals'); const bd = q('hud-badges'); const a = q('hud-area');
    const next = `${o?.className}|${o?.innerHTML}|${g?.className}|${g?.innerHTML}|${bd?.className}|${bd?.innerHTML}|${a?.textContent}`;
    if (next === sig) return;
    sig = next;
    for (const b of boxes) {
      b.obj.className = `hud-objective${o && !o.classList.contains('hidden') ? '' : ' hidden'}`;
      b.obj.innerHTML = o?.innerHTML ?? '';
      b.goals.innerHTML = g?.innerHTML ?? '';
      const open = !!g && !g.classList.contains('hidden') && /class="goal [^"]*\bnext\b/.test(b.goals.innerHTML);
      b.goals.classList.toggle('hidden', !open);
      b.badges.innerHTML = bd?.innerHTML ?? '';
      b.badges.classList.toggle('hidden', !bd || bd.classList.contains('hidden') || !bd.children.length);
      b.area.textContent = a?.textContent ?? '';
    }
  }

  // A toast the coop chunk gave to one cat moves to that cat's half; every other stays where it is.
  function routeToasts() {
    const home = doc.getElementById('hud-toasts');
    if (!home) return;
    const t0 = now();
    while (pending.length && t0 - pending[0].at > 15000) pending.shift();
    for (const toast of kids(home, 'toast').filter((e) => !e.dataset.sp)) {
      const n = norm(toast.textContent);
      const k = pending.findIndex((p) => p.n && (n === p.n || n.includes(p.n)));
      if (k < 0) { toast.dataset.sp = 'g'; continue; }
      const [p] = pending.splice(k, 1);
      toast.dataset.sp = String(p.slot);
      boxes[p.slot]?.toasts.appendChild(toast);
    }
    // the finder chip sits in the half of the cat whose colour it wears
    const chip = kids(doc.body, 'coop-chip')[0] ?? boxes.map((b) => kids(b.low, 'coop-chip')[0]).find(Boolean);
    if (chip) {
      const target = chipSlot >= 0 ? boxes[chipSlot].low : null;
      if (target && chip.parentNode !== target) target.insertBefore(chip, kids(target, 'coop-slot')[0] ?? null);
      else if (!target && chip.parentNode !== doc.body) doc.body.appendChild(chip);
    }
  }

  async function ensureMinis(env) {
    const s = env.session;
    if (!s?.areaData || !s.scene || miniLoad) return;
    if (minis && layerFor === s.areaData) return;
    miniLoad = (async () => {
      const m = deps ?? s.minimapKit; // from walk.js: importing ui/minimap.js here would reshuffle the build's chunks
      if (!m) return;
      if (layerFor !== s.areaData) {
        layer = m.buildMapLayer(s.areaData, s.scene); layerFor = s.areaData;
        for (const b of boxes ?? []) b.mini?.dispose?.();
      }
      if (!boxes) return;
      boxes.forEach((b, i) => {
        if (b.mini) return;
        b.mini = m.createMinimap(b.map, {
          areaId: s.areaId, layer, mode: 'north', getIsTouch: () => false,
        });
        b.frame = { race: null, quest: null, scenics: [], visitedScenics: new Set(), remotes: [{ x: 0, z: 0, color: HEX[1 - i] }], camp: null, posts: null, ladder: false };
      });
      minis = true;
    })().catch(() => {}).finally(() => { miniLoad = null; });
  }

  function maps(env) {
    const s = env.session;
    if (!s) return;
    if (!minis || layerFor !== s.areaData) { ensureMinis(env); if (!minis) return; }
    const p = [s.cat?.position, env.pos2];
    const cams = [env.camera, env.cam2];
    for (let i = 0; i < 2; i++) {
      const b = boxes[i];
      const e = cams[i]?.matrixWorld?.elements; // the camera looks down -z: its forward is (-e[8], -e[10]) on the ground
      if (!b.mini || !p[i] || !e) continue;
      const v = view[i];
      v.cx = p[i].x; v.cz = p[i].z; v.heading = Math.atan2(e[8], e[10]); // the map's heading: atan2(-f.x, -f.z)
      const f = b.frame;
      f.race = s.race; f.quest = s.quest; f.scenics = s.areaData.scenics ?? []; f.visitedScenics = s.scenicsVisited ?? f.visitedScenics;
      f.camp = s.campMarker; f.posts = s.postMarkers; f.ladder = s.areaId === 'reef';
      const o = p[1 - i];
      f.remotes[0].x = o?.x ?? 0; f.remotes[0].z = o?.z ?? 0;
      b.mini.update(v, f);
    }
  }

  return {
    update(res, env = {}) {
      if (!res?.active) { if (boxes) teardown(); t = 0; return; }
      if (!boxes) build();
      t = clamp01(res.t ?? 0);
      const c = root.classList;
      c.add('coop-split');
      c.toggle('coop-split-slide', t < 1);
      c.toggle('coop-split-full', t >= 1);
      root.style.setProperty('--sp-t', String(Math.round(t * 1000) / 1000));
      mirror();
      routeToasts();
      maps(env);
    },
    /** The crossfade at this moment: the half HUDs' opacity (t), the walk's own pieces' (1 - t). */
    fade() { return { halves: boxes ? t : 0, shared: boxes ? 1 - t : 1, phase: !boxes ? 'shared' : t < 1 ? 'slide' : 'split' }; },
    state() { return { on: !!boxes, t }; },
    dispose() { if (boxes) teardown(); style?.remove(); style = null; if (chipHook.fn) chipHook.fn = null; },
  };
}
