// =============================================================================
// THE MOON'S FADE-IN (background loading). What a late stage brings is not snapped in: its materials are given a shared alpha (a line before the
// fragment shader's last include, one uniform) that rises from 0 to 1 over FADE_TIME, then put back exactly as they were (no lasting cost, no clone).
// Its meshes cast no shadow while they fade (a ghost shadow of something not yet there). Reduced motion: everything is there at once.
// Materials already in the scene (the landing's) are never touched. No clock of its own: the life's frame time drives it.
// =============================================================================

export const FADE_TIME = 1.0; // s
const HOOK = '#include <dithering_fragment>';
const smooth = (k) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };

export function createFader({ reducedMotion = false } = {}) {
  const batches = [];
  return {
    get active() { return batches.length; },
    /** add(roots, known) fades the materials under `roots` that are not in the Set `known`; returns the batch ({ k }) or null (reduced motion: nothing to fade). */
    add(roots, known = new Set()) {
      if (reducedMotion) return null;
      const u = { value: 0 };
      const batch = { t: 0, u, mats: new Map(), meshes: [] };
      for (const root of roots) {
        root?.traverse?.((o) => {
          if (!o.isMesh && !o.isSprite && !o.isPoints && !o.isLine) return;
          if (o.castShadow) { batch.meshes.push(o); o.castShadow = false; }
          for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
            if (known.has(m) || batch.mats.has(m)) continue;
            const was = { transparent: m.transparent, hook: m.onBeforeCompile };
            batch.mats.set(m, was);
            m.transparent = true;
            m.onBeforeCompile = function (shader, renderer) {
              was.hook?.call(this, shader, renderer);
              if (!shader.fragmentShader.includes(HOOK)) return;
              shader.uniforms.uMoonFade = u;
              shader.fragmentShader = `uniform float uMoonFade;\n${shader.fragmentShader.replace(HOOK, `gl_FragColor.a *= uMoonFade;\n${HOOK}`)}`;
            };
            m.needsUpdate = true;
          }
        });
      }
      batches.push(batch);
      return batch;
    },
    update(dt) {
      for (let i = batches.length - 1; i >= 0; i--) {
        const b = batches[i];
        b.t += dt;
        b.u.value = smooth(b.t / FADE_TIME);
        if (b.t < FADE_TIME) continue;
        for (const [m, was] of b.mats) { m.transparent = was.transparent; m.onBeforeCompile = was.hook ?? (() => {}); m.needsUpdate = true; }
        for (const o of b.meshes) o.castShadow = true;
        batches.splice(i, 1);
      }
    },
    /** Finishes every fade at once (the walk is leaving). */
    flush() { this.update(FADE_TIME * 2); },
  };
}

/** The materials of every mesh now under `root`: what a fade leaves alone. */
export function materialsOf(root) {
  const s = new Set();
  root.traverse?.((o) => { for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) s.add(m); });
  return s;
}
