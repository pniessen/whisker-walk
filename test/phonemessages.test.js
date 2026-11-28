import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Phone messages: toasts are small and capped on a phone, and only on a phone (style.css, last block).
const CSS = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const block = CSS.slice(CSS.lastIndexOf('/* Phone messages'));
const query = /@media ([^{]+)\{/.exec(block)[1].trim();

describe('phone toasts', () => {
  it('apply under 600px wide, or on a touch screen under 500px tall, and nowhere else', () => {
    expect(query).toBe('(max-width: 599px), (pointer: coarse) and (max-height: 500px)');
  });
  it('are a small pill and the stack is capped at 14% of the height', () => {
    expect(block).toMatch(/\.hud-toasts \{[^}]*max-height: 14vh;/);
    expect(block).toMatch(/nth-last-child\(-n\+2\)\) \{ display: none/);
    expect(block).toMatch(/-webkit-line-clamp: 2/);
    expect(block).toMatch(/\.toast \{[^}]*font-size: 0\.8rem;[^}]*padding: 3px 10px/);
    expect(parseInt(/max-height: (\d+)vh/.exec(block)[1], 10)).toBeLessThanOrEqual(15);
  });
  it('leave the desktop rules as they were', () => {
    expect(CSS).toMatch(/\.toast \{\s*background: rgba\(20,26,38,0\.75\); padding: 8px 18px;[^}]*font-size: 1\.05rem;/);
    expect(CSS).toMatch(/\.hud-toasts \{\s*position: absolute; bottom: 146px;/);
  });
});
