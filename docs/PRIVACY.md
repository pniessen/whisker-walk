<!--
Notes for the owner (not part of the published page).

Before this goes anywhere public:
  1. Fill in the placeholders marked [LIKE THIS]: the publication date, and the
     country or region where the Supabase project keeps its data (Supabase
     dashboard -> Project settings -> General). The repository does not record
     the region, so it could not be filled in here.
  2. Have a lawyer read it. The game is aimed at children, so the US children's
     privacy law (COPPA), the UK Children's Code and the EU's rules for
     children are likely to apply, and they ask for more than a policy (for
     example a parent's verifiable consent before a child's data is stored
     online, and a stated time limit on keeping it).
  3. Check that privacy@whiskerwalk.org really receives mail.
  4. If the website moves to whiskerwalk.org, add the DNS provider under
     "Other services involved" if it sits in front of the site's traffic.
  5. The appendix at the end lists where the game falls short of a stricter
     policy. It is for you; cut it before publishing.

Every statement below was checked against the code and the database setup
files (docs/*.sql) on 2026-11-15, on the commit after 2b8b138. The database
itself was not contacted for this check. If the game changes what it stores
or sends, this page has to change with it.

Changed on 2026-11-16 (branch offline-first): the game no longer contacts the
database for a device that has not been put online. "Put online" means a cat
name is saved in Play together, or the device is linked to a cloud save
(src/game/cloudsync.js, onlineAllowed). The short version, the table, "Before
you have turned anything on", "Deleting your data" and appendix item 1 were
rewritten to match, and test/offlinefirst.test.js holds the game to it. This
too was checked against the code and its tests only, not the live database or
a real device.
-->

# Whisker Walk privacy policy

> **Draft of 15 November 2026. Not yet reviewed by a lawyer, and not yet in force.**

**Last updated:** [DATE]

Whisker Walk is a small game about walking a cat. It is run by one person, a parent, not by a company. This page says what the game keeps, where it keeps it, what it sends over the internet and when, and how to have it removed.

## The short version

- You can play the whole game without telling it anything about yourself. It never asks for a real name, an age, an email address or a password.
- The game has no ads, no tracking and no analytics.
- Your game is saved on your own device.
- **Nothing is stored online until you tap Save to cloud or save a cat name in Play together.**
- **Until then the game does not contact its online database at all.** The only other things that reach it are ones you tap yourself: Load from cloud (it sends the code you typed) and Delete my online data. The details are in "What goes online, and when".
- The only thing you type that other players can see is your cat's name. Please pick a cat name, not your real name.
- Online data is not removed automatically. You can delete it from inside the game, or ask for it to be deleted.

## At a glance

| What | When | Why | How long it is kept | How to delete it |
|------|------|-----|---------------------|------------------|
| Your game, album and settings, on your device | From the first time you play | So the game remembers your progress | Until you remove it | **Start over** in Game settings, clear the site's data in the browser, or delete the app |
| A random device id and a random secret, on your device | Made the first time the game opens | To tell devices apart without accounts | Until you remove it | Same as above |
| A "does this device have friends?" question, sent to the database with the device id and secret | Only once you have saved a cat name or the device is linked to a cloud save: then at the start of every walk on your own, and when Play together is opened | To bring friends' cats into your walk | Not stored by the game. The database provider's own logs record the connection (see "Other services involved") | Nothing to delete in the game's tables |
| Cloud save: your save and album, a save code, a secret, your total points, the time of the last upload | After you tap **Save to cloud**; then again after each walk and after some changes at home | So you can move your game to another device | Until you delete it. Never removed automatically | **Delete my online data**, or write to us |
| Cat profile: cat name, breed, look, what it wears, rank title, the device id and secret, when it was last seen | After you save a cat name; refreshed after walks and when the cat changes | So people you play with can see your cat | Until you delete it. Never removed automatically | **Delete my online data**, or write to us |
| Friend links: two device ids, how many times they have greeted, the last time | When two players greet on a walk, or one adds the other by friend code | For the Friends list and friends' visits | Until one of the two deletes their online data | **Delete my online data**, or write to us |
| Shared colony: the cats in it, who found, fed, tamed and dressed them, tradeable accessories, trade offers | Only after two players pair their colonies | So two players can look after one colony | Until both players delete their online data. See "What stays after that" | **Delete my online data** (your part), or write to us |
| Walking together: where your cat is, what it does, its name and look, picked phrases | While you are in a shared walk | So the other players see your cat | Not stored by the game | Nothing to delete |

## What stays on your device

The game saves these in your browser's storage (or inside the app on an iPhone or iPad).

- Your progress: points, walks, what your cat owns and wears, your journal, skills, den and colony.
- Your album: small pictures the game takes of the game world. The game never uses your camera or your photo library.
- Your settings, and a count of how often each screen has been opened. The count stays on the device.
- Backup copies of your save, kept so a mistake can be undone.
- A random id and a random secret that the game makes up for this device the first time it opens. They do not come from your name, an account or the device's serial number.
- If you use cloud save: the save code and its secret.
- The list of players you have met, the list of visitors you have hidden, and which gift codes have been used.
- On the website, an offline copy of the game's own files, so it can start without a connection.

Gift codes are checked on the device. Typing one sends nothing.

Clearing the browser's site data, or deleting the app, removes all of it from that device.

## What goes online, and when

The game's online parts use one database service (see "Other services involved"). A copy of the game built without that service never contacts it; the public website is built with it.

### Before you have turned anything on

A new player who has never tapped **Save to cloud**, never loaded a save from the cloud and never saved a cat name causes no request to the database. The game does not connect to it, in a walk or at home, and it does not make up the device's secret until it is first needed.

Three buttons reach the database before that, and only when they are tapped:

- **Save to cloud** uploads the save (see below). From then on the device counts as online.
- **Load from cloud** sends the save code you typed. The device counts as online once you confirm the load.
- **Delete my online data** asks the database to delete whatever is stored for this device, even if nothing is.

The website itself is still fetched from its host like any web page (see "Other services involved"). That is not the database, and it carries nothing from your game.

### Once a cat name is saved or the device is linked to a cloud save

- **At the start of each walk on your own**, the game asks the database for this device's friend links, so that a friend's cat can drop by. The request carries the device's random id and its secret.
- **When the Play together screen is opened**, the game asks the same question to fill in the Friends list.

Nothing is stored from that question. As with any internet request, the database provider can see the device's IP address and the time. A device that uses cloud save but has no cat name sends it too; the database finds no match and answers with an empty list.

### Cloud save

When you tap **Save to cloud**, the game makes up a code (three words and a number) and uploads a copy of your save and your album under that code. After that it uploads again at the end of each walk, and after some changes at home: buying something for the den, changing what your cat wears, picking a different place, and opening a gift code. Stored online:

- the save and the album, exactly as they are on your device;
- the code, a secret that proves later uploads come from your device, your total points, and the time of the last upload.

Anyone who has your code can load a copy of your save. Treat the code like a password, and do not post screenshots of the Cloud save screen. **Load from cloud** sends the code you type. **Unlink** stops further uploads from that device; it does not delete the copy already stored online. To delete it, see "Deleting your data".

### Play together and friends

When you save a cat name, the game uploads a small profile so other players can see your cat. It uploads it again after each walk and whenever the cat's look changes. Stored online:

- your cat's name, its breed and look, what it is wearing, and your rank title;
- your device's random id, its secret, and the time the profile was last updated.

When two players greet each other on a walk, or one adds the other with a friend code, the game stores that those two ids are friends, how many times they have greeted, and when. Looking up a friend code sends the code you typed.

Your friend code is the first part of your device's random id. Share it only with people you know.

### During a shared walk

While you walk with someone, your device sends theirs where your cat is, what it is doing, and its name and look. Chat is a fixed list of phrases and emoji chosen from a wheel; the game cannot send typed messages. These messages pass through the database provider's live-message service to the other players in the room. The game does not store them.

A room is joined with a four-character code. Anyone who has the code can join that room, so share room codes only with the people you mean to walk with.

### The colony

Once you have saved a cat name, the game checks in with the database whenever the home screen or the colony needs to know whether your colony is shared. Until you pair your colony with another player's, that check stores nothing beyond the cat profile above; your colony stays on your device.

After two players pair their colonies (one opens a sharing code, the other types it in, the first says yes), the game stores the shared colony online: the stray cats in it (their game names and where they were found), which player found, fed, tamed or dressed each one, the accessories each player can trade, and trade offers between the two.

### Finding a player in the same room (iPhone and iPad app only)

The iPhone and iPad app is not publicly available yet. If you have it and allow it, the app uses your local network to notice another device running Whisker Walk nearby, so you can join their walk without typing a code. It shares the room code and the cat's name with nearby devices running the app. It does not use your location, and iOS asks your permission first.

## What the game never collects

- Real names, ages, birthdays, email addresses, phone numbers or home addresses.
- Location.
- Photos, camera, microphone or contacts.
- Advertising ids, or anything used to follow you across other apps or sites.
- Payment details. Nothing in the game costs money.

The game itself does not record IP addresses. The services below can see them, as every website's host can.

## Other services involved

The game relies on these services. Each can see ordinary technical details of a connection, such as an IP address and the time, and keeps its own logs under its own policy.

- **Supabase** runs the online database and the live-message service used for shared walks. The data is kept in [COUNTRY OR REGION].
- **GitHub Pages** (GitHub, part of Microsoft) serves the website version of the game.
- **Apple** would deliver the iPhone and iPad app if it is ever offered publicly.

The game's page loads nothing from anywhere else: no outside fonts, no content delivery network, no trackers. Its lettering uses the fonts already on your device. The code libraries it is built from are served from the game's own site.

The game's owner does not sell or share anyone's data, and does not use it for anything other than making the game work.

## Children

Whisker Walk is made for children and is meant to be set up by a parent. It is built so that a child has nothing personal to give it: there are no accounts, no typed chat and no profile beyond a cat's name. The one risk is a child typing a real name as the cat's name, so the game reminds them not to, limits names to letters, and checks them again on the server.

The game does not ask for a parent's permission before the online features are used, and the settings a parent would use are not locked.

Parents: you can see what is stored for your child by opening the game on their device, and you can delete it or ask for it to be deleted at any time.

## How long data is kept

- **On the device:** until you remove it.
- **Online:** cloud saves, cat profiles, friend links and shared colonies are kept until someone deletes them. **Nothing removes them automatically**, however long it has been since the game was last played. There is no time limit today.
- The only things the database clears by itself are small housekeeping items: a colony sharing code stops working after 20 minutes and is removed when the next one is made, only the newest 50 trade offers in a colony are kept, and the counters that limit how fast the database can be used are reset as time passes.
- Messages during a shared walk are not stored by the game.
- The services above keep their own connection logs for their own periods.

## Deleting your data

- **On a device:** use **Start over** in Game settings, or clear the site's data in the browser, or delete the app.
- **Online, from the game:** open ☰ Menu → Cloud save → **Delete my online data** on the device. It deletes the cloud save and album stored under that device's code, and that device's cat profile, friend links and colony sharing. The game on the device stays, except that the cat name used for playing together is cleared, which also stops a profile being uploaded again until a new name is saved. Once the profile and the cloud save are both gone, the game on that device stops contacting the database, until a cat name is saved or Save to cloud is tapped again. It cannot be undone. Do it on each device you have used: another device linked to the same save code would upload the save again.
- **If it says the cloud is busy:** the database limits how many wrong attempts it accepts from everybody together, to stop guessing. If that limit has been reached, deleting is paused for up to ten minutes for everyone. Nothing is lost; try again later, or write to us.
- **What stays after that:** if you shared a colony, your partner keeps it and its cats. Records of who found, fed or tamed those cats, and of finished trades, keep your device's random id, which no longer points to any profile. They go when your partner deletes their online data too.
- **Online, by request:** if you no longer have the device, write to privacy@whiskerwalk.org with your cloud save code, or your friend code, or both, and the matching records will be deleted by hand.

## Security

Saves and profiles can only be changed by a device that holds the matching secret. The database refuses direct reading of saves; a save can be loaded only by someone who has its code. No system is perfectly secure, which is one more reason the game is designed to hold nothing personal.

## Changes

If the game starts storing or sending anything new, this page will be updated first and the date at the top will change.

## Contact

Questions about privacy, or a request to see or delete data: the privacy contact at **privacy@whiskerwalk.org**. Anything else: hello@whiskerwalk.org.

---

## Appendix (for the owner, not for publication): what the code would need to change to match a stricter policy

These are the places where the game as built falls short of what a stricter policy, or a lawyer, is likely to ask for. None of them is fixed by this page.

1. **No network call before opt-in: closed on 2026-11-16, in the code.** A device with no cat name and no cloud-save link now makes no database request and opens no live connection (`src/game/cloudsync.js`: `onlineAllowed`, and `getCloud` is null until it is true; `src/game/rooms.js` opens no room; `src/game/homebasecloud.js` answers the Friends list with an empty list). `test/offlinefirst.test.js` checks it. What is still open here:
   - **It is not a parent's opt-in.** "Online" starts when anybody saves a cat name or taps Save to cloud, and a child can do both. See item 3.
   - **Checked in tests only**, with a stand-in for the database library. Nobody has watched a real browser's network panel or a real iPad since the change.
   - **The iPhone and iPad app's nearby search is not behind this gate.** It uses the local network, not the internet, and starts once Play together has been opened on the device, cat name or not (`src/game/nearby.js`).
   - **A device that uses cloud save but has no cat name still asks for its friend links** at walk start, as before. It could be skipped (no profile, so no links), but that was left alone so that nothing changes for families already online.
2. **Automatic clean-up.** No SQL file deletes old rows. `saves`, `profiles`, `friendships` and the colony tables grow until someone deletes by hand. A stated time limit (for example "removed after 12 months without play") needs a scheduled job in the database, and `saves.updated_at` and `profiles.last_seen` are already there to drive it.
3. **A parent's consent before a child's data is stored online.** There is no consent step and no parent gate: a child can tap Save to cloud or save a cat name. "For grown-ups" is a label, not a lock.
4. **The public reads are still open.** Until Step B of `docs/supabase-v8-hardening.sql` is run, anyone holding the public key can list every cat name and friend link. This page's "Security" section is silent on that; run Step B before publishing.
5. **Deleting can be blocked by a stranger.** The delete functions share one global limit on wrong attempts (`docs/supabase-v9-delete.sql`), so a flood of wrong secrets pauses deletion for everyone.
6. **Leftover ids after a delete.** A deleted player's random id stays in the partner's colony history (`colony_cats.finder_id`, `tamed_by`, `colony_feeds.by_id`, decided trades).
7. **Unlink keeps the online copy.** A stricter policy might expect Unlink to offer the delete.
8. **No way to see or export what is stored**, other than opening the game on the device.
9. **Where the data sits, and who answers for it.** The Supabase region is not recorded in the repository, and the page names a contact role but no postal address; some laws ask for one.
10. **The save secret is handed to anyone who loads by code** (`load_save` returns it, by design, so a second device can keep saving). A save code is therefore the only protection for a cloud save.
