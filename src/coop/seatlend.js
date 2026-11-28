// Cat two on a place's own prompts (stories, errands, jobs, hand-ins): the place's life answers promptAt(pos) / interact() for ANY position, and everything it keeps (the
// errand, the held watering can, the found kitten, the journal and the paws) is the household's own, so cat two is lent the same life for one asking at a time. No file of a place changes (its
// stage-A chunk is pinned), nothing is copied: a one-shot is one state in the life, so the second cat to reach it finds it done, and its award is keyed (awardOnce) so it pays once.
//
// The life keeps ONE "what would the button do now" slot (cat one's), so each asking of cat two is followed at once by an asking for cat one's own position, which puts that slot back.
// While cat one is on a ride (session.fair.riding) the lives' first source is her "Hop off", so cat two is offered nothing then: it could never press a ride that is cat one's.
export function createSeat(host) {
  const life = () => host.life;
  const cat1 = () => host.session()?.cat?.position ?? null;
  const busy = () => !!host.session()?.fair?.riding || !!host.session()?.traversal?.busy;
  const at = { x: 0, y: 0, z: 0 };
  let line = null;
  const restore = () => { const p = cat1(); if (p) life()?.promptAt?.(p); };
  const source = {
    forCats: 'two',
    promptAt(c) {
      line = null;
      if (!c || busy() || typeof life()?.promptAt !== 'function') return null;
      at.x = c.x; at.y = c.y; at.z = c.z;
      line = life().promptAt(at) ?? null;
      restore();
      return line;
    },
    interact() {
      if (!line || busy() || typeof life()?.interact !== 'function') { line = null; return null; }
      line = null;
      life().promptAt(at); // this cat's offer is the life's slot now (the press is the same frame)
      const r = life().interact() ?? null;
      restore();
      return r;
    },
  };
  return { sources: [source], carry: () => false, release() { line = null; } };
}
