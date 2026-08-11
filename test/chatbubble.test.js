import { describe, it, expect } from 'vitest';
import { createChatBubbles } from '../src/chatbubble.js';

function fakeTarget() {
  return { children: [], add(s) { this.children.push(s); }, remove(s) {
    const i = this.children.indexOf(s); if (i >= 0) this.children.splice(i, 1);
  } };
}
function fakeSpriteFactory() {
  return () => {
    const map = { disposed: false, dispose() { this.disposed = true; } };
    const material = {
      opacity: 1,
      map,
      disposed: false,
      dispose() { this.disposed = true; },
    };
    return { material };
  };
}

describe('createChatBubbles', () => {
  it('shows, fades, and removes a bubble over its lifetime', () => {
    let t = 0;
    const scene = fakeTarget();
    const bubbles = createChatBubbles(scene, { makeSprite: fakeSpriteFactory(), now: () => t });
    const cat = fakeTarget();

    bubbles.show(cat, 'Hi! 👋', 0);
    expect(bubbles.activeCount).toBe(1);
    expect(cat.children).toHaveLength(1);

    t = 100; bubbles.update(t);
    expect(cat.children[0].material.opacity).toBe(1); // before fade window

    t = 3500 - 300; bubbles.update(t); // inside the 600ms fade window
    expect(cat.children[0].material.opacity).toBeLessThan(1);
    expect(cat.children[0].material.opacity).toBeGreaterThan(0);

    t = 3500; bubbles.update(t);
    expect(bubbles.activeCount).toBe(0);
    expect(cat.children).toHaveLength(0);
  });

  it('replaces an existing bubble on the same target', () => {
    let t = 0;
    const bubbles = createChatBubbles(fakeTarget(), { makeSprite: fakeSpriteFactory(), now: () => t });
    const cat = fakeTarget();
    bubbles.show(cat, 'Hi!', 0);
    bubbles.show(cat, 'Bye!', 10);
    expect(bubbles.activeCount).toBe(1);
    expect(cat.children).toHaveLength(1);
  });

  it('disposes the replaced sprite\'s material and map', () => {
    let t = 0;
    const bubbles = createChatBubbles(fakeTarget(), { makeSprite: fakeSpriteFactory(), now: () => t });
    const cat = fakeTarget();
    bubbles.show(cat, 'Hi!', 0);
    const firstSprite = cat.children[0];
    bubbles.show(cat, 'Bye!', 10);
    expect(firstSprite.material.disposed).toBe(true);
    expect(firstSprite.material.map.disposed).toBe(true);
    // the new sprite should remain untouched
    expect(cat.children[0].material.disposed).toBe(false);
    expect(cat.children[0].material.map.disposed).toBe(false);
  });

  it('disposes the sprite\'s material and map when the bubble expires', () => {
    let t = 0;
    const bubbles = createChatBubbles(fakeTarget(), { makeSprite: fakeSpriteFactory(), now: () => t });
    const cat = fakeTarget();
    bubbles.show(cat, 'Hi!', 0);
    const sprite = cat.children[0];
    t = 3500; bubbles.update(t); // past LIFETIME_MS
    expect(bubbles.activeCount).toBe(0);
    expect(sprite.material.disposed).toBe(true);
    expect(sprite.material.map.disposed).toBe(true);
  });

  it('no-ops when the sprite factory returns null (headless)', () => {
    const bubbles = createChatBubbles(fakeTarget(), { makeSprite: () => null, now: () => 0 });
    const cat = fakeTarget();
    bubbles.show(cat, 'Hi!', 0);
    expect(bubbles.activeCount).toBe(0);
  });
});
