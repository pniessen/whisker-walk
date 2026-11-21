import * as THREE from 'three';

// For test/shaderpatches.test.js's own check: a chunk edit made at import, as
// world/dressing.js makes one, that cuts text three.js's chunk does not have.
export const CUT = THREE.ShaderChunk.normal_fragment_begin.replace('no such line in the chunk;', '');
