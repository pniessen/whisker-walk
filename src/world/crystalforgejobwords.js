// The words of Lumi's forge job (milestone C3): the three offers, the toasts, the circlet's pay line, the guide's goal and chip lines and the set-down line. A lazy file (the wing C stage's
// chunk, never start-up). The everyday set is the plain base; the Clan set adds light flavour only. No series word is in the everyday set and none of the banned words (dark, lost forever,
// trapped, stuck, collapse, cave-in, scary) is in either. Every id is a literal (the phrase table's scan reads them).
import { addPhrases } from '../clanphrases.js';
import { seriesMode, SERIES_ON } from '../wordset.js';

const clan = (everyday, flavoured) => () => (seriesMode() === SERIES_ON ? flavoured : everyday);

export const CRYSTAL_FORGE_LINES = Object.freeze({
  'crystal.wc.forge.pick.cap': clan('Pick up the glow-cap', 'Pick up the glow-cap, soft as moonlight'),
  'crystal.wc.forge.pick.water': clan('Scoop up some falls water', 'Scoop up some falls water, cool and bright'),
  'crystal.wc.forge.pick.shard': clan('Pick up the rose shard', 'Pick up the rose shard, pink as dawn'),
  'crystal.wc.forge.got.cap': clan('A glow-cap, warm and soft. Take it to the forge.', 'A glow-cap, warm and soft. Carry it to the forge.'),
  'crystal.wc.forge.got.water': clan('A cupful of bright falls water. Take it to the forge.', 'A cupful of bright falls water. Carry it to the forge.'),
  'crystal.wc.forge.got.shard': clan('A rose shard, pink as sunrise. Take it to the forge.', 'A rose shard, pink as sunrise. Carry it to the forge.'),
  'crystal.wc.forge.give': clan('Put it in the forge', 'Put it in the forge, gently'),
  'crystal.wc.forge.make': clan('Make the circlet at the anvil', 'Make the circlet at the anvil'),
  'crystal.wc.forge.in': clan('It glows in the forge.', 'It glows in the forge like a tiny sunset.'),
  'crystal.wc.forge.made': clan('The forge hums, and the Crystal Circlet is made!', 'The forge hums, and the Crystal Circlet is made!'),
  'crystal.wc.forge.pay': clan('The Crystal Circlet', 'The Crystal Circlet'),
  'crystal.wc.forge.setdown': clan('You set it down. It will wait for you.', 'You set it down. It will wait for you.'),
  'crystal.wc.guide.cap': clan('Find a glow-cap in the mushroom grotto: {at}.', 'Find a glow-cap in the mushroom grotto: {at}.'),
  'crystal.wc.guide.water': clan('Scoop falls water at the plunge pool: {at}.', 'Scoop falls water at the plunge pool: {at}.'),
  'crystal.wc.guide.shard': clan('Find the rose shard by the end of the old tracks: {at}.', 'Find the rose shard by the end of the old tracks: {at}.'),
  'crystal.wc.guide.give': clan('Take it to the forge: {at}.', 'Take it to the forge: {at}.'),
  'crystal.wc.guide.make': clan('Make the Crystal Circlet at the anvil: {at}.', 'Make the Crystal Circlet at the anvil: {at}.'),
  'crystal.wc.guide.chip.find': clan('The forge needs a gift', 'The forge needs a gift'),
  'crystal.wc.guide.chip.give': clan('Take it to the forge', 'Take it to the forge'),
});

addPhrases(CRYSTAL_FORGE_LINES);
