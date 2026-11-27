# Story cards: a "story so far" card for every place with a mission

Date: 2026-11-28 (written 2026-11-27). Branch `story-cards`. Owner request: when a player begins a walk in a place that has a mission or story, show a simple SHORT card with the big picture in two to four kid-readable lines (players are 9 and 11), so she knows the goal as soon as she begins. It is separate from, and additional to, clues, toasts and the written guide.

## The places and their arcs (read from the code, 2026-11-27)

State is already saved; nothing new is needed to know where she is. "Step" is `state.<place>.step`.

| Place (area id) | Arc, from the mission file | Where progress is read |
|---|---|---|
| Moon (`moon`) | Pip the robot sleeps (0), wake him (1), two power cells to the Core (2, 3), base awake (4), telescope: Mouse + Cat finds Earth (5), postcard stamped and posted in the rocket (6), launch (7), Earth answers on Earthrise Rock (8). After: Pip's errand each walk, the Relay Station (`relay` bits), the Deep Cell in the cave (`cells` bit 2). | `state.moon` step, cells, relay |
| Reef (`reef`) | Marlo the crab: meet (1), three shells (2, 3, 4: kelp, ledge, cave), tries it on (5), light three lantern corals (6), housewarming parade (7). After: Marlo's errand, Tidewell Station fuses (`lab`), the wreck (`wreck`). | `state.reef` step, shells, lab, wreck |
| Crystal Cave (`crystal`) | Lumi the glow-worm: meet (1), rose, sky, gold spark stones (2, 3, 4), passages lit (5), wake the Heart Crystal (6), show pays (7). After: Lumi's errand, the forge (Circlet), singing stones (songs). Second story (the Echo Deep, behind `crystalDeepOn()`): open by 3 songs + 2 rubbings, then wall, prisms, find Tink, walk Tink home (`deep` bits). | `state.crystal` step, sparks, forge, songs, album, deep |
| Jungle Lodge (`jungle`) | Mossy the tortoise: meet (1), mango, banana, cacao to the kitchen table (2, 3, 4), set the table (5), Rain Supper (6), pays, Rain Lily Charm (7). | `state.jungle` step, fruit |
| Snowville (`snowville`) | Tilly the snow hare: meet (1), three candles to the Square, Pond and Hill lanterns (2, 3, 4), warm up at the hearth (5), Lantern Night show (6), pays, Snowflake Clasp (7). | `state.snowville` step, candles |
| Treehouse (`treehouse`) | Nutmeg the squirrel: meet (1), three letters to Bakery, Bookshop, Bell Tower (2, 3, 4), ring the bell (5), firefly supper (6), pays, Acorn Locket (7). | `state.treehouse` step, letters |
| Greenhouse (`greenhouse`) | Two jobs: the lost seeds and the thirsty plants. No story steps. | journal `ghjobseeds`, `ghjobwater` |
| Lighthouse Point (`lighthouse`) | Two jobs: the lost kitten, the dark lamp. | journal `lhjobkitten`, `lhjoblamp` |
| Appletree Farm (`farm`) | Four jobs: chicks, cow, goat with the hat, mice in the grain store. | journal `jobchicks`, `jobcow`, `jobgoat`, `jobmice` |
| Market Square (`market`) | Six errands: mouse, glove, pigeons, bell and awnings, hungry stray, sit for the song. | journal `mkmouse`, `mkglove`, `mkpigeons`, `mkbell`, `mkstray`, `mkfiddle` |

Left out on purpose: places with finds but no mission (Neighborhood, Park, Seaside, Docks, Woods, River, Moor, Pines, Gorge, Fairground, Rooftops, Old House). The Gorge and the clan places have territory and border play but no story arc with steps; a card there would invent a plot. The Rooftops and the Old House have no mission in the code. If one gets a mission later, the coverage test (below) fails until it has a card.

## The card

- **What it is**: a small panel in the page's own DOM (in `#hud`, the Moon and Reef arrival cards' pattern), a title, two to four lines, an OK button. No mesh, no draw, no animation (so reduced motion is the same), and `pointer-events: none` except on its own OK button.
- **It never blocks the walk or the room.** It does not pause anything, does not take the pointer, sends nothing to a partner. Each player's card is her own, from her own save. A walk-on or a crossing leaves it behind with the old walk (disposed with the session).
- **When it shows automatically**: on the first two walks in the place (`state.walks[area]` is 0 or 1, the Greenhouse arrival card's rule), unless the story there is finished. There is no new save key. A player who has already walked there three times gets it from the button only. It is not shown while the guided first walk's lesson is open. When it shows it replaces the small three-line arrival cards the Moon, Crystal Cave, Greenhouse and Reef already have (they hide themselves behind it), so two cards never stack. Those cards stay for walks three onward where they still apply.
- **When it is up**: until she closes it, or 30 seconds of walk time (the clock is the walk's own `dt`, so a pause or a "Ready?" card does not use it up).
- **Closing it**: tap the OK button (touch); on a keyboard the E key or Enter (the card says so); on a game pad A, B or X. All of them are one press. The key also still does what it does (E interacts): it is only a courtesy so a mouse-locked player has a way. Reduced motion changes nothing: there is no motion to remove.
- **Opening it again**: "Story so far" on the pause card (Esc, or the pad's Start): it closes the pause card and shows the card on the walk, and the B key and the pad's Select button also toggle it during a walk. The button is on the pause card only in places with a story.
- **Progress-aware**: the chapter is picked from the existing step save state (table above). It says the goal in one line, what is done ("2 of 3 are lit"), and what to do next. Spoiler-free beyond the next step: it names the next thing and the plain goal, not the finale. After the story it says what is left to try (the errand each walk, and so on).
- **Job places** (Greenhouse, Lighthouse, Farm, Market) have no story steps, so the card says what the place is, "n of N jobs done" and the next job not yet done (the first in the list). When all are done it says so.
- **Crystal Cave and the second story**: chapters `deeplocked` to `deepdone` are used only when `crystalDeepOn()` is true. With it off, the card after the story offers the forge and the songs instead, so nothing points at a story she cannot play. The owner is about to switch deep on for everyone: nothing else needs to change then.
- **Words**: ALL in `src/ui/storycardwords.js`, one table (`STORY_TEXT`), listed below. The Warrior Cats set can override a chapter in `CLAN_LINES` (one line there today, the Moon's last chapter). Every line must be free of the everyday set's banned words (a test reads both sets).
- **Phone and TV**: the card is `min(90vw, 26em)` wide, 14 px text on a phone (width up to 520; smaller than the arrival cards, because playtesters said messages take a quarter of the phone screen), 18 px elsewhere, the TV size scale (28 px times the TV font factor, as the arrival card) on a TV; it follows a TV mode change (`onTv`). It sits at 22% from the top like the other arrival cards, and the walk's own HUD (joystick, buttons) sits below it.
- **Budgets**: start-up is 676.7 kB of 720: all words and view code are in one lazy chunk (`ui/storycard.js` and `ui/storycardwords.js`), fetched when a walk begins in a place with a story, per player. Start-up gets only: a place-id test and a dynamic import in `game/walk.js`, one `session` field, one line in the frame loop, one button in the pause card, one click route in `main.js`. No area's stage A grows.

## Where the code goes

- `src/ui/storycardwords.js`: the table. `src/ui/storycard.js`: the chapter rules (pure, `chapterFor(place, save, {deepOn})`), the DOM card, the gamepad and key close, the open and toggle. Nothing in it reads the clock or a random number.
- `src/game/walk.js`: at `startWalk`, `session.storyOn = STORY_PLACES.test(areaId)`; if so, import the chunk and create the card (only if the session is still current). Disposed with the session.
- `src/main.js`: `session.storyCard?.update(dt)` in the frame; `btn-story` click opens it then resumes the walk.
- Test: `test/storycards.test.js`, and `tools/verify/story-cards.html` for the pictures.

## The texts (the one table, as built)

#### moon: Pip on the Moon

- **asleep**: A little robot named Pip is asleep by the lander. / Wake him, then find two power cells and take them to the dome. / When the base wakes up, you can send a postcard to Earth!
- **power**: Pip is awake, but the base has no power yet. / Find two power cells ({n} of 2 are in): one on the tall rocks, one at the far beacon. / Take each one to the Core in the dome.
- **bothin**: Both power cells are in! / Go to the dome and watch the base wake up.
- **awake**: The base is awake! Now let us find Earth. / Climb Star Hill and use the telescope. Join the stars: the Mouse, then the Cat. / Then the big dish turns to Earth.
- **earth**: Earth is found! / Write a postcard at the Message Desk in the dome. / Then post it in the rocket.
- **loaded**: Your postcard is in the rocket. / Press the big red button at the launch desk to send it!
- **sent**: Your postcard is on its way to Earth! / Wait on Earthrise Rock. Earth will answer.
- **done**: Earth answered your postcard! The story is done. / Pip has an errand for you each walk.
- **cave**: A glowing cell waits deep in the cave. The dome can use it.
- **relay**: Faint beeps come from the relay station. Can you fix it?

#### reef: Marlo and the Reef

- **unmet**: A shy little crab named Marlo needs a new shell. / Say hello to him on the sand by the ladder.
- **shells**: Marlo’s old shell is cracked. He needs a new one! / Find three shells for him ({n} of 3 so far): in the Kelp Garden, up on the coral ledge, and in a little cave. / Hold the kick button to float up high.
- **tryon**: Marlo has his last shell and is trying it on. / Wait a moment and watch!
- **lanterns**: It fits! Marlo has a new shell. / Now light up the coral: touch the three lantern corals, one after another.
- **party**: The coral is all lit up! / Start the housewarming with Marlo and watch the parade go by.
- **done**: Marlo’s housewarming was a hit! / He has an errand for you each walk.
- **lab**: Climb down the ring by the Sunken Boat to Tidewell Station. It needs fuses.
- **wreck**: An old sunken ship waits, with a treasure chest to find.

#### crystal: Lumi’s Glow

- **unmet**: A baby glow-worm named Lumi has lost her glow. / Say hello to her near the entrance.
- **stones**: Lumi needs three spark stones: rose, sky blue and gold. / Carry each one to its great crystal ({n} of 3 are lit). / The rose one is in the Rose hall, the sky one is across the Blue Pool, the gold one is in the Gold Gallery.
- **heart**: All three crystals are lit and the passages glow! / Last, wake the Heart Crystal, far to the north-east, and watch the lights dance.
- **done**: Lumi has her glow back! The whole cave sparkles. / She has an errand for you each walk.
- **forge**: At the forge you can make a Crystal Circlet.
- **songs**: The singing stones will teach you three songs ({songs} of 3).
- **deeplocked**: A second story waits in the Echo Deep. / To open it, learn all three songs ({songs} of 3) and help Lumi with two errands ({rub} of 2).
- **deepwall**: The Echo Deep is open! A wall there hums a tiny tune. / Hum it back by stepping on the glowing stones in the same order.
- **deepprism**: The wall has slid open. / Turn each prism to match its gem, and a glowing door will open.
- **deepfind**: The glowing door is open! A little fluttering creature named Tink sleeps in a nest beyond it. / Find Tink and say hello.
- **deephome**: Tink is awake and follows you. / Walk him home to his hanging crystals above the Rose hall.
- **deepdone**: Tink is home and singing his little chimes! / He has errands for you each walk.

#### jungle: The Rain Supper

- **unmet**: Mossy, an old tortoise, keeps the jungle lodge. / Say hello to her on the veranda.
- **fruit**: Mossy is planning a Rain Supper and needs three kinds of fruit. / Carry each one to the kitchen table on the veranda ({n} of 3 are there). / The mango grows in the grove, the bananas are across the log bridge, the cacao pod is on a low branch.
- **set**: All three fruits are on the table! / Go to the kitchen table and set it for supper.
- **supper**: The table is set and the lights are on. / Begin the Rain Supper at the table and enjoy the show!
- **done**: The Rain Supper was lovely! Mossy gave you a Rain Lily Charm. / She has an errand for you each walk, and you can share the supper again.

#### snowville: Lantern Night

- **unmet**: A little snow hare named Tilly wants the village lanterns lit before Lantern Night. / Say hello to her.
- **candles**: Tilly wants three lanterns lit before Lantern Night. / Find a glint of candle, carry it to a lantern and light it ({n} of 3 are lit). / The lanterns are by the big fir, by the skating pond and at the foot of the sled hill.
- **warm**: All three lanterns are lit! / Now warm up by the village hearth, and the little lights along the lane come on.
- **glow**: The lights along the lane are twinkling. / Begin Lantern Night and watch the whole village glow!
- **done**: Lantern Night was beautiful! Tilly gave you a Snowflake Clasp. / She has an errand for you each walk, and you can watch the night again.

#### treehouse: Nutmeg’s Letters

- **unmet**: Nutmeg, a red squirrel, is the postmistress of the treehouse village. / Say hello to her by the post box at the roots.
- **letters**: Nutmeg has three letters to deliver, and her basket is too heavy. / Carry each one up the tree ({n} of 3 are delivered). / They go to the Bakery, the Bookshop across the rope bridge and the Bell Tower at the top.
- **bell**: All three letters are delivered! / Climb to the Bell Tower and ring the bell.
- **supper**: Every window in the tree is glowing. / Begin the firefly supper and watch the lanterns light up.
- **done**: The firefly supper was magical! Nutmeg gave you an Acorn Locket. / She has an errand for you each walk, and you can light the supper again.

#### greenhouse: The Gardener’s Jobs

- **intro**: A warm, quiet garden under glass. The gardener could use a helping paw.
- **next / count**: Next: {job} · {n} of {total} jobs done.
- **job seeds**: Five seed packets blew away. Find them, then sow them in the seed tray by the potting bench.
- **job water**: Some of the pots look thirsty. Take the watering can from by the potting bench and water every plant.
- **all done**: Both of the gardener’s jobs are done! / Look around: butterflies, a pond and rooms to explore.

#### lighthouse: Lighthouse Point

- **intro**: A lighthouse by the sea, with a cottage at its foot. Two jobs are waiting.
- **next / count**: Next: {job} · {n} of {total} jobs done.
- **job kitten**: The cat at the cottage door is missing her little kitten. Follow the mews and bring it home.
- **job lamp**: The great lamp at the top of the tower is dark. Find the lever and light it for the ships.
- **all done**: The kitten is home and the lamp is lit! / Look around: the shore, the pool and the tower are full of little finds.

#### farm: Appletree Farm

- **intro**: A busy farm with four small jobs. Nothing is ever caught or hurt.
- **next / count**: Next: {job} · {n} of {total} jobs done.
- **job chicks**: The hen has lost her four chicks. Find them all.
- **job cow**: Walk ahead of the cow and she will follow you to the milking shed.
- **job goat**: The goat has the farmer’s straw hat! Catch up with it.
- **job mice**: Five mice are after the grain. Walk up to each one and it will run home.
- **all done**: All four farm jobs are done! / Look around: there are more things to find on the farm.

#### market: Market Square

- **intro**: A lively market with six little errands. There is no hurry.
- **next / count**: Next: {job} · {n} of {total} errands done.
- **job mouse**: A mouse is playing behind the cheese stall. Go near it and watch it dart about.
- **job glove**: Someone dropped a glove by the east bench. Carry it to the flower seller.
- **job pigeons**: Pigeons are sitting on the cafe tables. Send them up.
- **job bell**: When the bicycle bell rings, run to the three awnings as fast as you can.
- **job stray**: A thin cat sits behind the fish stall. Bring him the fish head.
- **job fiddle**: The fiddler plays a whole song for a cat who sits still nearby.
- **all done**: All six errands are done! / The market is yours to explore.

Clan-set lines (replace the same chapter when the Warrior Cats words are on):

- **moon.done**: Earth answered your postcard, and Silverpelt shines beside it! The story is done. / Pip has an errand for you each walk.

