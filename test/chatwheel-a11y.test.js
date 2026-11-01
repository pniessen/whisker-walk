import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { muteRowLabel } from '../src/ui/chatwheel.js';

// The chat tray's per-player mute rows are toggles whose visible text is an
// emoji and a name ("🔈 Robin"): a screen reader heard "speaker Robin" and
// nothing about what pressing it does, or whether Robin is muted. Each row is
// now a labelled toggle button ("Mute Robin", aria-pressed); the 💬 toggle says whether the tray
// is open.
const src = readFileSync(new URL('../src/ui/chatwheel.js', import.meta.url), 'utf8');

describe('chat wheel toggles have accessible labels', () => {
  it('a mute row is labelled "Mute <name>"; aria-pressed says whether it is on', () => {
    expect(muteRowLabel('Robin')).toBe('Mute Robin');
  });

  it('each mute row sets its label and pressed state', () => {
    const render = src.slice(src.indexOf('function renderMutes'), src.indexOf('function openTray'));
    expect(render).toContain("row.setAttribute('aria-label', muteRowLabel(pl.name))");
    expect(render).toContain("row.setAttribute('aria-pressed', muted ? 'true' : 'false')");
  });

  it('the chat toggle reports whether the tray is open', () => {
    expect(src).toContain('aria-expanded="false"');
    expect(src).toMatch(/function openTray\(\) \{[^}]*toggle\.setAttribute\('aria-expanded', 'true'\)/);
    expect(src).toMatch(/function closeTray\(\) \{[^}]*toggle\.setAttribute\('aria-expanded', 'false'\)/);
  });
});
