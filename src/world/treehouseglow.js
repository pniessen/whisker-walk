// =============================================================================
// THE TREEHOUSE VILLAGE: BEAUTY PASS 2 (2026-11-28), colour, light and wind with NO new geometry. The village's two lit materials ('paint' and 'leaves', the merged buckets) get a
// small shader patch, so every plank, wall and leaf already in the picture changes:
//   * LAMP POOLS: warm light pooled on whatever is near the lanterns and the lit windows (an emissive add, the surface's own colour times a warm tone, fading with distance and with
//     facing away); the six lamps nearest the cat are the live ones (four on LOW, three on LITE), so it costs one short loop and never a real light;
//   * GOLDEN HOUR: a warm lean on every surface, a touch more on the leaves;
//   * AUTUMN POPS: slow patches of gold and copper through the leaves that stand above the walk (the canopy and the tall trees), in the one leaves mesh;
//   * GUSTS: the leaves above 3 m sway on one shared time uniform with a slow gust envelope (reduced motion and LITE hold them still; the paint never moves: no collider, perch or shadow
//     mismatch).
//
// BEAUTY PASS 3 (2026-11-28), the village reacts to the cat and lives, still all in these two shaders and their uniforms:
//   * FLEX: the boards within a few metres of her feet ride a soft ripple (the planks and bridge boards give a little under her, harder after a landing, a faint creak of travelling waves
//     while she walks); LEAVES near her shiver as she brushes the boughs, hard after a landing;
//   * GUST WAVES: a travelling front crosses the canopy, bending the leaves further and lightening them as it passes;
//   * CLOUD SHADE: a slow drifting patch of cloud shadow over every surface that faces up; FLOOR MIST: a low pale haze round the stilts, trunk feet and the undersides of the decks;
//   * LAMP SWING: the lamp pools sway when she passes close (the lanterns' light swings with them);
//   * LANDINGS: `sky.reaction` says when she has just landed from a drop (the life shakes a shower of leaves loose and thumps the boards).
// Reduced motion holds all of it still (uTime 0, no flex, no shiver); LITE keeps the cloud and mist (cheap) but drops the flex, shiver and waves.
//
// BEAUTY PASS 4 (2026-11-28), the year, the stories and the rainbow, still in these shaders:
//   * SEASONS (uSeason, four weights from treehouseseason.js): spring blossom patches on the leaves, summer's deeper greens, autumn deepened (wider gold and copper, crimson in the thick of it), winter frost on every
//     surface that faces up and a pale dusting on the leaves, with glints;
//   * TALES (uDecA/uDecB, treehousetales.js): small painted rectangles in world space (the Bakery's rack of loaves, the Bookshop's spines, the message board, the rug, the quilt, the striped bell rope, the feathers)
//     laid over whatever lies inside them, in the paint, leaves and glow materials (LITE leaves them out);
//   * RAINBOW (uRain, uRainDir): a rare band of colour on the leaves and walls across the camera's view, a ring round a point low in the north (the life raises uRain for a while after rain).
// It adds no mesh, no triangle, no light, no texture. The walk's life (treehouselight.js) drives the uniforms once a frame through `userData.sky.update`; nothing is made per frame.
// A pure list (lampPoints) says where the lamps are; tests read it without THREE.
// =============================================================================

import * as THREE from 'three';
import * as P from './treehouseplan.js';
import { talesPlan, TALE_SLOTS } from './treehousetales.js';

export const LAMP_RADIUS = 4.2; // metres a lantern's pool reaches
export const LAMP_SLOTS = 6; // the shader's lamp array (the live count is lower on LOW and LITE)
export const LIVE = Object.freeze({ high: 6, low: 4, lite: 3 });
export const GUST = Object.freeze({ amp: 0.1, from: 3, to: 9 }); // metres a leaf blob moves at most, and the heights the sway fades in over

// Every lamp: the lanterns hung at the deck corners and the bridge ends (treehouseparts.js lantern()), and the lit windows' spill on the decks.
export function lampPoints() {
  const out = [];
  for (const k of P.DECKS) for (const sx of [-1, 1]) out.push({ x: k.x + (sx * k.w) / 2, y: k.y + P.RAIL_H + 0.7, z: k.z - k.d / 2, w: 1 });
  for (const line of P.BRIDGE_LINES) for (const p of [line[0], line.at(-1)]) out.push({ x: p.x, y: p.y + P.RAIL_H + 0.8, z: p.z, w: 0.9 });
  for (const k of P.DECKS) if (k.hut) out.push({ x: k.hut.x, y: k.y + k.hut.h * 0.55, z: k.hut.z + k.hut.r + 0.5, w: 0.8 });
  return out;
}

export const FLEX = Object.freeze({ dip: 0.12, near: 0.5, far: 3.2, band: 0.9 }); // metres a board gives at most, the ring it gives in, and how far above and below her feet a board still feels her
export const SHIVER = Object.freeze({ reach: 4.5, amp: 0.2 }); // metres a leaf feels her from, and how far it shakes at most
export const LAND = Object.freeze({ minFall: 2.2, fullFall: 6, decay: 3.2, shake: 2.4 }); // m/s of fall that counts as a landing, a hard one, how fast the shock fades (1/s), seconds the leaves keep shivering
const COMMON_VERT = `#include <common>
uniform float uTime;
uniform float uSway;
uniform vec4 uCat;
uniform vec3 uReact;
varying vec3 vTw;
varying vec3 vNw;
varying float vGf;`;
const BEGIN_VERT = (leaves) => `#include <begin_vertex>
{
  vec3 w0 = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vNw = normalize(mat3(modelMatrix) * normal);
  vGf = 0.0;
  ${leaves ? '' : `// FLEX: boards in the ring round her feet and level with them ride a ripple (uReact.x is the flex strength: the walk's, and the landing's)
  float fd = length(w0.xz - uCat.xz);
  float ring = smoothstep(${FLEX.near.toFixed(1)}, ${(FLEX.near + 0.7).toFixed(1)}, fd) * (1.0 - smoothstep(${(FLEX.far - 1.4).toFixed(1)}, ${FLEX.far.toFixed(1)}, fd));
  float lvl = 1.0 - smoothstep(0.25, ${FLEX.band.toFixed(2)}, abs(w0.y - uCat.y));
  transformed.y -= ${FLEX.dip.toFixed(3)} * uReact.x * ring * lvl * (0.55 + 0.45 * sin(uTime * 11.0 - fd * 5.0));`}
  ${leaves ? `float h = smoothstep(${GUST.from.toFixed(1)}, ${GUST.to.toFixed(1)}, w0.y) * uSway;
  float front = pow(0.5 + 0.5 * sin(dot(w0.xz, vec2(0.8, 0.6)) * 0.09 - uTime * 0.7), 3.0) * uSway;
  vGf = front;
  float gust = (0.55 + 0.45 * sin(uTime * 0.31 + w0.x * 0.045 + w0.z * 0.03)) * (1.0 + 1.6 * front);
  float a = sin(uTime * 1.7 + w0.x * 0.6 + w0.z * 0.45 + w0.y * 0.3);
  float b = sin(uTime * 1.13 + w0.z * 0.7 - w0.x * 0.3);
  transformed.x += a * ${GUST.amp.toFixed(2)} * h * gust;
  transformed.z += b * ${GUST.amp.toFixed(2)} * h * gust;
  transformed.y += a * 0.03 * h * gust;
  // SHIVER: leaves near her shake as she brushes them (uReact.y), the harder after a landing
  float sd = length(w0 - uCat.xyz - vec3(0.0, 1.6, 0.0));
  float sh = (1.0 - smoothstep(1.0, ${SHIVER.reach.toFixed(1)}, sd)) * uReact.y * h;
  transformed.x += sin(uTime * 17.0 + w0.z * 2.3 + w0.y) * ${SHIVER.amp.toFixed(2)} * sh;
  transformed.z += sin(uTime * 15.0 + w0.x * 2.1) * ${SHIVER.amp.toFixed(2)} * sh;
  transformed.y += sin(uTime * 13.0 + w0.x + w0.z) * 0.08 * sh;` : ''}
  vTw = (modelMatrix * vec4(transformed, 1.0)).xyz;
}`;
// TALES: each decal is [x, y, z, yaw] and [halfWidth, halfHeight, kind, tolerance] (treehousetales.js KIND); a kind of 10 or more lies flat (its second axis runs along the yaw's normal, the tolerance is in height).
// `tale` answers the colour and cover of the first decal that holds the point, and how much of the colour is its own light (the lantern-lit board).
const TALE_FUNCS = `
uniform float uTale;
uniform vec4 uDecA[${TALE_SLOTS}];
uniform vec4 uDecB[${TALE_SLOTS}];
float th(float n){return fract(sin(n*127.1+31.7)*43758.5453);}
vec3 thue(float h){return clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);}
float tbox(vec2 p,vec2 c,vec2 h){vec2 d=abs(p-c)-h;return step(max(d.x,d.y),0.0);}
float tell(vec2 p,vec2 c,vec2 r){vec2 d=(p-c)/r;return step(dot(d,d),1.0);}
vec4 tale(vec3 wp,out float glow){
glow=0.0;
for(int i=0;i<${TALE_SLOTS};i++){
vec4 A=uDecA[i];vec4 B=uDecB[i];
if(B.z<0.5)continue;
vec3 p=wp-A.xyz;
if(abs(p.x)+abs(p.z)>4.0||abs(p.y)>3.0)continue;
vec2 ax=vec2(cos(A.w),-sin(A.w));vec2 nz=vec2(sin(A.w),cos(A.w));
float u=dot(p.xz,ax);float n=dot(p.xz,nz);
float lay=step(9.5,B.z);
float v=mix(p.y,n,lay);float w=mix(n,p.y,lay);
if(abs(u)>B.x||abs(v)>B.y||abs(w)>B.w)continue;
vec2 q=vec2(u/B.x,v/B.y);
float k=B.z;
vec3 c=vec3(0.0);float a=1.0;
if(k<1.5){
c=vec3(1.0,0.83,0.52);
float wood=max(step(abs(q.x),0.05),step(abs(q.y-0.3),0.045))+step(0.88,max(abs(q.x),abs(q.y)))+tbox(q,vec2(0.0,-0.52),vec2(0.9,0.04));
for(int j=0;j<3;j++){
float cx=-0.55+0.55*float(j);
float lf=tell(q,vec2(cx,-0.34-0.03*float(j==1)),vec2(0.26,0.17));
float score=step(0.72,fract((q.x-cx)*7.0+(q.y+0.34)*2.0));
c=mix(c,mix(vec3(0.8,0.46,0.2),vec3(0.95,0.72,0.38),score*0.7+0.2*(q.y+0.5)),lf);
}
c=mix(c,vec3(0.34,0.21,0.11),clamp(wood,0.0,1.0));
c=mix(c,vec3(0.97,0.95,0.9),step(q.y,-0.8)*step(0.35,th(floor(q.x*26.0)+3.0)));
}else if(k<2.5){
float edge=max(abs(q.x),abs(q.y));
c=mix(vec3(0.96,0.94,0.88),vec3(0.72,0.56,0.36),step(0.93,th(floor(q.x*16.0)+floor(q.y*5.0)*7.0)));
a=0.92*(1.0-smoothstep(0.72+0.2*th(floor(q.x*9.0)),1.0,edge));
}else if(k<3.5){
c=vec3(0.34,0.22,0.13);
float row=step(0.0,q.y);
float yy=row>0.5?(q.y-0.07)/0.83:(q.y+0.9)/0.83;
float idx=floor((q.x+1.0)*6.5);float fx=fract((q.x+1.0)*6.5);
float hgt=0.55+0.4*th(idx+row*13.0);
if(yy>0.0&&yy<hgt&&fx>0.08&&fx<0.92&&abs(q.x)<0.9){
c=thue(th(idx*1.7+row*5.0+0.3))*0.92+0.06;
c=mix(c,vec3(0.96,0.9,0.7),step(0.62,yy)*step(yy,0.7));
}
float plank=max(step(abs(q.y),0.06),max(step(0.91,abs(q.y)),step(0.91,abs(q.x))));
c=mix(c,vec3(0.52,0.35,0.2),plank);
}else if(k<4.5){
c=vec3(0.48,0.35,0.55);
vec2 w2=q+0.03*sin(q.yx*9.0);
float pg=max(tbox(w2,vec2(-0.37,0.0),vec2(0.33,0.58)),tbox(w2,vec2(0.37,0.0),vec2(0.33,0.58)));
c=mix(c,vec3(0.97,0.92,0.78),pg);
c=mix(c,vec3(0.95,0.72,0.2),tell(q,vec2(-0.38,0.1),vec2(0.17,0.3)));
c=mix(c,vec3(0.3,0.62,0.3),tell(q,vec2(0.38,0.0),vec2(0.15,0.34)));
c=mix(c,vec3(0.62,0.16,0.12),step(abs(q.x),0.04)*pg);
c=mix(c,vec3(0.96,0.9,0.76),step(0.9,max(abs(q.x*0.5),abs(q.y))));
}else if(k<5.5){
c=vec3(0.78,0.28,0.23);
c=mix(c,vec3(0.97,0.93,0.8),tbox(q,vec2(0.0,0.0),vec2(0.72,0.56)));
float fl=-0.05+0.62*abs(q.x)/0.72;
c=mix(c,vec3(0.78,0.42,0.3),step(abs(q.y-fl),0.07)*step(abs(q.x),0.72));
c=mix(c,vec3(0.8,0.18,0.18),tell(q,vec2(0.0,-0.05),vec2(0.15,0.2)));
}else if(k<6.5){
float m=max(abs(q.x),abs(q.y));
c=mix(vec3(0.75,0.55,0.34),vec3(0.62,0.45,0.27),step(0.7,th(floor(q.x*40.0)+floor(q.y*40.0)*9.0)));
vec2 cell=floor((q+0.82)/1.64*vec2(4.0,3.0));
vec2 loc=fract((q+0.82)/1.64*vec2(4.0,3.0));
float hh=th(cell.x*7.0+cell.y*3.1);
if(m<0.83&&hh>0.12){
vec3 pc=mix(thue(th(hh*91.0)),vec3(1.0),0.4);
vec2 lo2=loc+(hh-0.5)*0.06;
float paper=tbox(lo2,vec2(0.5),vec2(0.36,0.4));
c=mix(c,pc,paper);
float g=th(hh*53.0);
float glyph=g<0.33?tell(lo2,vec2(0.5,0.45),vec2(0.15)):g<0.66?step(abs(lo2.x-0.5),(0.8-lo2.y)*0.3)*step(0.25,lo2.y):max(tbox(lo2,vec2(0.5,0.45),vec2(0.18,0.04)),tbox(lo2,vec2(0.5,0.45),vec2(0.04,0.18)));
c=mix(c,pc*0.4,glyph*paper);
c=mix(c,vec3(0.85,0.2,0.15),tell(lo2,vec2(0.5,0.86),vec2(0.07,0.06)));
}
c=mix(c,vec3(0.36,0.23,0.12),step(0.88,m));
c*=vec3(1.12,1.0,0.82);
glow=0.32;
}else if(k<7.5){
float st=step(0.5,fract(v*9.0+u*14.0));
c=mix(vec3(0.78,0.2,0.16),vec3(0.95,0.9,0.78),st);
a=1.0-smoothstep(0.7,1.0,abs(q.x));
}else if(k<11.5){
float r=length(q);
float ang=atan(q.y,q.x);
c=r<0.2?vec3(0.92,0.74,0.3):r<0.38?vec3(0.78,0.34,0.4):r<0.56?mix(vec3(0.94,0.9,0.76),vec3(0.8,0.5,0.3),step(0.8,fract(ang*1.9099+0.3))):r<0.74?vec3(0.2,0.5,0.56):r<0.86?vec3(0.72,0.26,0.2):mix(vec3(0.95,0.9,0.78),vec3(0.7,0.3,0.22),step(0.5,fract(ang*5.093)));
a=1.0-step(1.0,r);
}else if(k<12.5){
vec2 g=vec2((q.x+1.0)*1.5,(q.y+1.0)*3.5);
vec2 cell=floor(g);vec2 lc=fract(g);
c=mix(thue(th(cell.x*5.1+cell.y*2.3+1.0)),vec3(1.0),0.28)*(0.82+0.3*mod(cell.x+cell.y,2.0));
c=mix(c,vec3(0.97,0.93,0.82),step(min(min(lc.x,1.0-lc.x),min(lc.y,1.0-lc.y)),0.07));
a=1.0;
}else{
vec2 m=vec2(u,v);
a=0.0;c=vec3(0.9,0.9,0.93);
for(int j=0;j<8;j++){
float t=float(j)/7.0;
vec2 ctr=vec2(mix(-1.4,1.4,t),0.3*sin(t*7.0+1.0)+(th(float(j))-0.5)*0.25);
float rot=th(float(j)+3.0)*6.2832;
vec2 d=m-ctr;d=vec2(d.x*cos(rot)+d.y*sin(rot),-d.x*sin(rot)+d.y*cos(rot));
float f=tell(d,vec2(0.0),vec2(0.18,0.05));
if(f>0.5){a=0.95;c=mix(vec3(0.92,0.92,0.95),vec3(0.58,0.6,0.68),step(0.5,th(float(j)+9.0)));c=mix(c,c*0.6,step(abs(d.y),0.008));}
}
}
return vec4(c,a);
}
return vec4(0.0);
}
`;
const COMMON_FRAG = `#include <common>
uniform vec4 uLamp[${LAMP_SLOTS}];
uniform float uTime;
uniform vec4 uSeason;
uniform float uRain;
uniform vec3 uRainDir;
varying vec3 vTw;
varying vec3 vNw;
varying float vGf;
${TALE_FUNCS}`;
const EMISSIVE_FRAG = (leaves) => `#include <emissivemap_fragment>
{
  vec3 base = diffuseColor.rgb;
  float pool = 0.0;
  for (int i = 0; i < ${LAMP_SLOTS}; i++) {
    vec3 d = vTw - uLamp[i].xyz;
    float a = clamp(1.0 - dot(d, d) / ${(LAMP_RADIUS * LAMP_RADIUS).toFixed(2)}, 0.0, 1.0);
    float f = clamp(dot(normalize(vNw), -normalize(d + vec3(0.0, 0.001, 0.0))) * 0.6 + 0.45, 0.0, 1.0);
    pool += a * a * f * uLamp[i].w;
  }
  totalEmissiveRadiance += (base * 1.1 + vec3(0.05, 0.025, 0.0)) * vec3(1.0, 0.62, 0.26) * pool * 1.5;
  totalEmissiveRadiance += base * talGlow * 0.9; // the lantern-lit board lights itself
  // WINTER GLINTS: tiny frost sparkles on what faces up
  vec2 gp = vTw.xz * 6.0; vec2 gc = floor(gp); float gh = fract(sin(dot(gc, vec2(12.9898, 78.233))) * 43758.5453);
  float gl = step(0.88, gh) * smoothstep(0.3, 0.0, length(fract(gp) - 0.5)) * pow(0.5 + 0.5 * sin(uTime * 2.3 + gh * 80.0), 6.0); // a few round specks at a time, each on its own beat
  totalEmissiveRadiance += vec3(0.8, 0.92, 1.0) * gl * uSeason.w * smoothstep(0.6, 1.0, vNw.y) * 2.2;
  // RAINBOW: a band of colour round a point low in the north (red outside, violet inside), laid over the leaves and walls it crosses
  if (uRain > 0.001) {
    vec3 vdir = normalize(vTw - cameraPosition);
    float ang = degrees(acos(clamp(dot(vdir, uRainDir), -1.0, 1.0)));
    float rt = (ang - 22.0) / 4.0;
    float inb = smoothstep(0.0, 0.14, rt) * (1.0 - smoothstep(0.86, 1.0, rt)) * smoothstep(-0.03, 0.1, vdir.y); // an arch: nothing below the horizon
    totalEmissiveRadiance += thue((1.0 - rt) * 0.78) * inb * uRain * ${leaves ? '0.85' : '0.6'} * (0.75 + 0.25 * sin(uTime * 1.3 + ang * 2.0));
  }
}`;
const COLOR_FRAG = (leaves) => `#include <color_fragment>
float talGlow = 0.0;
{
  diffuseColor.rgb *= mix(vec3(1.0), vec3(${leaves ? '1.12, 1.0, 0.8' : '1.08, 1.0, 0.86'}), 0.55);
  // CLOUD SHADE: a slow patch of shadow drifting over the village (more on what faces up), the gaps between bright and warm
  float cl = sin(vTw.x * 0.075 + uTime * 0.24) * sin(vTw.z * 0.065 - uTime * 0.17 + 1.0) + 0.5 * sin(vTw.x * 0.031 - vTw.z * 0.044 + uTime * 0.09);
  float up = 0.55 + 0.45 * clamp(vNw.y, 0.0, 1.0);
  diffuseColor.rgb *= 1.0 - 0.3 * smoothstep(0.05, 0.85, cl) * up;
  diffuseColor.rgb *= 1.0 + 0.16 * smoothstep(-0.3, -0.9, cl) * up;
  ${leaves ? 'diffuseColor.rgb *= 1.0 + 0.22 * vGf;' : ''}
  float sp = uSeason.x; float su = uSeason.y; float au = uSeason.z; float wi = uSeason.w;
  // THE YEAR: summer deepens the greens, spring freshens them, autumn warms them, winter frosts what faces up
  diffuseColor.rgb *= mix(vec3(1.0), ${leaves ? 'vec3(0.9, 1.1, 0.86)' : 'vec3(1.02, 1.03, 0.96)'}, su * 0.7);
  ${leaves ? 'diffuseColor.rgb *= mix(vec3(1.0), vec3(1.0, 1.08, 0.92), sp * 0.6) * mix(vec3(1.0), vec3(1.1, 0.95, 0.78), au * 0.5);' : ''}
  // FLOOR MIST: a pale haze low round the stilts, trunk feet and the undersides of the decks, thickest on the ground
  float mst = (1.0 - smoothstep(0.0, 1.25, vTw.y)) * (1.0 - 0.85 * clamp(vNw.y, 0.0, 1.0)) * (0.8 + 0.2 * sin(vTw.x * 0.5 + vTw.z * 0.4 + uTime * 0.3));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.8, 0.82), 0.32 * mst);
  ${leaves ? `float n = sin(vTw.x * 0.21 + 1.3) * sin(vTw.z * 0.19 + 0.4) + 0.6 * sin(vTw.x * 0.07 + vTw.z * 0.11);
  float popK = au + 0.2 * wi + 0.08 * su;
  float pop = smoothstep(0.2 - 0.3 * au, 0.7 - 0.25 * au, n) * smoothstep(3.5, 8.0, vTw.y) * min(1.0, popK);
  vec3 fall = mix(vec3(0.95, 0.62, 0.14), vec3(0.82, 0.3, 0.1), smoothstep(-0.3, 0.6, sin(vTw.x * 0.33 - vTw.z * 0.27)));
  fall = mix(fall, vec3(0.62, 0.12, 0.07), au * smoothstep(0.1, 0.7, sin(vTw.x * 0.17 + vTw.z * 0.23)) * 0.8);
  float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
  diffuseColor.rgb = mix(diffuseColor.rgb, fall * (0.5 + lum * 1.4), pop * 0.88);
  float nb = sin(vTw.x * 0.17 + 2.1) * sin(vTw.z * 0.23 + 0.9) + 0.5 * sin(vTw.x * 0.09 - vTw.z * 0.08);
  float bl = smoothstep(0.0, 0.5, nb) * smoothstep(2.5, 7.0, vTw.y) * sp;
  vec3 blos = mix(vec3(1.0, 0.58, 0.74), vec3(1.0, 0.88, 0.92), smoothstep(-0.3, 0.4, sin(vTw.x * 0.4 + vTw.z * 0.3)));
  diffuseColor.rgb = mix(diffuseColor.rgb, blos * (0.85 + lum * 1.2), bl * 0.9);
  float frl = wi * (0.25 + 0.6 * smoothstep(0.3, 0.95, vNw.y)) * (0.55 + 0.45 * sin(vTw.x * 0.2) * sin(vTw.z * 0.17));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.92, 0.97), frl * 0.75);` : `diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.94, 0.98), wi * smoothstep(0.6, 0.95, vNw.y) * 0.85);`}
  if (uTale > 0.5) { vec4 tl = tale(vTw, talGlow); diffuseColor.rgb = mix(diffuseColor.rgb, tl.rgb, tl.a); talGlow *= tl.a; }
}`;

// patch(material, leaves) -> { uTime, uSway, uLamp } uniforms. The two materials share one uniform set (the same objects), so one update drives both.
function patch(material, uniforms, leaves) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', COMMON_VERT).replace('#include <begin_vertex>', BEGIN_VERT(leaves));
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', COMMON_FRAG).replace('#include <color_fragment>', COLOR_FRAG(leaves)).replace('#include <emissivemap_fragment>', EMISSIVE_FRAG(leaves));
  };
  material.customProgramCacheKey = () => (leaves ? 'treehouse-sky-leaves-v3' : 'treehouse-sky-paint-v3');
}
// The lit windows (the glow material, unlit): only the tales are painted on them.
function patchGlow(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTw;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTw = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vTw;\n${TALE_FUNCS}`).replace('#include <color_fragment>', '#include <color_fragment>\n{ float tg = 0.0; if (uTale > 0.5) { vec4 tl = tale(vTw, tg); diffuseColor.rgb = mix(diffuseColor.rgb, tl.rgb, tl.a); } }');
  };
  material.customProgramCacheKey = () => 'treehouse-sky-glow-v3';
}
export const RAIN_DIR = Object.freeze({ x: 0.08, y: -0.26, z: -0.96 }); // where the rainbow's ring is centred (a point low in the north)

// skyPatch(M) patches M.paint and M.leaves and leaves `userData.sky = { update(t, cat, still, rung) }` on each. The lamp vec4s are pre-made (no allocation per frame).
export function skyPatch(M) {
  const decals = talesPlan();
  const decA = Array.from({ length: TALE_SLOTS }, (_, i) => { const d = decals[i]; return d ? new THREE.Vector4(d.x, d.y, d.z, d.yaw) : new THREE.Vector4(0, -100, 0, 0); });
  const decB = Array.from({ length: TALE_SLOTS }, (_, i) => { const d = decals[i]; return d ? new THREE.Vector4(d.hw, d.hh, d.kind, d.tol) : new THREE.Vector4(0, 0, 0, 0); });
  const rd = new THREE.Vector3(RAIN_DIR.x, RAIN_DIR.y, RAIN_DIR.z).normalize();
  const uniforms = { uSeason: { value: new THREE.Vector4(0, 0, 1, 0) }, uRain: { value: 0 }, uRainDir: { value: rd }, uTale: { value: 1 }, uDecA: { value: decA }, uDecB: { value: decB }, uTime: { value: 0 }, uSway: { value: 1 }, uCat: { value: new THREE.Vector4(0, -100, 0, 0) }, uReact: { value: new THREE.Vector3() }, uLamp: { value: Array.from({ length: LAMP_SLOTS }, () => new THREE.Vector4(0, -100, 0, 0)) } };
  patch(M.paint, uniforms, false);
  patch(M.leaves, uniforms, true);
  if (M.glow) patchGlow(M.glow, uniforms);
  const lamps = lampPoints();
  const dist = new Float64Array(lamps.length);
  const taken = new Uint8Array(lamps.length);
  const swing = new Float64Array(lamps.length); // each lamp's swing (0..1), kicked when she passes close, fading
  // her reaction state: `landedAt` is the walk's time of the last landing (0 before any), `land` its strength (0..1), `moving` her speed on the 0..1 scale of a stride
  const reaction = { landedAt: 0, land: 0, moving: 0, flex: 0, shake: 0 };
  let lastT = -1; let lx = 0; let ly = 0; let lz = 0; let have = false; let fall = 0;
  const sky = {
    uniforms,
    reaction,
    // the year's four weights [spring, summer, autumn, winter] (treehouseseason.js), and the rainbow's strength 0..1 (rare, raised by the life)
    setSeason(w) { uniforms.uSeason.value.set(w[0], w[1], w[2], w[3]); sky.season = w; },
    setRain(k) { uniforms.uRain.value = k; },
    season: [0, 0, 1, 0],
    // Watches her speed and her falls: a drop of LAND.minFall m/s or more that ends is a landing (the strength grows to LAND.fullFall). Never allocates.
    react(t, cat, still, rung) {
      const dt = t - lastT; lastT = t;
      const r = reaction;
      if (!cat || !(dt > 0) || dt > 0.5 || !Number.isFinite(cat.y)) { have = false; fall = 0; if (cat) { lx = cat.x; ly = cat.y; lz = cat.z; have = Number.isFinite(cat.y); } }
      else if (have) {
        const dx = cat.x - lx; const dz = cat.z - lz; const dy = cat.y - ly;
        if (Math.abs(dx) + Math.abs(dz) > 3 || Math.abs(dy) > 4) fall = 0; // a door or a teleport is not a fall
        else {
          const vy = dy / dt;
          if (vy < -0.6) fall = Math.max(fall, -vy);
          else { if (fall >= LAND.minFall) { r.landedAt = t; r.land = Math.min(1, (fall - LAND.minFall) / (LAND.fullFall - LAND.minFall) * 0.8 + 0.3); } fall = 0; }
          r.moving += (Math.min(1, Math.hypot(dx, dz) / dt / 3) - r.moving) * Math.min(1, dt * 6);
        }
        lx = cat.x; ly = cat.y; lz = cat.z;
      } else { lx = cat.x; ly = cat.y; lz = cat.z; have = true; }
      const age = r.landedAt > 0 ? t - r.landedAt : 99;
      const hit = age >= 0 ? r.land * Math.exp(-age * LAND.decay) : 0;
      const calm = still || rung === 'lite';
      r.flex = calm ? 0 : Math.min(1.4, 0.3 * r.moving + hit * 1.6);
      r.shake = calm ? 0 : Math.min(1, 0.25 * r.moving + (age < LAND.shake ? r.land * (1 - age / LAND.shake) : 0));
      uniforms.uReact.value.set(r.flex, r.shake, 0);
      if (cat) uniforms.uCat.value.set(cat.x, cat.y, cat.z, 1); else uniforms.uCat.value.set(0, -100, 0, 0);
    },
    // t: the walk's time; cat: { x, y, z } or null; still: reduced motion; rung: 'high' | 'low' | 'lite'
    update(t, cat, still, rung) {
      uniforms.uTime.value = still ? 0 : t;
      sky.react(t, cat, still, rung);
      uniforms.uSway.value = still || rung === 'lite' ? 0 : 1;
      uniforms.uTale.value = rung === 'lite' ? 0 : 1;
      const live = LIVE[rung] ?? LIVE.high;
      taken.fill(0);
      for (let i = 0; i < lamps.length; i++) { const l = lamps[i]; dist[i] = cat ? (l.x - cat.x) ** 2 + (l.z - cat.z) ** 2 : i; }
      for (let s = 0; s < LAMP_SLOTS; s++) {
        const slot = uniforms.uLamp.value[s];
        let best = -1;
        if (s < live) for (let i = 0; i < lamps.length; i++) if (!taken[i] && (best < 0 || dist[i] < dist[best])) best = i;
        if (best < 0) { slot.w = 0; continue; }
        taken[best] = 1;
        const l = lamps[best];
        const near = cat ? Math.max(0, 1 - Math.hypot(l.x - cat.x, l.z - cat.z) / 3.2) : 0; // a lantern she passes close to swings, and its pool with it
        swing[best] = still || rung === 'lite' ? 0 : Math.max(swing[best] * 0.985, near * (0.5 + reaction.moving * 0.5));
        const sw = swing[best] * 0.55 * Math.sin(t * 2.6 + best * 1.7);
        slot.set(l.x + sw, l.y - Math.abs(sw) * 0.1, l.z + sw * 0.6, l.w * (sky.lampK ?? 1) * (still ? 1 : 0.9 + 0.1 * Math.sin(t * 3.1 + best * 2.3) * Math.sin(t * 1.3 + best)));
      }
    },
  };
  M.paint.userData.sky = sky;
  M.leaves.userData.sky = sky;
  if (M.glow) M.glow.userData.sky = sky;
  return sky;
}
