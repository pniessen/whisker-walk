// =============================================================================
// THE OLD HOUSE: BEAUTY PASS 4 (2026-11-28), STORIES IN THE DETAILS, SEASONS AND SURPRISES. Still no new mesh, triangle, light or texture: the family who lived here is painted
// onto the surfaces the house already has, in the house material's fragment shader (houseglow.js adds `STORY_FUNCS` to its patch), by world position:
//   * a family's marks: height marks pencilled on two doorframes, a half-finished jigsaw on the kitchen table, a knitting basket by the library's armchair, the parlour cushion's
//     fur and paw dents, muddy boots and a trail of prints by the front door, a child's crayon drawings on the pantry, a lighthouse travel poster in the attic, an open book and a
//     cup ring on the library desk, a music box on the parlour's side table and a little cuckoo-clock gable over the kitchen clock;
//   * the SEASON by the date (seasonOf): spring flowers, sunflowers, autumn leaves and a pumpkin in the hall's vase spot, leaves at the door in autumn, a straw hat or a scarf on
//     the hall bench, a plaid blanket on the library chair in the cold months, a garland with twinkling lights on the parlour mantel and frost on the panes in winter, a seasonal
//     tone on the whole house, and the curtains breathing a little more in the warm months;
//   * RARE SURPRISES (createSurprises): about one every few minutes, where she happens to be: the music box plays a few soft notes by itself and glows; the kitchen's cuckoo peeks
//     out and calls; a warm, translucent cat of the old house sits on the big stair a while and fades (a pooled sprite, added to the scene only while it shows).
// Reduced motion holds the shader's clock (uTime 0) and the sprite still; LITE leaves the ghost out. Surprises are seeded by the date (no random draws); audio calls are all
// optional-safe (audio?.tick?.() style). Pure helpers so tests read them without a renderer.
// =============================================================================

import * as THREE from 'three';
import { hash01 } from './builder.js';

export const SEASONS = Object.freeze(['winter', 'spring', 'summer', 'autumn']);
// seasonOf(date) -> 0 winter (Dec-Feb), 1 spring (Mar-May), 2 summer (Jun-Aug), 3 autumn (Sep-Nov). Pure.
export function seasonOf(date) {
  const m = date.getMonth();
  return m === 11 || m < 2 ? 0 : m < 5 ? 1 : m < 8 ? 2 : 3;
}
// The house's tone by season (a multiply on the day's tone) and how much its curtains breathe (windows open in the warm months).
export const SEASON_TONE = Object.freeze([[0.95, 1.0, 1.07], [0.99, 1.04, 1.0], [1.06, 1.04, 0.96], [1.04, 0.99, 0.9]]);
export const SEASON_BREEZE = Object.freeze([0.8, 1.5, 1.9, 1.0]);

// Where the surprises happen: the parlour's side table (the music box), the kitchen's wall clock (the cuckoo), the big stair (the ghost cat).
export const SURPRISE_AT = Object.freeze({
  box: Object.freeze({ x: 10.5, y: 0.66, z: 7.0 }),
  cuckoo: Object.freeze({ x: 9.0, y: 2.62, z: -7.9 }),
  stair: Object.freeze({ x: 0.9, z: -0.3 }),
});
export const SURPRISE_S = Object.freeze({ box: 10, cuckoo: 6, ghost: 11 });
export const SURPRISE_FIRST = 40; // s into the visit before the first roll
export const SURPRISE_EVERY = 70; // s between rolls
export const SURPRISE_P = 0.35; // the chance each roll
// the music box's lullaby: freq (Hz), seconds from the start
export const BOX_TUNE = Object.freeze([[523.25, 0.2], [659.25, 0.9], [783.99, 1.6], [659.25, 2.3], [587.33, 3.1], [698.46, 3.8], [880, 4.5], [783.99, 5.4]].map(([freq, at]) => Object.freeze({ freq, at })));

const R = (x0, x1, z0, z1) => (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
const inParlour = R(4, 14, 2, 12);
const inKitchen = R(4, 14, -8, 2);

// Which surprise can happen where she is (cat { x, y, z }): music box in the parlour, cuckoo in the kitchen, the ghost on or near the big stair. Pure.
export function surpriseFor(cat) {
  if (cat.y < 1.2 && inParlour(cat.x, cat.z)) return 'box';
  if (cat.y < 1.2 && inKitchen(cat.x, cat.z)) return 'cuckoo';
  if (cat.y < 3.5 && cat.y > -0.5 && Math.hypot(cat.x - SURPRISE_AT.stair.x, cat.z - SURPRISE_AT.stair.z) < 8) return 'ghost';
  return null;
}
// Whether the roll at `slot` (0, 1, ...) of the day (an integer key) comes up. Pure.
export function surpriseRoll(dayKey, slot) { return hash01(dayKey, slot, 0x5e1f) < SURPRISE_P; }

// The sitting cat of the old house, drawn once on a canvas: a warm gold glow in the shape of a cat with two soft eyes.
function ghostTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,214,140,0.8)';
  g.shadowColor = 'rgba(255,210,140,1)';
  g.shadowBlur = 14;
  g.beginPath();
  g.ellipse(64, 116, 34, 36, 0, 0, 6.3);
  g.ellipse(64, 66, 22, 20, 0, 0, 6.3);
  g.moveTo(45, 58); g.lineTo(48, 34); g.lineTo(62, 49);
  g.moveTo(83, 58); g.lineTo(80, 34); g.lineTo(66, 49);
  g.fill();
  g.fillStyle = '#fffbe8';
  g.fillRect(52, 62, 6, 8);
  g.fillRect(70, 62, 6, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// createSurprises({ scene, audio, reducedMotion, low, dayKey, floorY }) -> { out { box, cuckoo }, start(name, age), update(dt, cat, full), dispose }
// `out.box` and `out.cuckoo` are 0..1 (the shader's uBox and uCuckoo); the ghost is a sprite in the scene only while it shows. Nothing is allocated per frame.
export function createSurprises({ scene, audio = null, reducedMotion = false, low = false, dayKey = 0, floorY = null } = {}) {
  let t = 0, slot = 0, nextRoll = SURPRISE_FIRST, want = false, name = null, age = 0, call = 0, sprite = null;
  const out = { box: 0, cuckoo: 0 };
  const sy = () => (floorY ? floorY(SURPRISE_AT.stair.x, SURPRISE_AT.stair.z) : 0) + 0.7;
  const fin = (a, d, i, o) => Math.max(0, Math.min(1, a / i, (d - a) / o));
  const calls = [{ freq: 783.99, at: 0, dur: 0.22 }, { freq: 622.25, at: 0.3, dur: 0.3 }];
  const end = () => { if (sprite) scene.remove(sprite); name = null; out.box = out.cuckoo = 0; };

  function start(which, a0 = 0) {
    if (name || !which || (which === 'ghost' && low)) return false; // one at a time; LITE draws no ghost
    if (which === 'ghost' && !sprite) {
      try {
        sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: ghostTexture(), color: 0xffe6b0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
        sprite.scale.set(1.75, 2.15, 1); // pass 5: bigger, so she sees it at play distance
        sprite.userData.noCast = sprite.userData.noMerge = true;
      } catch (e) { sprite = null; return false; }
    }
    name = which; age = a0; call = 0;
    if (which === 'box') audio?.playTune?.(BOX_TUNE.filter((n) => n.at >= a0).map((n) => ({ ...n, at: n.at - a0, dur: 0.9 })), 0.5);
    if (which === 'ghost') { sprite.position.set(SURPRISE_AT.stair.x, sy(), SURPRISE_AT.stair.z); sprite.material.opacity = 0; scene.add(sprite); }
    return true;
  }

  return {
    out,
    start,
    get active() { return name; },
    update(dt, cat, full = null) {
      if (!(dt > 0)) return out;
      t += dt;
      if (!name) {
        if (t >= nextRoll) { nextRoll += SURPRISE_EVERY; if (surpriseRoll(dayKey, slot++)) want = true; }
        if (want) { const which = cat ? surpriseFor(cat) : null; if (which && start(which)) want = false; } // a rolled surprise waits until she is somewhere it can happen
        return out;
      }
      age += dt;
      const dur = SURPRISE_S[name];
      if (age >= dur) { end(); return out; }
      if (name === 'box') out.box = fin(age, dur, 1.2, 2.5);
      else if (name === 'cuckoo') {
        out.cuckoo = fin(age, dur, 0.35, 0.5);
        if (call === 0 && age > 0.4) { call = 1; audio?.chime?.(); }
        if (call === 1 && age > 0.9) { call = 2; audio?.playTune?.(calls, 0.45); }
        if (call === 2 && age > 2.4) { call = 3; audio?.playTune?.(calls, 0.35); }
      } else if (sprite) {
        // she shies kindly: near it, it fades sooner
        const shy = cat && Math.hypot(cat.x - SURPRISE_AT.stair.x, cat.z - SURPRISE_AT.stair.z) < 1.1 ? 0.35 : 1;
        sprite.visible = !full || (full.has('ground') && full.has('upstairs'));
        sprite.material.opacity = 0.85 * fin(age, dur, 2.4, 3) * shy * (reducedMotion ? 1 : 0.88 + 0.12 * Math.sin(age * 2.1));
        sprite.position.y = sy() + (reducedMotion ? 0 : 0.03 * Math.sin(age * 1.3));
      }
      return out;
    },
    dispose() { end(); if (sprite) { sprite.material.map?.dispose?.(); sprite.material.dispose(); sprite = null; } },
  };
}

// -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
// The shader: shapes in world metres. uSeason 0..3 (winter..autumn), uBox / uCuckoo 0..1 (the surprises). Each story tests its own box first, so a fragment far from all of them
// costs a handful of compares. Written compactly on purpose (the shader text ships in the house chunk): B box, D disc, L line, E ellipse, H hash, M mix-in; p is the world point.
export const STORY_FUNCS = `
float B(vec2 q,vec2 c,vec2 h){vec2 d=abs(q-c)-h;return 1.-smoothstep(-.003,.007,max(d.x,d.y));}
float D(vec2 q,vec2 c,float r){return 1.-smoothstep(r-.01,r+.004,length(q-c));}
float L(vec2 q,vec2 a,vec2 b,float w){vec2 p=q-a,d=b-a;return 1.-smoothstep(w*.5,w,length(p-d*clamp(dot(p,d)/dot(d,d),0.,1.)));}
float E(vec2 q,vec2 c,vec2 r,float t){vec2 d=q-c;float s=sin(t),k=cos(t);return 1.-smoothstep(.82,1.,length(vec2(d.x*k+d.y*s,-d.x*s+d.y*k)/r));}
float H(float n){return fract(sin(n*91.7+13.1)*43758.5);}
vec3 M(vec3 c,vec3 k,float a){return mix(c,k,clamp(a,0.,1.));}
vec3 stories(vec3 c,vec3 p,vec3 n,float S,float bx,float ck,float tm){
bool up=n.y>.7;
vec2 q=p.xz;
vec2 hm=vec2(-1.);
if(abs(n.z)>.7&&abs(p.z-2.)<.3&&p.x>10.1&&p.x<10.7)hm=vec2(p.x-10.17,p.y);
else if(abs(n.x)>.7&&abs(p.x-4.)<.3&&p.z>8.1&&p.z<8.7)hm=vec2(p.z-8.17,p.y);
if(hm.x>-.02&&hm.x<.4&&hm.y>.3&&hm.y<1.5)for(int i=0;i<7;i++){float f=float(i),l=.2+.07*H(f+4.);c=M(c,mod(f,2.)<.5?vec3(.8,.16,.14):vec3(.14,.3,.75),B(hm,vec2(l*.5,.44+.135*f+.012*H(f)),vec2(l*.5,.013))*.9);}
if(up&&abs(p.y-.76)<.03&&p.x>8.3&&p.x<9.3&&q.y>-3.65&&q.y<-2.8){
vec2 g=(q-vec2(8.4,-3.55))/vec2(.11,.1),i=floor(g),f=fract(g);
if(i.x>=0.&&i.x<5.&&i.y>=0.&&i.y<4.){float h=H(i.x*7.+i.y*3.+2.),e=min(min(f.x,1.-f.x),min(f.y,1.-f.y));
float gap=(i.y>1.5&&h>.5)||(i.x>3.5&&i.y>.5&&h>.2)?1.:0.;
vec3 k=i.y<.5?vec3(.45,.72,.95):i.y<1.5?vec3(.36,.66,.3):i.y<2.5?mix(vec3(.9,.3,.25),vec3(.95,.8,.25),step(.5,h)):vec3(.55,.38,.22);
c=M(c,k*(1.-.45*(1.-smoothstep(.03,.1,e))),(1.-gap)*.95);}
c=M(c,vec3(.9,.3,.25),B(q,vec2(9.1,-3.45),vec2(.04,.035)));c=M(c,vec3(.45,.72,.95),B(q,vec2(9.2,-3.2),vec2(.04,.035)));c=M(c,vec3(.95,.8,.25),B(q,vec2(9.02,-3.),vec2(.04,.035)));}
if(up&&p.y<.06&&p.z>8.4&&p.z<11.9&&abs(p.x)<1.4){
c=M(c,vec3(.16,.3,.2),clamp(E(q,vec2(-.95,11.4),vec2(.2,.095),.25)+E(q,vec2(-.7,11.48),vec2(.2,.095),-.1)+D(q,vec2(-1.06,11.37),.06)+D(q,vec2(-.81,11.48),.06),0.,1.));
for(int i=0;i<6;i++){float f=float(i),s=mod(f,2.)<.5?-1.:1.;vec2 e=vec2(.17*s+.05*sin(f),11.1-.42*f);c=M(c,vec3(.3,.19,.1),clamp(E(q,e,vec2(.07,.125),.15*s)+E(q,e-vec2(0.,.16),vec2(.058),0.),0.,1.)*.95*(1.-f/6.5));}}
if(n.x<-.7&&p.x>13.3&&p.x<13.5&&q.y>-2.15&&q.y<-1.05&&p.y>.95&&p.y<1.75){vec2 u=vec2(p.z,p.y);
float a=B(u,vec2(-1.85,1.5),vec2(.115,.14)),b=B(u,vec2(-1.55,1.25),vec2(.13,.11)),d=B(u,vec2(-1.28,1.48),vec2(.1,.13));
c=M(c,vec3(.97,.95,.88),a);c=M(c,vec3(.85,.3,.25),B(u,vec2(-1.85,1.47),vec2(.06,.045))*a);c=M(c,vec3(.98,.8,.2),D(u,vec2(-1.78,1.62),.03)*a);
c=M(c,vec3(1.,.93,.6),b);c=M(c,vec3(.9,.5,.15),D(u,vec2(-1.55,1.24),.05)*b);
c=M(c,vec3(.74,.86,.97),d);c=M(c,vec3(.9,.3,.3),(1.-smoothstep(.01,.02,abs(length(u-vec2(-1.28,1.41))-.055)))*step(1.41,u.y)*d);}
if(n.z>.7&&p.z<-15.5&&p.x>-17.5&&p.x<-16.3&&p.y>5.5&&p.y<6.35){vec2 u=p.xy,d=abs(u-vec2(-16.9,5.92))-vec2(.5,.38);float m=max(d.x,d.y),y=u.y;
vec3 k=mix(vec3(.98,.72,.5),vec3(.4,.62,.88),clamp((y-5.8)/.5,0.,1.));
k=mix(k,vec3(.16,.46,.58),step(y,5.72));
k=M(k,mod(floor((y-5.72)/.045),2.)<.5?vec3(.9,.2,.18):vec3(.97,.96,.92),step(abs(u.x+16.9),.045-(y-5.72)*.03)*step(5.72,y)*step(y,6.05));
k=M(k,vec3(1.,.92,.5),L(u,vec2(-16.9,6.08),vec2(-16.5,6.12),.05)*.8);
c=M(c,vec3(.96,.93,.84),step(-.035,m)*step(m,0.));c=M(c,k,step(m,-.035));}
if(up&&abs(p.y-.62)<.04&&abs(p.x-10.5)<.26&&abs(p.z-7.)<.26){vec2 d=q-vec2(10.5,7.);
c=M(c,vec3(.85,.65,.25),B(d,vec2(0.),vec2(.15,.105)));c=M(c,mix(vec3(.5,.22,.16),vec3(1.,.85,.5),bx*.95),B(d,vec2(0.),vec2(.13,.085)));
c=M(c,vec3(.95,.5,.65),D(d,vec2(0.,.016),.012)*bx);}
if(n.z>.7&&p.z<-7.5&&abs(p.x-9.)<.2&&p.y>2.5&&p.y<2.85){vec2 d=vec2(p.x-9.,p.y-2.62);
c=M(c,vec3(.42,.26,.14),step(abs(d.x),.16-(d.y-.02)*.55)*step(.02,d.y)*step(d.y,.22));c=M(c,vec3(.62,.42,.22),B(d,vec2(0.,-.065),vec2(.15,.085)));
float o=B(d,vec2(0.,-.045),vec2(.045,.05));c=M(c,vec3(.16,.1,.07),o);vec2 b=d-vec2(0.,-.035+.035*ck);
c=M(c,vec3(.97,.82,.25),(D(b,vec2(0.),.035)+D(b,vec2(0.,.04),.026))*ck*o);c=M(c,vec3(.95,.5,.15),B(b,vec2(.045,.038),vec2(.02,.007))*ck*o);}
if(n.z<-.7&&p.z>11.6&&abs(p.x)<.4&&p.y>1.2&&p.y<2.1){vec2 d=vec2(p.x,p.y-1.62);float r=length(d),a=atan(d.y,d.x)*1.9099,k=floor(a+6.),rg=1.-smoothstep(.04,.07,abs(r-.23));vec2 f=vec2(fract(a)-.5,(r-.23)*7.);
c=M(c,vec3(.2,.45,.2)*(.75+.25*sin(a*12.)),rg*.95);
c=M(c,S<.5?vec3(.82,.12,.14):S<1.5?mix(vec3(.97,.6,.72),vec3(.98,.97,.9),step(.5,H(k))):S<2.5?vec3(.98,.78,.1):mix(vec3(.88,.4,.08),vec3(.72,.15,.1),step(.5,H(k+3.))),
(1.-smoothstep(.2,.45,length(f)))*rg);
if(S<.5)c=M(c,vec3(.8,.1,.12),(B(d,vec2(0.,-.23),vec2(.07,.04))+L(d,vec2(0.,-.23),vec2(-.08,-.34),.03)+L(d,vec2(0.,-.23),vec2(.08,-.34),.03)));}
if(S>2.5&&up&&p.y<.06){if(abs(p.x-1.7)<.3&&abs(p.z-11.45)<.3){vec2 d=q-vec2(1.7,11.45);c=M(c,vec3(.92,.45,.08)*(.86+.14*sin(d.x*52.)),E(d,vec2(0.),vec2(.14,.11),0.));c=M(c,vec3(.25,.4,.15),B(d,vec2(0.,-.01),vec2(.015,.02)));}
if(p.z>9.9&&p.z<12.&&abs(p.x)<1.9){vec2 cl=floor(q*5.);float a=H(cl.x*3.1+cl.y*7.7),b=H(cl.x*5.3-cl.y*2.9+1.);
if(a+b*.4<(smoothstep(9.9,11.9,p.z)*.8+.1)*1.15)c=M(c,b<.5?vec3(.78,.25,.1):vec3(.92,.6,.1),E(q,(cl+vec2(.25+.5*a,.25+.5*b))/5.,vec2(.065,.032),a*6.28)*.95);}}
if(S<.5&&n.x<-.7&&abs(p.x-13.46)<.1&&q.y>6.05&&q.y<7.95&&p.y>1.&&p.y<1.31){float sw=1.22-.05*(1.-cos(mod(p.z-6.05,.95)/.95*6.2832)),bd=1.-smoothstep(.03,.055,abs(p.y-sw));
c=M(c,vec3(.14,.42,.18)*(.7+.3*sin(p.z*70.+p.y*40.)),bd*.97);c=M(c,vec3(.84,.12,.14),D(vec2(fract(p.z*7.)-.5,(p.y-sw)*7.),vec2(0.),.3)*step(.4,H(floor(p.z*7.)+5.))*bd);}
return c;}
vec3 storiesGlow(vec3 b,vec3 p,vec3 n,float S,float bx,float tm){vec3 a=vec3(0.);
if(bx>0.){vec3 d=p-vec3(10.5,.7,7.);float f=clamp(1.-dot(d,d),0.,1.);a+=(b+vec3(.12,.08,.02))*vec3(1.,.82,.5)*f*f*bx*1.6;vec2 s=floor((p.xz-vec2(10.5,7.))*14.);a+=vec3(1.,.9,.55)*step(.93,H(s.x*3.+s.y*7.+floor(tm*1.7+s.x)))*f*bx*step(.7,n.y);}
if(S<.5&&n.x<-.7&&abs(p.x-13.46)<.1&&p.z>6.05&&p.z<7.95&&p.y>1.&&p.y<1.31){float sw=1.22-.05*(1.-cos(mod(p.z-6.05,.95)/.95*6.2832)),li=floor(p.z*7.);
a+=mix(vec3(1.,.75,.3),vec3(1.,.45,.35),step(.5,H(li+2.)))*(1.-smoothstep(.12,.34,length(vec2(fract(p.z*7.)-.5,(p.y-sw)*7.+.2))))*step(.45,H(li*1.3))*(.55+.45*sin(tm*2.+li*1.7));}
return a;}
`;
