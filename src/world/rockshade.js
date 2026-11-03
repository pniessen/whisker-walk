// The Gorge rock's shader patch (polish-gorgerock2, Task 5).
//
// The rock shell's vertices are 1.2 m by 1.0 m apart, so up close the walls
// read smooth; the fine detail of real canyon sandstone comes from here, per
// fragment, in world space (so it wraps the form and stays put as the camera
// moves):
//   bedding   soft, broken dark lines up the walls at irregular spacing,
//             wavering a little with a slow noise, a touch lighter under each;
//   flutes    the wall normal swung to and fro along the wall's horizontal
//             tangent, so vertical flutes catch the light (normal only), their
//             period and depth wandering so some reaches are smooth;
//   grain     a fine noise on the colour;
// Each fades out with distance (fwidth) so nothing shimmers or moires.
//   overhang  faces looking down are darker.
// Walls only for the bedding and the flutes (`wall` fades them out on tops).
// At most three value-noise calls a fragment, an arithmetic hash (no sin, so
// highp behaves the same on desktop and iPhone), no loops, no textures.
//
// patchRockMaterial(material, { flutes }) sets onBeforeCompile (chaining any
// earlier one) and customProgramCacheKey, so every rock material shares one
// program. render/mergeprops.js merges by material parameters, not by
// onBeforeCompile: a merge keeps the patch only because all three rock
// meshes (rockFaces, lips, ledgeTops) wear it, so whichever material the
// merged mesh keeps is patched. Patching makes no THREE objects.

// The talus colour the wall feet lean towards (builder.rockArrays).
export const TALUS_TINT = 0x9d9384;

export const ROCK_SHADE = Object.freeze({
  wallLo: 0.35, // |n.y| below this: a wall
  wallHi: 0.75, // above this: a top (no bedding, no flutes)
  // Bedding: the wall is cut into cells bedStep high; each cell holds at
  // most one line, at a hashed height bedPosLo..bedPosHi of the cell (so
  // neighbouring lines lie 0.6..1.4 cells apart), and bedSkip of the cells
  // hold none (gaps up to ~1.9 cells). Each line is broken along its length.
  bedStep: 0.7, // metres a cell
  bedPosLo: 0.3, // of a cell: where its line may lie
  bedPosHi: 0.7,
  bedSkip: 0.25, // the share of cells without a line
  bedWaver: 0.4, // metres the lines waver up and down
  bedFreq: 0.12, // of the waver's noise, across the ground
  bedBreaks: 3.0, // how many times a line breaks per unit of that noise
  bedBreakLo: 0.3, // a line shows where its break wave is over this
  bedBreakHi: 0.6, // and is full over this
  bedDark: 0.06, // how much darker a bedding line is
  bedWidth: 0.09, // of a cell, the dark line's width (above the line)
  bedLip: 0.03, // how much lighter the band's top just under a line is
  bedFadeLo: 0.05, // cells a pixel: bedding lines start fading
  bedFadeHi: 0.16, // and are gone
  // Flutes: the phase runs at a base period, warped by a slow noise strong
  // enough that the local period wanders ~0.7..1.6 m; the same noise sets
  // how deep they are, so some reaches are smooth and some deeply fluted.
  fluteStep: 1.05, // metres between flutes, before the warp
  fluteWarp: 7.0, // radians the phase wanders
  fluteFreq: [0.25, 0.05, 0.25], // of the wander's noise
  fluteTilt: 0.35, // how far the normal swings, at the deepest
  fluteDeepLo: 0.3, // the noise under this: smooth rock
  fluteDeepHi: 0.8, // over this: fully fluted
  fluteFadeLo: 0.6, // radians of phase a pixel: flutes start fading
  fluteFadeHi: 1.6, // and are gone
  grainBase: 0.93, // colour x (grainBase + grainAmp * noise)
  grainAmp: 0.14,
  grainFreq: 2.6,
  grainFadeLo: 0.5, // grain cells a pixel: grain starts settling to its mean
  grainFadeHi: 1.2, // and is flat
  overhang: 0.22, // a face looking straight down is this much darker
  talusLo: 0.15, // metres over the walk: full talus below this
  talusHi: 1.3, // none above this
});

const S = ROCK_SHADE;
const f = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));
const v3 = ([a, b, c]) => `vec3( ${f(a)}, ${f(b)}, ${f(c)} )`;

const PARS = /* glsl */`
varying vec3 vRockW;
varying vec3 vRockN;
// An arithmetic hash of a lattice point (no sin): [0, 1).
highp float rockHash( highp vec3 p ) {
	p = fract( p * 0.1031 );
	p += dot( p, p.zyx + 31.32 );
	return fract( ( p.x + p.y ) * p.z );
}
// 3D value noise, smoothly interpolated: [0, 1).
highp float vnoise( highp vec3 p ) {
	highp vec3 i = floor( p );
	highp vec3 u = fract( p );
	u = u * u * ( 3.0 - 2.0 * u );
	float a = mix( rockHash( i ), rockHash( i + vec3( 1.0, 0.0, 0.0 ) ), u.x );
	float b = mix( rockHash( i + vec3( 0.0, 1.0, 0.0 ) ), rockHash( i + vec3( 1.0, 1.0, 0.0 ) ), u.x );
	float c = mix( rockHash( i + vec3( 0.0, 0.0, 1.0 ) ), rockHash( i + vec3( 1.0, 0.0, 1.0 ) ), u.x );
	float d = mix( rockHash( i + vec3( 0.0, 1.0, 1.0 ) ), rockHash( i + vec3( 1.0, 1.0, 1.0 ) ), u.x );
	return mix( mix( a, b, u.y ), mix( c, d, u.y ), u.z );
}
`;

// Branch-free throughout, so every fwidth() is in uniform control flow.
const COLOUR = /* glsl */`
	{
		highp vec3 rw = vRockW;
		vec3 rn = normalize( vRockN );
		float rwall = 1.0 - smoothstep( ${f(S.wallLo)}, ${f(S.wallHi)}, abs( rn.y ) );
		// bedding: which cell, where its line lies, whether it has one
		float rwav = vnoise( rw * vec3( ${f(S.bedFreq)}, 0.0, ${f(S.bedFreq)} ) );
		float rbed = ( rw.y + ${f(S.bedWaver)} * rwav ) / ${f(S.bedStep)};
		float rcell = floor( rbed );
		float rh1 = rockHash( vec3( rcell, 17.0, 3.0 ) );
		float rh2 = rockHash( vec3( rcell, 5.0, 29.0 ) );
		float rd = fract( rbed ) - mix( ${f(S.bedPosLo)}, ${f(S.bedPosHi)}, rh1 );
		float rhas = step( ${f(S.bedSkip)}, rh2 );
		// broken along its length: a soft triangle wave of the slow noise, offset per cell
		float rtri = abs( fract( rwav * ${f(S.bedBreaks)} + rh2 * 7.0 ) - 0.5 ) * 2.0;
		float rbrk = smoothstep( ${f(S.bedBreakLo)}, ${f(S.bedBreakHi)}, rtri );
		// far off, where a line is thinner than a pixel, the lines fade out (no moire)
		float rbedOn = rwall * rhas * rbrk * ( 1.0 - smoothstep( ${f(S.bedFadeLo)}, ${f(S.bedFadeHi)}, fwidth( rbed ) ) );
		float rline = 1.0 - smoothstep( 0.0, ${f(S.bedWidth)}, abs( rd ) );
		float rshade = 1.0 - ${f(S.bedDark)} * rbedOn * rline * step( 0.0, rd )
			+ ${f(S.bedLip)} * rbedOn * rline * ( 1.0 - step( 0.0, rd ) );
		// grain, settling to its mean far off
		highp vec3 rgp = rw * ${f(S.grainFreq)};
		float rgOn = 1.0 - smoothstep( ${f(S.grainFadeLo)}, ${f(S.grainFadeHi)}, length( fwidth( rgp ) ) );
		rshade *= ${f(S.grainBase)} + ${f(S.grainAmp)} * mix( 0.5, vnoise( rgp ), rgOn );
		rshade *= 1.0 - ${f(S.overhang)} * clamp( - rn.y, 0.0, 1.0 );
		diffuseColor.rgb *= rshade;
	}
`;

const FLUTES = /* glsl */`
	{
		highp vec3 rw = vRockW;
		vec3 rn = normalize( vRockN );
		float rwall = 1.0 - smoothstep( ${f(S.wallLo)}, ${f(S.wallHi)}, abs( rn.y ) );
		vec3 rt = vec3( - rn.z, 0.0, rn.x );
		float rl = length( rt );
		rt /= max( rl, 1e-4 );
		// Along the wall: the Gorge's walls run along x or z, so the
		// distance along is w.x or w.z (blended at a corner). dot(w, t)
		// would ring like wood grain where the smooth normal turns.
		float rax = abs( rn.x ) / max( abs( rn.x ) + abs( rn.z ), 1e-4 );
		float ralong = mix( rw.x, rw.z, smoothstep( 0.3, 0.7, rax ) );
		float rfn = vnoise( rw * ${v3(S.fluteFreq)} );
		float rphase = ralong * ${f(6.2832 / S.fluteStep)} + ${f(S.fluteWarp)} * rfn;
		// deep in some reaches, smooth in others; faded where a flute is only a few pixels wide
		float rtilt = ${f(S.fluteTilt)} * rwall * step( 1e-4, rl )
			* smoothstep( ${f(S.fluteDeepLo)}, ${f(S.fluteDeepHi)}, rfn )
			* ( 1.0 - smoothstep( ${f(S.fluteFadeLo)}, ${f(S.fluteFadeHi)}, fwidth( rphase ) ) );
		normal = normalize( normal + ( viewMatrix * vec4( rt * ( rtilt * cos( rphase ) ), 0.0 ) ).xyz );
	}
`;

const VERTEX = /* glsl */`
	vRockW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
	vRockN = normalize( mat3( modelMatrix ) * objectNormal );
`;

// Everything the patch adds to the fragment shader (exported for the tests).
export const ROCK_FRAGMENT = PARS + COLOUR + FLUTES;

const inject = (src, anchor, code) => {
  if (!src.includes(anchor)) throw new Error(`rockshade: no ${anchor} in the shader`);
  return src.replace(anchor, `${anchor}\n${code}`);
};

// Note: mergeprops' material key ignores this patch, so two meshes whose
// materials differ only in `flutes` must not share material parameters (or
// the merge folds them together); give such a mesh userData.noMerge.
export function patchRockMaterial(material, { flutes = true } = {}) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = function onBeforeCompile(shader, renderer) {
    if (typeof prev === 'function') prev.call(this, shader, renderer);
    let vs = inject(shader.vertexShader, '#include <common>', 'varying vec3 vRockW;\nvarying vec3 vRockN;');
    vs = vs.includes('#include <worldpos_vertex>')
      ? inject(vs, '#include <worldpos_vertex>', VERTEX)
      : inject(vs, '#include <project_vertex>', VERTEX);
    shader.vertexShader = vs;
    let fs = inject(shader.fragmentShader, '#include <common>', PARS);
    fs = inject(fs, '#include <color_fragment>', COLOUR);
    if (flutes) fs = inject(fs, '#include <normal_fragment_maps>', FLUTES);
    shader.fragmentShader = fs;
  };
  // Combine an earlier key set on this material (not three's default, which
  // is the onBeforeCompile source).
  const prevKey = Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey')
    ? material.customProgramCacheKey.bind(material) : null;
  material.customProgramCacheKey = () => (prevKey?.() ?? '') + 'gorge-rock-v1' + (flutes ? '' : '-nf');
  return material;
}
