import { describe, it, expect } from 'vitest';
import {
  PHRASES, phraseById, isValidChatMsg, createChatRateLimiter, shouldShowIncomingChat,
} from '../src/chat.js';

describe('chat catalog', () => {
  it('has unique non-empty ids and text, each kind phrase|emote', () => {
    expect(PHRASES.length).toBeGreaterThanOrEqual(12);
    const ids = new Set();
    for (const p of PHRASES) {
      expect(typeof p.id).toBe('string');
      expect(p.id.length).toBeGreaterThan(0);
      expect(typeof p.text).toBe('string');
      expect(p.text.length).toBeGreaterThan(0);
      expect(p.kind === 'phrase' || p.kind === 'emote').toBe(true);
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
    }
  });
  it('phraseById returns the entry or null', () => {
    expect(phraseById(PHRASES[0].id)).toEqual(PHRASES[0]);
    expect(phraseById('nope')).toBeNull();
    expect(phraseById(123)).toBeNull();
  });
});

describe('isValidChatMsg', () => {
  const good = { v: 1, id: 'player-abc', phraseId: PHRASES[0].id };
  it('accepts a well-formed message with a known phraseId', () => {
    expect(isValidChatMsg(good)).toBe(true);
  });
  it('rejects unknown phraseId, bad shapes, and injection attempts', () => {
    expect(isValidChatMsg({ ...good, phraseId: 'unknown' })).toBe(false);
    expect(isValidChatMsg({ ...good, phraseId: '<script>' })).toBe(false);
    expect(isValidChatMsg({ v: 2, id: 'x', phraseId: good.phraseId })).toBe(false);
    expect(isValidChatMsg({ v: 1, id: '', phraseId: good.phraseId })).toBe(false);
    expect(isValidChatMsg({ v: 1, id: 5, phraseId: good.phraseId })).toBe(false);
    expect(isValidChatMsg({ v: 1, id: 'x' })).toBe(false);
    expect(isValidChatMsg(null)).toBe(false);
    expect(isValidChatMsg('hi')).toBe(false);
  });
});

describe('createChatRateLimiter', () => {
  it('blocks a sender that fires again inside the window, per-sender', () => {
    let t = 1000;
    const rl = createChatRateLimiter({ perMs: 1200, now: () => t });
    expect(rl.allow('a')).toBe(true);
    t = 1500; expect(rl.allow('a')).toBe(false); // 500ms < 1200ms
    expect(rl.allow('b')).toBe(true);            // different sender, independent
    t = 2300; expect(rl.allow('a')).toBe(true);  // 1300ms >= 1200ms since a's last allow
  });
});

describe('shouldShowIncomingChat', () => {
  it('hides when hideChat, blocked, or muted; shows otherwise', () => {
    expect(shouldShowIncomingChat('a', {})).toBe(true);
    expect(shouldShowIncomingChat('a', { hideChat: true })).toBe(false);
    expect(shouldShowIncomingChat('a', { isBlocked: (id) => id === 'a' })).toBe(false);
    expect(shouldShowIncomingChat('a', { isMuted: (id) => id === 'a' })).toBe(false);
    expect(shouldShowIncomingChat('a', { isMuted: (id) => id === 'b' })).toBe(true);
  });
});
