// Canned, in-character cat replies. No LLM, no free text — a written pool per
// (personality, phrase-intent). Keeps messaging offline/safe like v8 chat.
const INTENT = {
  hi: 'greeting', follow: 'greeting', here: 'greeting', boop: 'greeting',
  play: 'play', zoomies: 'play',
  nice_cat: 'compliment', good_walk: 'compliment',
  brb: 'farewell', bye: 'farewell',
  love: 'emote', happy_cat: 'emote', paw: 'emote', sparkle: 'emote', fish: 'emote', laugh: 'emote',
};
export function intentFor(phraseId) { return INTENT[phraseId] || 'misc'; }
export function countsAsGreet(phraseId) { return intentFor(phraseId) === 'greeting'; }

// One pool per personality per intent. Every personality needs greeting/play/
// compliment/farewell/emote/misc (emote/misc may be short reaction lines).
const REPLIES = {
  tabby: {
    greeting: ['Oh! Hello there 🐾', 'Sniff sniff — hi!', 'Ooh, a friend!'],
    play: ['Ooh, what did you find?', 'Adventure? Yes!', 'Let\'s go dig around!'],
    compliment: ['You have a good nose too!', 'Aw, shucks 😽', 'I found that treasure myself!'],
    farewell: ['Off exploring? Bye!', 'Leave a scent trail!', 'Catch you on the trail!'],
    emote: ['🐾', 'Sniff sniff!'],
    misc: ['Curious…', 'Hmm, what\'s this?'],
  },
  siamese: {
    greeting: ['HI HI HI! 😻', 'YOU\'RE HERE!! Let\'s GO!', 'AAAH hi hi hi!'],
    play: ['CHASE ME CHASE ME!', 'GO GO GO GO!', 'Squirrel! No wait — YOU! Play!'],
    compliment: ['I KNOW RIGHT?!', 'Tell me MORE!', 'Loudest thank you ever!! 📣'],
    farewell: ['NO WAIT COME BACK— ok bye!', 'Byyye byyye byyye!', 'One more zoomie first! ...ok bye!'],
    emote: ['😻', 'MEOW!'],
    misc: ['Wait what was I doing', 'SO MUCH ENERGY'],
  },
  persian: {
    greeting: ['*yawn* …hi.', 'Mm. Hello.', 'Oh. It\'s you. Hi.'],
    play: ['…maybe after a nap.', 'Five more minutes 😴', 'Play is exhausting to think about.'],
    compliment: ['I know. Thank you.', 'Naturally.', 'Aww, pet me some more?'],
    farewell: ['Bye… zzz.', 'Wake me never.', 'Mm, off you go.'],
    emote: ['😴', 'Purrrr…'],
    misc: ['…', 'Just resting my eyes.'],
  },
  black: {
    greeting: ['Hello, friend. No fear here.', 'Hey! Good to see you.', 'Bold hello!'],
    play: ['Let\'s go — nothing scares me!', 'Race you across the yard!', 'Play? Always ready.'],
    compliment: ['Ha, thanks — I try.', 'Brave AND handsome, I know.', 'You\'re pretty great yourself.'],
    farewell: ['Fear nothing. Bye!', 'Off to explore. Later!', 'Stay bold. Bye!'],
    emote: ['🖤', 'Steady as ever.'],
    misc: ['Nothing rattles me.', 'Watching, unbothered.'],
  },
  calico: {
    greeting: ['Hi hi! Look at all these colors!', 'Ooh, hello!', 'Hi! Wanna see something cool?'],
    play: ['BUTTERFLY! Gotta pounce!', 'Pounce time!! 🦋', 'Tag — you\'re it!'],
    compliment: ['Aw, you noticed my patches!', 'Thank youuu 😸', 'I try to be extra colorful.'],
    farewell: ['Bye! Off to pounce more things!', 'See ya — butterflies await!', 'Bye bye, playful one!'],
    emote: ['🦋', 'Pounce!'],
    misc: ['Ooh, shiny!', 'So many colors, so little time!'],
  },
  mainecoon: {
    greeting: ['Hey there.', 'Well, hello.', 'Good to see you, friend.'],
    play: ['Sure, I\'ll play. Slowly.', 'Alright, let\'s have some fun.', 'I move big but I\'m in.'],
    compliment: ['Thanks. I\'m a big deal.', 'Much obliged.', 'Kind of you to say.'],
    farewell: ['Take care. Bye.', 'Steady on. Bye.', 'See you around.'],
    emote: ['🐾', 'Unbothered.'],
    misc: ['All good here.', 'Just being large and calm.'],
  },
  zeetoo: {
    greeting: ['Legend says hello.', 'The nose knows — hi!', 'Ah, a fellow adventurer. Hi!'],
    play: ['I can sniff out the best games.', 'Follow my nose — let\'s play!', 'Legendary zoomies incoming!'],
    compliment: ['The legend appreciates that.', 'My nose thanks you.', 'High praise, well earned.'],
    farewell: ['The trail calls. Bye!', 'Until next time, friend.', 'Off on another legendary sniff. Bye!'],
    emote: ['✨', 'Sniff... legendary.'],
    misc: ['The nose senses something...', 'A true adventurer never rests.'],
  },
  rosa: {
    greeting: ['Good day to you.', 'Greetings, and well met.', 'Ah, hello there.'],
    play: ['Very well — a spot of play.', 'I shall play, formally.', 'Splendid. Let us proceed to play.'],
    compliment: ['You are most kind.', 'I appreciate the compliment, truly.', 'Why, thank you.'],
    farewell: ['Farewell, until we meet again.', 'Good day to you. Farewell.', 'I bid you adieu.'],
    emote: ['🎩', 'Composed, as always.'],
    misc: ['Quite so.', 'Indeed.'],
  },
  robbie: {
    greeting: ['HIYA!! Chaos time!', 'HEY HEY HEY!', 'Yo!! Let\'s CAUSE something!'],
    play: ['POUNCE CHAMPION incoming!!', 'Let\'s knock stuff over!!', 'Play?? OBVIOUSLY YES!'],
    compliment: ['I AM the champion, thank you!', 'Ha! Told ya I\'m the best!', 'Aww shucks, I know 😏'],
    farewell: ['Byeee — more chaos elsewhere!', 'Gotta go knock something over. Bye!', 'Later! Stay chaotic!'],
    emote: ['🐮', 'CHAOS!'],
    misc: ['What can I pounce next...', 'Maximum chaos mode: ON.'],
  },
  hagrid: {
    greeting: ['Bwak?! 🐔', 'Bok bok!', 'Bwak bwak, hello!'],
    play: ['BWAK BWAK BWAK!', 'Flap flap!', 'Bok! Chase time!'],
    compliment: ['Bok? Bwak 😳', 'Cluck ♥', 'Bwaaawk, thank you!'],
    farewell: ['Bwaaak~', 'Bok. (bye)', 'Cluck cluck, farewell!'],
    emote: ['🐔', 'Bwak!'],
    misc: ['Bwak.', 'Bok bok bok...'],
  },
};
const GENERIC = { greeting: ['Hi!', 'Mrrp?'], play: ['Play!', 'Pounce!'], compliment: ['Purr 😽', 'Thanks!'], farewell: ['Bye!', 'Later!'], emote: ['🐾'], misc: ['Mrrp.'] };

export const PERSONALITY_KEYS = Object.keys(REPLIES);

// Deterministic index from a small string+number hash (no Math.random — keeps
// a cat's reply stable within an interaction; varies across cats/seeds).
function pick(pool, seed, phraseId) {
  if (!pool || pool.length === 0) return '';
  let h = seed >>> 0;
  for (const ch of String(phraseId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pool[h % pool.length];
}
export function replyFor(personality, phraseId, seed = 0) {
  const table = REPLIES[personality] || GENERIC;
  const intent = intentFor(phraseId);
  const pool = table[intent] || table.misc || GENERIC.misc;
  return pick(pool, seed, phraseId);
}
