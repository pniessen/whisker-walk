// Sampled pet-voice support: the family can record their real cats
// (Zeetoo/Rosa/Robbie/Hagrid) and hear them in-game instead of the synth
// voice. See docs/RECORDING-PETS.md for how the family adds recordings.
//
// createSamples(baseUrl, { fetchFn, decode }) loads
// `${baseUrl}sounds/manifest.json` (shape `{ files: ["zeetoo.m4a", …] }`),
// validates each entry against /^[a-z0-9-]+\.(mp3|m4a|ogg)$/ (anything else —
// path traversal, non-strings, wrong extension — is dropped silently), and
// for every surviving entry kicks off a fetch+decode of that file, keyed by
// its name (filename minus extension).
//
// CONTRACT — read this before touching callers:
//   - has(name) is SYNCHRONOUS and returns true ONLY once that file has
//     already decoded successfully. It is false before decode finishes and
//     false forever if decode fails (404, offline, corrupt audio, whatever).
//     This is deliberate: it lets game code do a plain synchronous
//     check-then-play with no await and no race against synth fallback:
//         if (samples.has(breed)) samples.play(breed, opts);
//         else audio.meow(...);           // synth fallback, always safe
//     A Promise-returning play() that resolves ok/fail would force every
//     caller to choose between awaiting (too slow for a game sound cue) or
//     racing the synth fallback against an in-flight decode — this contract
//     avoids that entirely by resolving "do we have it" ahead of play time.
//   - play(name, { rate, volume }) is fire-and-forget. Call it only once
//     has(name) is true; calling it before that (or for a name that isn't
//     decoded) is a harmless no-op, since that's exactly the case has() is
//     for.
//   - ready is a Promise that resolves once the manifest fetch and every
//     listed file's decode attempt (success or failure) has settled. Nothing
//     in the game needs to await it — has() is always safe to poll — but
//     tests use it to wait for the lazy decode work to finish.
//
// decode is injectable (tests pass a fake); in main.js it's wired to
// `audio.getContext().decodeAudioData(arrayBuffer)`. decodeAudioData works
// without a user gesture in modern browsers even while the AudioContext is
// suspended — only actually starting playback needs the gesture — so this
// decode-on-ready kickoff is safe to run immediately at boot.

const NAME_RE = /^[a-z0-9-]+\.(mp3|m4a|ogg)$/;

export function createSamples(baseUrl, { fetchFn = fetch, decode, playBuffer } = {}) {
  const decoded = new Map(); // name -> AudioBuffer, populated only on decode success

  async function loadOne(file) {
    const name = file.slice(0, file.lastIndexOf('.'));
    try {
      const res = await fetchFn(`${baseUrl}sounds/${file}`);
      if (!res || !res.ok) return;
      const arrayBuf = await res.arrayBuffer();
      const buf = await decode(arrayBuf);
      if (buf) decoded.set(name, buf);
    } catch {
      // 404 / offline / decode error: leave `name` undecoded — has() stays
      // false and callers fall back to the synth voice, per the contract.
    }
  }

  const ready = (async () => {
    let files;
    try {
      const res = await fetchFn(`${baseUrl}sounds/manifest.json`);
      if (!res || !res.ok) return;
      const data = await res.json();
      files = Array.isArray(data?.files) ? data.files : [];
    } catch {
      return; // no manifest reachable — has() is false for everything
    }
    const valid = files.filter((f) => typeof f === 'string' && NAME_RE.test(f));
    await Promise.all(valid.map(loadOne));
  })();

  return {
    ready,
    has(name) {
      return decoded.has(name);
    },
    play(name, { rate = 1, volume = 1 } = {}) {
      const buf = decoded.get(name);
      if (!buf || !playBuffer) return;
      playBuffer(buf, { rate, volume });
    },
  };
}
