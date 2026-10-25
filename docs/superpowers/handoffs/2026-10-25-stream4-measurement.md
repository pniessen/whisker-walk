# Stream 4 — how to take the reading

Stream 4 (the graphics pass) can't start until we have real frame-rate numbers
from your desktop and your iPhone 18. The game now has a small readout for
exactly this. It is off unless you turn it on, so the girls won't see it.

This takes about 15 minutes. You'll do two walks on each device and copy a few
numbers into the table at the bottom.

## Turning the readout on

Use either of these:

- **Settings tab → tick "Performance readout (fps counter)".** The box stays
  ticked until you untick it. This is the easy way on the iPhone.
- **Add `?perf` to the address**, e.g. `https://…/whisker-walk/?perf`. This
  turns it on for that page load only and saves nothing.

The readout appears on the right side once a walk starts. It is hidden on the
home screen. Turn it off again afterwards in Settings. (A `?perf` address
keeps it on even when the box is unticked, so drop `?perf` too.)

## What the readout says

This is the layout, not a reading: `N` marks where your numbers appear.

```
NN fps · NN.N ms · worst NN.N ms (3 s)
cpu N.N ms
tier high · setting auto · touch no
shadow 2048 · postFx on · normals on
px ratio 2 · 2560×1440 · strays 22
draws NNNN · shadow NNN · scene NNN · other NN
tris NNN,NNN · scene passes 1
```

- **Line 1:** frames per second (smoothed), the average time per frame, and the
  single slowest frame in the last 3 seconds. The worst frame is what you feel
  as a hitch.
- **cpu:** the game's own work per frame, in milliseconds. If fps is low and cpu
  is also high (say over 12), the game logic is the bottleneck. If fps is low
  but cpu is small, the graphics chip is.
- **tier … strays:** which quality settings this device actually got. Today any
  touch screen gets `low`.
- **draws:** how many separate things the graphics chip was asked to draw this
  frame, split into the shadow pass, the scene, and post-effects (`other`).
  `scene passes 1` confirms the world is drawn once per frame.
- **tris:** triangles drawn this frame.

**Leave "Graphics quality" in Settings on Auto** unless a step below says
otherwise. Auto is what the girls get.

## On the desktop (Chrome)

1. Plug the laptop in, close other heavy tabs, and keep the window at the size
   you normally play at.
2. Open the game with `?perf`. Pick **Cozy Neighborhood** and start a normal
   (daytime, solo) walk.
3. **Stand still at the spawn for 10 seconds.** Write down line 1 and the
   `draws` and `tris` numbers.
4. **Walk for 60 seconds:** down the main street to the end and back, with a
   couple of zoomies (sprint) runs. Glance at the readout every 15 seconds and
   write down the lowest fps and the highest "worst" figure you see.
5. Repeat steps 2–4 in **Harbour Docks** (the busiest area).
6. **Devtools check (once is enough):** press F12, open **Performance**, click
   record, walk for 10 seconds in the Neighborhood, and stop. Hover the
   **Frames** row and screenshot it. Then open the **Summary** tab and screenshot
   that too. This tells us whether the time goes to scripting or to rendering.
7. **Optional but useful:** set Settings → Graphics quality to **Low**, start a
   new **Neighborhood** walk (quality applies on the next walk), then do step 3.
   This shows what the low tier costs on the same machine. Set it back to
   **Auto** afterwards.

## On the iPhone 18 (Safari)

1. Charge it above 50%, and take it out of a case if it's warm. Turn off Low
   Power Mode, since that caps the frame rate. Close other apps.
2. Open the game and tick **Performance readout** in Settings.
3. Hold the phone the way the girls do (portrait is fine).
4. Do the same two walks as on the desktop: **Neighborhood**, then **Docks**.
   Stand still at the spawn for 10 seconds, then play normally for 60 seconds
   using the joystick, including some zoomies.
5. **Take a screenshot** of the screen each time you'd write a number down
   (side button + volume up). Screenshots are better than notes because the
   readout updates twice a second.
6. If the phone gets noticeably warm, mention it. Phones slow themselves down
   when hot, so a warm phone reads worse after a few minutes.

## Why I can't take these myself

When I drive the game in an automated browser, it only draws about 10 frames
every few seconds, so any fps figure I see is meaningless. I can only confirm
that the readout works, and that the draw-call numbers are right. Those are
counted per frame and don't depend on speed.

## Send back

Copy this table and fill it in. Attach the screenshots (phone readout, Chrome
Frames row, Chrome Summary).

| Device | Area | Moment | fps | ms | worst ms | cpu ms | draws | tris | tier |
|---|---|---|---|---|---|---|---|---|---|
| Desktop | Neighborhood | standing at spawn | | | | | | | |
| Desktop | Neighborhood | lowest while walking | | | | | | | |
| Desktop | Docks | standing at spawn | | | | | | | |
| Desktop | Docks | lowest while walking | | | | | | | |
| Desktop (forced Low) | Neighborhood | standing at spawn | | | | | | | |
| iPhone 18 | Neighborhood | standing at spawn | | | | | | | |
| iPhone 18 | Neighborhood | lowest while walking | | | | | | | |
| iPhone 18 | Docks | standing at spawn | | | | | | | |
| iPhone 18 | Docks | lowest while walking | | | | | | | |

Also tell me:
- the desktop's make, model, graphics chip (if you know it) and screen
  resolution;
- whether the iPhone felt smooth, and whether you noticed any hitches;
- anything that looked wrong.

**Why the draws column matters:** each walk places strays, critters and
treasures at random, so two walks in the same area can differ by about 250
draws. Writing down the draws next to each fps figure lets us compare readings
fairly.
