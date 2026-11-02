// The "make your own cat" screen: a draft reducer, a model and escaped markup.
// DOM-free and THREE-free; the controller wires the data-cb-* hooks.

import {
  COATS, MARKS, EYES, PATTERNS, FURS, PERSONALITY_CHOICES, CUSTOM_PERSONALITIES,
  SIZE, DEFAULT_LOOK, DEFAULT_PERSONALITY, sanitizeLook, presetFor, lookKey,
} from '../customcats.js';
import { validPetName } from '../net.js';
import { CAT_BLURBS } from './catblurbs.js';
import { escapeHtml } from '../game/util.js';

const NAME_MAX = 16;
const TABLES = { coat: COATS, marks: MARKS, eyes: EYES };
const LISTS = { pattern: PATTERNS, fur: FURS };

const fields = (name, personality, look) => ({ name, personality, look: sanitizeLook(look) });

export function newBuilder() {
  const f = fields('', DEFAULT_PERSONALITY, DEFAULT_LOOK);
  return { mode: 'new', id: null, start: f, draft: { ...f }, confirmLeave: false };
}

export function editBuilder(cat) {
  const f = fields(String(cat?.name ?? '').slice(0, NAME_MAX), Object.hasOwn(CUSTOM_PERSONALITIES, cat?.personality) ? cat.personality : DEFAULT_PERSONALITY, cat?.look);
  return { mode: 'edit', id: cat?.id ?? null, start: f, draft: { ...f }, confirmLeave: false };
}

const withDraft = (b, patch) => ({ ...b, draft: { ...b.draft, ...patch } });

export function reduceBuilder(b, action) {
  if (!action || typeof action !== 'object') return b;
  const { draft } = b;
  switch (action.type) {
    case 'pick': {
      const { field, value } = action;
      if (typeof value !== 'string') return b;
      const ok = Object.hasOwn(TABLES, field) ? Object.hasOwn(TABLES[field], value)
        : Object.hasOwn(LISTS, field) ? LISTS[field].some((p) => p[0] === value) : false;
      if (!ok || draft.look[field] === value) return b;
      return withDraft(b, { look: { ...draft.look, [field]: value } });
    }
    case 'personality':
      if (typeof action.value !== 'string' || !Object.hasOwn(CUSTOM_PERSONALITIES, action.value) || draft.personality === action.value) return b;
      return withDraft(b, { personality: action.value });
    case 'size': {
      if (typeof action.value !== 'number') return b;
      const size = sanitizeLook({ ...draft.look, size: action.value }).size;
      return size === draft.look.size ? b : withDraft(b, { look: { ...draft.look, size } });
    }
    case 'name': {
      if (typeof action.value !== 'string') return b;
      const name = action.value.slice(0, NAME_MAX);
      return name === draft.name ? b : withDraft(b, { name });
    }
    case 'ask-leave': return b.confirmLeave ? b : { ...b, confirmLeave: true };
    case 'stay': return b.confirmLeave ? { ...b, confirmLeave: false } : b;
    default: return b;
  }
}

export function isDirty(b) {
  return lookKey(b.draft.look) !== lookKey(b.start.look) || b.draft.name !== b.start.name || b.draft.personality !== b.start.personality;
}

const hexCss = (n) => `#${n.toString(16).padStart(6, '0')}`;
const swatches = (field, table) => Object.entries(table).map(([id, t]) => ({ id, label: t.label, hex: hexCss(t.hex) }));
const pills = (list) => list.map(([id, label]) => ({ id, label }));

export function buildBuilderModel(b) {
  const { draft } = b;
  const look = draft.look;
  const marksNote = look.pattern === 'solid' ? 'Solid cats have no markings' : look.pattern === 'socks' ? 'Socks are always white' : '';
  const breed = presetFor(draft.personality);
  const rows = [
    { key: 'coat', title: 'Coat colour', kind: 'swatch', options: swatches('coat', COATS), value: look.coat },
    { key: 'marks', title: 'Markings colour', kind: 'swatch', options: swatches('marks', MARKS), value: look.marks, dimmed: !!marksNote, note: marksNote },
    { key: 'pattern', title: 'Pattern', kind: 'pill', options: pills(PATTERNS), value: look.pattern },
    { key: 'fur', title: 'Fur', kind: 'pill', options: pills(FURS), value: look.fur },
    { key: 'eyes', title: 'Eyes', kind: 'swatch', options: swatches('eyes', EYES), value: look.eyes },
    { key: 'size', title: 'Size', kind: 'range', value: look.size },
    { key: 'personality', title: 'Personality', kind: 'personality', options: pills(PERSONALITY_CHOICES), value: draft.personality },
    { key: 'name', title: 'Name', kind: 'name', value: draft.name },
  ];
  return {
    title: b.mode === 'edit' ? `Change ${b.start.name}` : 'Make your own cat',
    rows,
    marksDimmed: !!marksNote,
    marksNote,
    blurb: CAT_BLURBS[breed],
    name: draft.name,
    nameValid: validPetName(draft.name),
    canDone: validPetName(draft.name),
    confirmLeave: b.confirmLeave,
    breed,
    look,
  };
}

const e = escapeHtml;

function rowBody(row, model) {
  if (row.kind === 'swatch') {
    return `<div class="cb-colours${row.dimmed ? ' dimmed' : ''}">${row.options.map((o) =>
      `<button class="cb-sw" data-cb-pick="${row.key}" data-cb-value="${e(o.id)}" aria-pressed="${o.id === row.value}" aria-label="${e(o.label)}" style="--sw:${e(o.hex)}"></button>`).join('')}</div>`
      + (row.note ? `<p class="cb-note">${e(row.note)}</p>` : '');
  }
  if (row.kind === 'pill') {
    return `<div class="cb-pills">${row.options.map((o) =>
      `<button class="cb-pill" data-cb-pick="${row.key}" data-cb-value="${e(o.id)}" aria-pressed="${o.id === row.value}">${e(o.label)}</button>`).join('')}</div>`;
  }
  if (row.kind === 'range') {
    return `<div class="cb-size"><span>Small</span><input type="range" data-cb-size min="${SIZE.MIN}" max="${SIZE.MAX}" step="${SIZE.STEP}" value="${row.value}" aria-label="Size"><span>Big</span></div>`;
  }
  if (row.kind === 'personality') {
    return `<div class="cb-pills">${row.options.map((o) =>
      `<button class="cb-pill" data-cb-personality="${e(o.id)}" aria-pressed="${o.id === row.value}">${e(o.label)}</button>`).join('')}</div>`
      + `<p class="cb-blurb">${e(model.blurb)}</p>`;
  }
  return `<input type="text" data-cb-name value="${e(row.value)}" maxlength="${NAME_MAX}" autocomplete="off" autocapitalize="words" enterkeyhint="done" aria-label="Cat name">`
    + '<p class="cb-hint">Pet names are 2–16 letters, spaces, or hyphens.</p>';
}

export function renderBuilderHtml(model) {
  const rows = model.rows.map((r) => `<section class="cb-row" data-cb-row="${r.key}"><h3>${e(r.title)}</h3>${rowBody(r, model)}</section>`).join('');
  const leave = model.confirmLeave
    ? '<div class="cb-leave" role="alertdialog" aria-labelledby="cb-leave-q"><span id="cb-leave-q">Leave without saving?</span> <button data-cb-leave>Leave</button> <button data-cb-stay>Keep going</button></div>'
    : '';
  // Not now and Done share one solid band stuck to the bottom (.cb-foot)
  return `<div class="cb-head"><h2>${e(model.title)}</h2></div>`
    + rows
    + `<div class="cb-foot"><button data-cb-cancel>✕ Not now</button>`
    + `<button class="cb-done" data-cb-done${model.canDone ? '' : ' disabled'}>Done, now dress it up →</button></div>`
    + leave;
}
