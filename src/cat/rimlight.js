import * as THREE from 'three';
import { HEMI_INTENSITY } from '../render/rig.js';
import { getTextureTier } from '../render/textures.js';

// A SKY RIM ON THE CATS (polish-catlight, Pass 10, 2026-11-09).
//
// On the walk a black cat read as a cut-out: its fur is near-black, so the sun
// and the fill only lift it a little, and against a dark wood or a shaded lawn
// the outline was lost. Real fur catches the sky along its edges, where the
// coat turns away from you. This adds that: a Fresnel term,
//
//     rim = strength * sky * pow(1 - saturate(dot(N, V)), POWER)
//
// tinted by the scene's own HemisphereLight sky colour (the walk's fill,
// read straight from the shader's hemisphereLights[0] uniform). So it follows
// everything that already moves the fill: dusk's cool sky, rain's dimmer fill,
// the sunset peach. A scene with NO hemisphere light (the home stage, the
// dressing room: catstage.js lights with a sun, a rim light and an ambient)
// gets no rim at all, so the stage keeps its own look by construction.
//
// The rim is weighted toward the sky (more on the top and flanks of the cat,
// little under the belly, where the sky cannot reach) and is SCREENED onto the
// lit colour, `c + rim * (1 - c)`, so a channel under 1 stays under 1: the rim
// never pushes a white coat into the bloom threshold, and its own peak is
// clamped at RIM.max. It adds no geometry and no draw: it is a few shader
// lines on the fur's existing materials (one shared program variant).

export const RIM = Object.freeze({
  light: 0.18,   // strength on light and mid coats
  dark: 0.3,     // strength on darkFace coats (the black cat, Lord Lantern's points)
  power: 3,      // Fresnel falloff: a thin edge, not a halo
  max: 0.4,      // the rim term's peak, before the screen blend
  tail: 0.55,    // the tail's links take this share: a thin tube is all edge, and
                 // curled toward the camera it flashed grey
  grey: 0.3,     // the sky tint pulled this far toward grey: a sheen, not a blue paint
  skyUp: 0.45,   // how much more the upward-facing edges catch than the sideways ones
  skyFloor: 0.15, // ...and the least a downward-facing edge keeps
  dusk: 0.6,     // at dusk the rim is weaker (the Glow Collar stays the star)...
  duskCool: 0.35, // ...and pulled this far toward a cool moonlit blue
});
// The cool blue a dusk rim leans to (linear RGB, about the luminance of 1).
const COOL = [0.62, 0.8, 1.35];

// FUR GRAIN AND SHEEN (cat realism B8, 2026-11-15).
//
// Close up, the coat was one smooth colour, like plastic. Now it shows fine
// fur lines that run along each part (head to tail on the body, down a leg,
// along the tail, outward from the nose over the head) and a soft sheen that
// follows the same direction. It is the same shader add-on as the rim: no
// mesh, no draw call, no triangle, no picture file.
//
// How the lines know which way to run: each part has a long axis (z for the
// body, head, tail links and paws; y for the legs and ears), and the lines
// are meridians around that axis, so they run along the part and close in on
// its two ends the way fur closes on a cat's rump and chin. The pattern is
// worked out from the part's own vertex positions (object space), so it is
// fixed to the part: it turns, walks and nods with it and cannot swim on the
// screen. The part's frame (centre, axis, radius) is measured once, the
// first time the part is drawn (frameFur), from its geometry's bounding box.
//
// How it stays quiet: a line is FUR.width wide. The shader measures how many
// metres of coat one screen pixel covers there (fwidth) and fades the grain
// and the sheen out between FUR.fadeLo and FUR.fadeHi pixels per line, so by
// the time a line is thinner than a pixel there is nothing left to shimmer.
// At the walk camera (5 m back) one pixel covers about two lines, so the
// effect is fully off there and the cat's colour is what it was. Toward the
// two ends of a part the lines would pinch; there the shader halves their
// number step by step (two blended octaves), so they keep their width.
//
// The grain is zero-mean (it darkens and lightens the lit colour equally),
// and the sheen is screened on like the rim, so a white coat never clips.
// The sheen takes its strength from the direct light that actually reached
// the pixel (reflectedLight.directDiffuse, shadows included), so it dims in
// shade and at dusk by itself.
//
// Tiers: on a walk at the LOW tier and below it is OFF (catFurOn = 0, one
// comparison per cat pixel). setCatRimLight sets that once per walk from the
// walk's texture tier, which is 'low' exactly on those rungs. A scene with no
// hemisphere light (the home stage, the dressing room, the builder: one cat,
// close up) always shows it.
export const FUR = Object.freeze({
  width: 0.0024,     // one fur line across, metres of coat (short hair)
  length: 0.014,     // how far a line runs before it changes, metres
  longWidth: 1.5,    // a long-haired coat's lines are this much wider...
  longLength: 2.2,   // ...and this much longer (Persian, Maine Coon, long fur)
  grain: 0.085,      // the lines' light-and-dark swing on the lit coat (each way)
  sheen: 0.3,       // the sheen's strength
  sheenPower: 6,     // how tight the sheen band is (higher is tighter)
  sheenShift: 0.35,  // how far each line shifts the band: breaks it into strands
  sheenGrain: 0.7,   // how much the lines show inside the sheen
  sheenMax: 0.3,     // the sheen's peak, before the screen blend
  fadeLo: 0.4,       // pixels per line: under this the effect is at full...
  fadeHi: 1.0,       // ...and from here on it is gone
  endLo: 0.04,       // this near a part's end (as a share of its radius) there is no grain...
  endHi: 0.22,       // ...and from here out it is at full
  octaves: 4,        // how many times the lines may halve toward a part's end
});

// Shared by every rim material: one write per walk start (setCatRimLight).
const shared = {
  catRimGain: { value: 1 },
  catRimCool: { value: 0 },
  catFurOn: { value: 1 },
};

// Called once per walk from the walk's lighting block, after dusk is resolved
// (and after setTextureTier, which the walk calls before it builds anything).
// `fur` forces the grain on or off; left out, the walk's tier decides.
export function setCatRimLight({ dusk = false, fur } = {}) {
  shared.catRimGain.value = dusk ? RIM.dusk : 1;
  shared.catRimCool.value = dusk ? RIM.duskCool : 0;
  shared.catFurOn.value = (fur ?? getTextureTier() !== 'low') ? 1 : 0;
}

export const catFurState = () => ({ on: shared.catFurOn.value === 1 });

// One part's fur frame, measured from the mesh the first time it is drawn.
// `a` = the axis' centre in the part's own space, and 1 in w when the long
// axis is y (0: z). `b` = the mesh's own scale (so the lines are measured in
// metres of coat), and the lines' length frequency in w. `c` = how many lines
// go round the part at its mean radius (0: no fur), and that radius.
const box = new THREE.Box3();
function frameFur(fur, object, geometry) {
  let root = object.parent;
  while (root && !root.userData.parts) root = root.parent;
  const parts = root?.userData.parts;
  // Hagrid's feathers take the rim but are not fur; a mesh outside a cat is left alone
  if (!parts || root.userData.breed === 'hagrid') return;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  box.copy(geometry.boundingBox);
  const s = object.scale;
  const ex = (box.max.x - box.min.x) * s.x * 0.5, ey = (box.max.y - box.min.y) * s.y * 0.5, ez = (box.max.z - box.min.z) * s.z * 0.5;
  // legs and ears run along y; everything else (body, head, tail, paws) along z
  const limb = parts.legs.includes(object.parent) && object !== object.parent.userData.paw;
  const alongY = limb || object === parts.earL || object === parts.earR;
  const radius = Math.max(alongY ? (ex + ez) * 0.5 : (ex + ey) * 0.5, 0.01);
  const long = (root.userData.base?.tailPlume ?? 0) > 0;
  const width = FUR.width * (long ? FUR.longWidth : 1);
  const length = FUR.length * (long ? FUR.longLength : 1);
  fur.a.value.set((box.min.x + box.max.x) * 0.5, (box.min.y + box.max.y) * 0.5, (box.min.z + box.max.z) * 0.5, alongY ? 1 : 0);
  fur.b.value.set(s.x, s.y, s.z, 1 / length);
  fur.c.value.set(Math.max(8, Math.round((2 * Math.PI * radius) / width)), radius, 0, 0);
}

export const catRimState = () => ({ gain: shared.catRimGain.value, cool: shared.catRimCool.value });

const f = (v) => v.toFixed(4);
const FUR_PARS_VERTEX = /* glsl */`
uniform vec4 catFurA;
uniform vec4 catFurB;
varying vec3 vCatFur;
varying vec3 vCatFurAxis;`;
// (across, across, along) from the part's axis, in metres of coat; and the
// axis itself in view space, for the sheen
const FUR_VERTEX = /* glsl */`
{
  vec3 catFurP = ( position - catFurA.xyz ) * catFurB.xyz;
  vCatFur = mix( catFurP.xyz, catFurP.xzy, catFurA.w );
  vCatFurAxis = mat3( modelViewMatrix ) * mix( vec3( 0.0, 0.0, 1.0 ), vec3( 0.0, 1.0, 0.0 ), catFurA.w );
}`;
const FUR_PARS_FRAGMENT = /* glsl */`
uniform float catFurOn;
uniform vec4 catFurB;
uniform vec4 catFurC;
varying vec3 vCatFur;
varying vec3 vCatFurAxis;
float catFurHash( vec2 p ) {
  vec3 q = fract( vec3( p.xyx ) * 0.1031 );
  q += dot( q, q.yzx + 33.33 );
  return fract( ( q.x + q.y ) * q.z );
}
// one fur line: a value that changes slowly along the line, each line with
// its own offset so neighbours do not break in step
float catFurLine( float col, float y ) {
  y += catFurHash( vec2( col, 71.0 ) ) * 37.0;
  float yi = floor( y );
  float yf = y - yi;
  return mix( catFurHash( vec2( col, yi ) ), catFurHash( vec2( col, yi + 1.0 ) ), yf * yf * ( 3.0 - 2.0 * yf ) );
}
// n lines round the part (x in 0..n, wrapping), y along it
float catFurLines( float x, float y, float n ) {
  float xi = floor( x );
  float xf = x - xi;
  return mix( catFurLine( mod( xi, n ), y ), catFurLine( mod( xi + 1.0, n ), y ), xf * xf * ( 3.0 - 2.0 * xf ) );
}`;
const FUR_GLSL = /* glsl */`
#if NUM_HEMI_LIGHTS > 0
if ( catFurOn * catFurC.x > 0.0 )
#else
if ( catFurC.x > 0.0 )
#endif
{
  // metres of coat under one pixel, and one line's width here
  float furPix = length( fwidth( vCatFur ) );
  float furR = length( vCatFur.xy );
  float furLod = clamp( log2( catFurC.y / max( furR, 0.0001 ) ), 0.0, ${FUR.octaves.toFixed(1)} );
  float furOct = floor( furLod );
  float furMix = furLod - furOct;
  // whole numbers of lines, so each octave closes on itself round the part
  float furN = max( floor( catFurC.x * exp2( - furOct ) + 0.5 ), 4.0 );
  float furN2 = max( floor( catFurC.x * exp2( - furOct - 1.0 ) + 0.5 ), 4.0 );
  float furW = 6.28319 * furR / furN * ( 1.0 + furMix );
  // ...fading out as a line nears a pixel's width, and at the very end of a
  // part, where every line would meet in one point
  float furFade = ( 1.0 - smoothstep( ${f(FUR.fadeLo)}, ${f(FUR.fadeHi)}, furPix / max( furW, 0.00001 ) ) )
    * smoothstep( ${f(FUR.endLo)}, ${f(FUR.endHi)}, furR / catFurC.y );
  if ( furFade > 0.0 ) {
    float furA = atan( vCatFur.y, vCatFur.x ) * 0.159155 + 0.5;
    // along the line: the distance along the axis, plus the angle down from
    // the part's front end, so a line also changes as it runs over an end
    float furY = ( vCatFur.z - catFurC.y * atan( furR, vCatFur.z ) ) * 0.5 * catFurB.w;
    float furG = mix( catFurLines( furA * furN, furY, furN ), catFurLines( furA * furN2, furY + 19.0, furN2 ), furMix );
    furG = clamp( ( furG - 0.5 ) * 2.4, -1.0, 1.0 );
    outgoingLight *= 1.0 + ${f(FUR.grain)} * furFade * furG;
    #if NUM_DIR_LIGHTS > 0
    {
      // the fur's direction here: the part's axis laid onto the surface, each
      // line tipped a little in or out so the band breaks into strands
      vec3 furAx = normalize( vCatFurAxis );
      vec3 furT = normalize( furAx - normal * dot( furAx, normal ) + normal * ( furG * ${f(FUR.sheenShift)} ) );
      vec3 furH = normalize( directionalLights[ 0 ].direction + normalize( vViewPosition ) );
      float furTH = dot( furT, furH );
      float furSpec = pow( max( 1.0 - furTH * furTH, 0.0 ), ${f(FUR.sheenPower * 0.5)} );
      // the direct light that reached this pixel (shadows included), as a grey
      float furLit = dot( reflectedLight.directDiffuse, vec3( 0.2126, 0.7152, 0.0722 ) ) / max( dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.002 );
      vec3 furSheen = min( ${f(FUR.sheen)} * furFade * furLit * furSpec * ( 1.0 + ${f(FUR.sheenGrain)} * furG ) * mix( diffuseColor.rgb, vec3( 1.0 ), 0.5 ), vec3( ${f(FUR.sheenMax)} ) );
      outgoingLight += furSheen * max( vec3( 0.0 ), 1.0 - outgoingLight );
    }
    #endif
  }
}`;

const RIM_GLSL = /* glsl */`
#if NUM_HEMI_LIGHTS > 0
{
  // the fill's sky colour, back to a tint of about the brightness of the colour
  // itself (the uniform carries the light's intensity)
  vec3 rimSky = hemisphereLights[ 0 ].skyColor * ${(1 / HEMI_INTENSITY).toFixed(5)};
  float rimLum = dot( rimSky, vec3( 0.2126, 0.7152, 0.0722 ) );
  rimSky = mix( rimSky, vec3( rimLum ), ${RIM.grey.toFixed(3)} );
  rimSky = mix( rimSky, vec3( ${COOL.map((v) => v.toFixed(3)).join(', ')} ) * rimLum, catRimCool );
  vec3 rimV = normalize( vViewPosition );
  float rimF = pow( 1.0 - saturate( dot( normal, rimV ) ), ${RIM.power.toFixed(1)} );
  vec3 rimUp = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
  float rimSkyW = clamp( 1.0 - ${RIM.skyUp.toFixed(3)} + ${RIM.skyUp.toFixed(3)} * dot( normal, rimUp ), ${RIM.skyFloor.toFixed(3)}, 1.0 );
  vec3 rim = min( catRimStrength * catRimGain * rimF * rimSkyW * rimSky, vec3( ${RIM.max.toFixed(3)} ) );
  outgoingLight += rim * max( vec3( 0.0 ), 1.0 - outgoingLight );
}
#endif
#include <opaque_fragment>`;
const noRender = THREE.Material.prototype.onBeforeRender;

// Give these fur materials the rim. `dark` picks the darkFace strength;
// `scale` softens it for a part (the tail).
// Idempotent: a material already given a rim is left alone. Only
// MeshStandardMaterial (litMaterial) is touched; lines, eyes etc. are never
// passed in.
export function addCatRim(materials, { dark = false, scale = 1 } = {}) {
  const strength = (dark ? RIM.dark : RIM.light) * scale;
  for (const m of materials) {
    if (!m?.isMeshStandardMaterial || m.userData.catRim) continue;
    const uniform = { value: strength };
    m.userData.catRim = uniform;
    // the part's fur frame: all zero (no fur) until its mesh is first drawn,
    // then measured once and the hook removed, so nothing runs per frame
    const fur = { a: { value: new THREE.Vector4() }, b: { value: new THREE.Vector4(1, 1, 1, 1) }, c: { value: new THREE.Vector4() } };
    m.userData.catFur = fur;
    m.onBeforeRender = (renderer, scene, camera, geometry, object) => {
      m.onBeforeRender = noRender;
      frameFur(fur, object, geometry);
    };
    const prior = m.onBeforeCompile;
    m.onBeforeCompile = (shader, renderer) => {
      prior?.call(m, shader, renderer);
      shader.uniforms.catRimStrength = uniform;
      shader.uniforms.catRimGain = shared.catRimGain;
      shader.uniforms.catRimCool = shared.catRimCool;
      shader.uniforms.catFurOn = shared.catFurOn;
      shader.uniforms.catFurA = fur.a;
      shader.uniforms.catFurB = fur.b;
      shader.uniforms.catFurC = fur.c;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>${FUR_PARS_VERTEX}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>${FUR_VERTEX}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform float catRimStrength;\nuniform float catRimGain;\nuniform float catRimCool;${FUR_PARS_FRAGMENT}`)
        .replace('#include <opaque_fragment>', FUR_GLSL + RIM_GLSL);
    };
    // every rim material compiles the same code: one shared program
    m.customProgramCacheKey = () => 'cat-rim-v2';
  }
}
