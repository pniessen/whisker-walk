// The Gorge rock's shader patch (polish-gorgerock2, Task 5).
//
// The rock shell's vertices are 1.2 m by 1.0 m apart, so up close the walls
// read smooth; the fine detail of real canyon sandstone comes from here, per
// fragment, in world space (so it wraps the form and stays put as the camera
// moves):
//   bedding   thin dark lines every BED_STEP metres up the walls, wavering a
//             little with a slow noise, each band's top lip a touch lighter;
//   flutes    the wall normal swung to and fro along the wall's horizontal
//             tangent, so vertical flutes catch the light (normal only);
//   grain     a fine noise on the colour;
//   overhang  faces looking down are darker.
// Walls only for the bedding and the flutes (`wall` fades them out on tops).
// At most three value-noise calls a fragment, an arithmetic hash (no sin, so
// highp behaves the same on desktop and iPhone), no loops, no textures.
//
// patchRockMaterial(material, { flutes }) sets onBeforeCompile (chaining any
// earlier one) and customProgramCacheKey, so every rock material shares one
// program, and a merge by material parameters (render/mergeprops.js) keeps
// the patch on the merged mesh. Patching makes no THREE objects.

// The talus colour the wall feet lean towards (builder.rockArrays).
export const TALUS_TINT = 0x9d9384;

export const ROCK_SHADE = Object.freeze({
  wallLo: 0.35, // |n.y| below this: a wall
  wallHi: 0.75, // above this: a top (no bedding, no flutes)
  bedStep: 0.55, // metres between bedding lines
  bedWaver: 0.4, // metres the lines waver up and down
  bedFreq: 0.12, // of the waver's noise, across the ground
  bedDark: 0.10, // how much darker a bedding line is
  bedWidth: 0.12, // of a band, the dark line's share
  bedLip: 0.04, // how much lighter a band's top lip is
  fluteStep: 0.85, // metres between flutes along a wall
  fluteWarp: 3.0, // radians the flutes' phase wanders
  fluteFreq: [0.25, 0.05, 0.25], // of the wander's noise
  fluteTilt: 0.28, // how far the normal swings
  fluteFadeLo: 0.6, // radians of phase a pixel: flutes start fading
  fluteFadeHi: 1.6, // and are gone
  bedFadeLo: 0.06, // bands a pixel: bedding lines start fading
  bedFadeHi: 0.2, // and are gone
  grainBase: 0.93, // colour x (grainBase + grainAmp * noise)
  grainAmp: 0.14,
  grainFreq: 2.6,
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

const COLOUR = /* glsl */`
	{
		highp vec3 rw = vRockW;
		vec3 rn = normalize( vRockN );
		float rwall = 1.0 - smoothstep( ${f(S.wallLo)}, ${f(S.wallHi)}, abs( rn.y ) );
		float rbed = ( rw.y + ${f(S.bedWaver)} * vnoise( rw * vec3( ${f(S.bedFreq)}, 0.0, ${f(S.bedFreq)} ) ) ) / ${f(S.bedStep)};
		float rf = fract( rbed );
		// far off, where a line is thinner than a pixel, the lines fade out (no moire)
		float rbedOn = rwall * ( 1.0 - smoothstep( ${f(S.bedFadeLo)}, ${f(S.bedFadeHi)}, fwidth( rbed ) ) );
		float rshade = 1.0 - ${f(S.bedDark)} * rbedOn * ( 1.0 - smoothstep( 0.0, ${f(S.bedWidth)}, rf ) )
			+ ${f(S.bedLip)} * rbedOn * smoothstep( ${f(1 - S.bedWidth)}, 1.0, rf );
		rshade *= ${f(S.grainBase)} + ${f(S.grainAmp)} * vnoise( rw * ${f(S.grainFreq)} );
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
		if ( rwall > 0.0 && rl > 1e-4 ) {
			rt /= rl;
			// Along the wall: the Gorge's walls run along x or z, so the
			// distance along is w.x or w.z (blended at a corner). dot(w, t)
			// would ring like wood grain where the smooth normal turns.
			float rax = abs( rn.x ) / ( abs( rn.x ) + abs( rn.z ) );
			float ralong = mix( rw.x, rw.z, smoothstep( 0.3, 0.7, rax ) );
			float rphase = ralong * ${f(6.2832 / S.fluteStep)} + ${f(S.fluteWarp)} * vnoise( rw * ${v3(S.fluteFreq)} );
			// and they fade out where a flute is only a few pixels wide
			float rtilt = ${f(S.fluteTilt)} * rwall * ( 1.0 - smoothstep( ${f(S.fluteFadeLo)}, ${f(S.fluteFadeHi)}, fwidth( rphase ) ) );
			normal = normalize( normal + ( viewMatrix * vec4( rt * ( rtilt * cos( rphase ) ), 0.0 ) ).xyz );
		}
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
  material.customProgramCacheKey = () => 'gorge-rock-v1' + (flutes ? '' : '-nf');
  return material;
}
