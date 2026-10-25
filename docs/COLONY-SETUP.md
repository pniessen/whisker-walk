# Switching on the shared colony

The shared colony keeps the stray cats both kids have fed in one place online, so each of them sees the other's progress. That needs a few new tables in the game's Supabase database, and this page is how to add them. It takes about five minutes.

## 1. Why this is needed

The game can't create its own database tables, so you run one file once and the colony can then be shared between the two devices.

## 2. Run the setup file

1. Open your project at [supabase.com](https://supabase.com) and sign in.
2. In the left sidebar, click **SQL Editor**, then **New query**.
3. Open `docs/supabase-colony.sql` from this project, copy **the whole file**, and paste it into the editor.
4. Click **Run**. You should see "Success. No rows returned".

It's safe to run the file again, for example if you aren't sure the first run finished. Re-running keeps the existing colony data. It doesn't touch the tables the game already uses (saves, profiles and friendships).

(If you see an error about `profiles`, the original setup file `docs/supabase-setup.sql` hasn't been run on this project yet. Run that file first, the same way, and then this one.)

## 3. Check it worked

1. Click **Table Editor** in the left sidebar. Six new tables should be listed: `colonies`, `colony_members`, `colony_invites`, `colony_cats`, `colony_feeds` and `colony_trades`. They will be empty, and that's expected.
2. Click **Database**, then **Functions**. Nine new functions should be listed:
   `colony_invite_open`, `colony_invite_join`, `colony_invite_answer`, `colony_sync`, `colony_feed`, `colony_dress`, `colony_trade_offer`, `colony_trade_answer` and `colony_trade_cancel`.
   You'll also see a tenth function, `colony_authed`. It's a helper the other nine use, and the game can't call it directly.

## 4. Two-device test checklist

Use two devices (or two browsers), one for each child, each with its own pet name set in **Social**.

1. **Pair.** On device A, open the **🐈 Colony** tab and tap **Get a sharing code**. On device B, type that code under **Got a code?** and tap **Join**. Device A asks "… wants to share your colony. Is that them?" Tap **Yes, share!** Both devices should then say "Shared with …".
2. **Feed the same cat from both.** On a walk on device A, touch noses with a stray and feed it. Then do the same with the same cat on device B. The cat's bar in the Colony tab should show both of them: "you fed 1 · … fed 1".
3. **"While you were out".** Close the game on device A. Feed a cat on device B, then reopen the game on A. A "While you were out 🐾" card should say what B did.
4. **Walk together.** With both devices on the home screen, tap **🐾 Walk with …** in Social on either one. Both should end up on the same walk without typing a code.
5. **Trade.** On device A, offer one of your accessories for one of B's (you can't trade the bell or the bandana). Accept on device B. After a moment each device should have the other's item.

## 5. How to unpair

The game itself has no "unpair" button, because nobody should lose the colony by accident. If you need to undo a pairing (for example, the wrong two players got paired), you can do it here.

1. **Find the player id.** In the game, each child's **friend code** in Social looks like `CAT-3FA85F64`. The 8 characters after `CAT-` are the start of that player's id. In **SQL Editor**, run this query with your code's 8 characters:

   ```sql
   select player_id, pet_name from profiles where player_id like lower('3FA85F64') || '%';
   ```

   It shows the full player id (something like `3fa85f64-5717-4562-b3fc-2c963f66afa6`) and the pet name, so you can check it's the right child.

2. **Unpair that player.** Run this, with the full player id pasted between the quotes:

   ```sql
   delete from colony_members where player_id = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
   ```

   To separate the two children completely, run it once for each of them. After that, both can pair again from the Colony tab.

What happens to the cats depends on how many players you removed. If you remove only one, the other child keeps the colony and its cats on the server. Their next "sharing code" pairs the new partner into that same colony. If you remove both, their next pairing starts a fresh, empty colony on the server. The old colony's cats stay in the tables but nobody is linked to them any more.

## 6. Before you run the file

Nothing breaks if the file hasn't been run yet. Each device keeps its own colony, just for that player. The Colony tab says **"Colony sharing isn't switched on yet."** Everything else in the game works as usual. Once you run the file, sharing turns on the next time the game opens.
