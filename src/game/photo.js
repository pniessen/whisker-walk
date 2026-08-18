// Photo mode (the C-key camera), lifted out of main.js's init() closure.
//
// Both functions already took the live session `s` as their first argument,
// so this is a straight lift; the factory only makes the renderer/camera/
// album/audio dependencies explicit. renderFrame is injected rather than
// imported because snapPhoto needs the SAME composer-aware frame the render
// loop draws — the thumbnail is grabbed straight off renderer.domElement
// right after it, so a plain renderer.render() here would read back an
// un-bloomed frame on the high tier.

import * as THREE from 'three';
import { labelFor } from './labels.js';

export function createPhotoMode({ renderer, camera, player, album, hud, log, audio, renderFrame, noteGoal }) {
  function findPhotoSubject(s) {
    const candidates = [];
    for (const c of s.critters.list) {
      if (c.spottable && !c.fleeing) candidates.push({ key: `critter-${c.type}`, label: labelFor(c.type), pos: c.group.position });
    }
    for (const st of s.strayCats.strays) candidates.push({ key: 'stray', label: 'a stray cat', pos: st.group.position });
    for (const r of s.remotes.list) candidates.push({ key: 'friend-pet', label: r.petName, pos: r.group.position });
    for (const g of s.ghosts.list) candidates.push({ key: 'friend-pet', label: g.petName, pos: g.group.position });
    for (const sec of s.secrets?.list ?? []) {
      if (sec.group.visible) candidates.push({ key: sec.key, label: sec.label, pos: sec.group.position });
    }
    if (s.activeMoment) {
      candidates.push({ key: `moment-${s.activeMoment.m.id}`, label: s.activeMoment.m.label, pos: new THREE.Vector3(s.activeMoment.m.x, 0, s.activeMoment.m.z) });
    }
    for (const sc of s.areaData.scenics) candidates.push({ key: `scenic-${sc.id}`, label: sc.label, pos: new THREE.Vector3(sc.x, 0, sc.z) });
    let best = null;
    let bestDot = 0.75;
    for (const c of candidates) {
      const to = c.pos.clone().sub(camera.position).setY(0);
      if (to.length() > 12) continue;
      const dot = to.normalize().dot(player.forward());
      if (dot > bestDot) { bestDot = dot; best = c; }
    }
    return best;
  }

  function snapPhoto(s) {
    audio.shutter();
    const subject = findPhotoSubject(s);
    if (!subject) {
      hud.toast('Just scenery… get closer to something!');
      return;
    }
    renderFrame();
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 160;
    thumbCanvas.height = 120;
    thumbCanvas.getContext('2d').drawImage(renderer.domElement, 0, 0, 160, 120);
    const first = album.add({
      key: subject.key, label: subject.label, area: s.areaData.name,
      thumb: thumbCanvas.toDataURL('image/jpeg', 0.6),
      date: new Date().toISOString().slice(0, 10),
    });
    hud.toast(`📸 ${subject.label}`);
    if (first) log.awardOnce('photo', `photo-${subject.key}`, `your first photo of ${subject.label}`);
    else noteGoal('photo');
  }

  return { findPhotoSubject, snapPhoto };
}
