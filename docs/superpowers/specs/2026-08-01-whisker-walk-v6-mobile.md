# Whisker Walk v6 — Mobile Touch Support — Design Spec

**Date:** 2026-08-01
**Status:** Approved by user
**Base:** deployed multiplayer game. Goal: fully playable on phones/tablets
at the same URL; desktop unchanged.

## Controls (touch devices)

- **Left virtual joystick** (appears on touch in the left 40% of the
  screen, anchored where the thumb lands): drag to move, analog — tilt
  < 45% of max radius = stalk (slow + crouch pose, replaces Shift), beyond
  = normal pace. Dead zone 15%.
- **Right-side orbit**: dragging anywhere in the right 60% orbits the
  camera (same sensitivity feel as mouse). A short tap (<300 ms, <10 px
  movement) is a "tap" not a drag: in camera mode it snaps the photo.
- **Action cluster** (bottom-right, above the joystick's mirror position):
  round buttons 🐾 Pounce/Climb · 😺 Meow · 🧶 Yarn · 📷 Camera. 44px+
  targets, safe-area aware.
- **Tappable prompt pill**: the existing contextual prompt ("E — touch
  noses with Pickles") becomes a button on touch — label drops the "E — "
  prefix and tapping it performs the interaction. This replaces the E key
  entirely.
- **Pause**: a small ⏸ button (top-left under the points pill) replaces
  Esc; the Ready/pause overlay's resume button reads "Tap to explore" and
  sets the game running without pointer lock.

## Engagement model

Desktop keeps pointer lock. Touch devices get an `engaged` flag: walk
starts paused (overlay), "Tap to explore" engages, ⏸ disengages back to
the overlay. The simulation gate becomes `player.engaged` (true when
pointer-locked OR touch-engaged). Touch detection: `matchMedia('(pointer:
coarse)')` at startup, rechecked on first touch event (hybrid devices).

## Responsive & platform polish

- Viewport meta (`width=device-width, initial-scale=1, viewport-fit=cover,
  user-scalable=no`), `touch-action: none` on the canvas + game HUD,
  overscroll containment, safe-area insets on all HUD anchors.
- Home base: larger tap targets, inputs that don't zoom the page on focus
  (16px+ font), grid already responsive.
- Landscape recommended (no forced orientation); portrait works with the
  same layout.
- Desktop control-bar hint hidden on touch; replaced by the visible
  buttons themselves.

## Performance on mobile

- `pointer: coarse` devices: shadow map 1024², device pixel ratio cap 1.5,
  stray count 14 (from 22). Everything else unchanged; verify smoothness
  in an emulated mobile viewport and adjust only if needed.

## Multiplayer

Works unchanged — rooms UI is already tap-based; a phone player and a
desktop player can co-walk.

## Out of scope

Native app/PWA install banner, gyro controls, haptics, forced orientation,
gamepad.
