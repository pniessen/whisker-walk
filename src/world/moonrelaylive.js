// =============================================================================
// THE MOON'S RELAY ARC ON A WALK (milestone M3). Once Earth has answered (moon step 8 or more; before that nothing of this is drawn, offered or solid) Pip hears faint beeps (journal
// page mnsignal) and three little relay parts lie about: at the far end of the sled lane, inside the station and at the foot of Earthrise Rock. The action button beside one is "Pick up the
// relay part": it is fitted at once (saved: state.moon.relay bits 0-2, any order; nothing is carried, so nothing is ever left behind or lost). With all three, the station's console offers
// "Wake the station" (bit 3). Then "Listen for the far station" at the listening post by Earthrise Rock (bit 4): the far station answers, 40 paws once (moonrelay) and the Signal Tag is hers
// (put on if her collar is bare; the save's own prize path owns it from then on). Never a timer, a fail or a way to be stuck. A step done by a room partner ('relay-part', 'relay-wake',
// 'relay-answer') is credited on this save too (each pays its own); hers go to the room by `send`. One slot of the Moon's prompt arbiter (after the launch, before the rover's offer).
// The rules are world/moonrelayplan.js. Draws no random number and reads no clock (the walk's dt only); reduced motion holds the parts still and the lamp steady.
// =============================================================================
import * as THREE from 'three';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import { moonY } from './moonplan.js';
import { moonMaterials } from './moonparts.js';
import * as R from './moonrelayplan.js';
import { drawPart, drawPost } from './moonrelayparts.js';
import './moonrelaywords.js';

export const BOB = Object.freeze({ amp: 0.06, speed: 1.6, spin: 0.7, lift: 0.12 });
export const DRAW_NEAR = 45; // m: the parts and the post farther than this from her are not drawn
const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** createRelayLive({ scene, reducedMotion, tier, colliders, spot, audio, log, send }) -> { group, promptAt, interact, credit, frame, state, dispose }. */
export function createRelayLive(ctx) {
  const { scene, reducedMotion = false, audio = null, log = null } = ctx;
  const send = typeof ctx.send === 'function' ? ctx.send : () => {};
  const lite = ctx.tier?.shadows === false;
  const colliders = ctx.colliders ?? [];
  const M = moonMaterials();
  const group = new THREE.Group();
  group.name = 'moon:relayarc';
  const parts = R.PARTS.map((p) => { const g = drawPart(M, { lite }); g.name = `moon:relaypart${p.id}`; g.visible = false; group.add(g); return g; });
  const post = drawPost(M, { lite });
  post.group.visible = false;
  if (post.lamp) post.lamp.visible = false;
  group.add(post.group);
  scene.add(group);

  const postCol = { ...R.POST_COLLIDER };
  let ground = null;
  let progression = null;
  let clock = 0;
  let wasOpen = false;
  let heard = false; // the beeps' line is said once a walk
  let fitted = false; // the journal's relay page is counted once a walk
  let want = null;
  let solid = false;
  let disposed = false;
  const gy = (x, z) => (ground ? ground.y(x, z) : moonY(x, z));
  const moon = () => progression?.state?.moon ?? null;
  const view = { type: 'mnrelay', label: phrase('moon.ws.relay.photo'), pos: new THREE.Vector3(R.POST.x, 0, R.POST.z), range: 9 };
  const sight = (id) => { try { progression?.recordSighting?.(id); } catch { /* a stand-in save */ } };

  const setSolid = (on) => {
    const i = colliders.indexOf(postCol);
    if (on && i < 0) colliders.push(postCol); else if (!on && i >= 0) colliders.splice(i, 1);
    solid = on;
  };

  function commit(relay) {
    const pr = progression;
    if (!pr?.state) return;
    pr.state.moon = { ...(pr.state.moon ?? {}), relay };
    pr.addPoints?.(0); // the save's own "persist now": it adds nothing
  }
  function celebrate(effect, { remote = false } = {}) {
    const m = moon();
    const n = R.partsIn(m);
    if (effect === 'part') say('moon-relay-part', phrase('moon.ws.relay.got', n));
    else if (effect === 'ready') say('moon-relay-ready', phrase('moon.ws.relay.ready'));
    else if (effect === 'wake') { audio?.chime?.(); say('moon-relay-awake', phrase('moon.ws.relay.awake')); }
    else if (effect === 'answer') {
      const st = progression?.state;
      if (st?.unlocked?.accessories && !st.unlocked.accessories.includes(R.PRIZE_ID)) st.unlocked.accessories.push(R.PRIZE_ID);
      if (st?.equipped && st.equipped.collar == null) st.equipped.collar = R.PRIZE_ID;
      if (log) log.awardOnce('moonrelay', 'moon-relay', phrase('moon.ws.relay.pay'));
      audio?.chime?.();
      say('moon-relay-answer', phrase('moon.ws.relay.answer'));
    }
    if (effect === 'part' || effect === 'ready') { if (!fitted) { fitted = true; sight('mnrelay'); } }
    if (remote) say('moon-relay-friend', phrase('moon.ws.relay.friend'));
    refresh();
  }
  function perform(ev) {
    const r = R.apply(moon(), ev);
    if (!r.changed) return null;
    commit(r.relay);
    celebrate(r.effect);
    send(ev.kind === 'part' ? { kind: 'relay-part', part: ev.part } : { kind: `relay-${ev.kind}` });
    return r.effect;
  }

  function decide(catPos) {
    const m = moon();
    if (disposed || !catPos || !R.isOpen(m)) return null;
    for (const p of R.PARTS) if (!R.hasPart(m, p.id) && dist(catPos, p) <= p.reach) return { kind: 'part', part: p.id, line: phrase('moon.ws.relay.take') };
    if (R.allParts(m) && !R.awake(m) && dist(catPos, R.WAKE) <= R.WAKE.reach) return { kind: 'wake', line: phrase('moon.ws.relay.wake') };
    if (R.awake(m) && !R.answered(m) && dist(catPos, R.POST) <= R.POST.reach) return { kind: 'answer', line: phrase('moon.ws.relay.listen') };
    return null;
  }

  // what is shown: a part until it is fitted, the post once the arc is open (its lamp once the station is awake); the post is solid only while it is shown
  function refresh() {
    const m = moon();
    const open = R.isOpen(m);
    R.PARTS.forEach((p, i) => { parts[i].visible = open && !R.hasPart(m, p.id) && parts[i].userData.near !== false; });
    post.group.visible = open && post.group.userData.near !== false;
    if (post.lamp) post.lamp.visible = open && R.awake(m);
    if (open !== solid) setSolid(open);
    if (open && !wasOpen) { ctx.spot?.push(view); }
    if (!open && wasOpen) { const i = ctx.spot?.indexOf(view) ?? -1; if (i >= 0) ctx.spot.splice(i, 1); }
    wasOpen = open;
  }

  const api = {
    group,
    spotView: view,
    get state() { const m = moon(); return { open: R.isOpen(m), relay: R.bitsOf(m), parts: R.partsIn(m), awake: R.awake(m), answered: R.answered(m), solid }; },
    promptAt(catPos) {
      want = decide(catPos);
      return want ? want.line : null;
    },
    interact() {
      const w = want;
      want = null;
      if (!w) return null;
      return perform(w.kind === 'part' ? { kind: 'part', part: w.part } : { kind: w.kind }) ? w.kind : null;
    },
    /** A step another cat in the room did ('relay-part', 'relay-wake', 'relay-answer'): the same rules, her own save follows. */
    credit(ev) {
      const r = R.credit(moon(), ev);
      if (!r.changed) return null;
      commit(r.relay);
      celebrate(r.effect, { remote: true });
      return r.effect;
    },
    /** The area life's own frame (the station's slot): the walk's ground, the camera's cat and the save. */
    frame(dt, t, catPos, cam, session, prog) {
      clock += dt > 0 ? dt : 0;
      progression = prog ?? progression;
      if (session?.ground && !ground) ground = session.ground;
      refresh();
      if (!wasOpen) return;
      if (!heard && !R.answered(moon())) { heard = true; say('moon-relay-beep', phrase('moon.ws.relay.beep')); sight('mnsignal'); }
      const near = (o, x, z) => { o.userData.near = !catPos || Math.hypot(catPos.x - x, catPos.z - z) <= DRAW_NEAR; };
      R.PARTS.forEach((p, i) => {
        near(parts[i], p.x, p.z);
        const g = parts[i];
        const bob = reducedMotion ? 0 : BOB.amp * Math.sin(clock * BOB.speed + i * 2.1);
        g.position.set(p.x, gy(p.x, p.z) + BOB.lift + bob, p.z);
        g.rotation.y = reducedMotion ? i : clock * BOB.spin + i * 2.1;
      });
      near(post.group, R.POST.x, R.POST.z);
      post.group.position.set(R.POST.x, gy(R.POST.x, R.POST.z), R.POST.z);
      view.pos.set(R.POST.x, gy(R.POST.x, R.POST.z) + 1.0, R.POST.z);
      if (post.lamp) post.lamp.visible = R.awake(moon()) && post.group.userData.near;
      refresh();
    },
    dispose() {
      disposed = true;
      setSolid(false);
      const i = ctx.spot?.indexOf(view) ?? -1;
      if (i >= 0) ctx.spot.splice(i, 1);
      scene.remove(group);
      group.traverse((o) => { o.geometry?.dispose?.(); });
      for (const m of Object.values(M)) m.dispose?.();
    },
  };
  return api;
}
