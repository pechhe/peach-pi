# ADR-0002: Single transparent window for the HUD

Status: Accepted (2026-06-17)

## Decision

The HUD (persistent floating composer, see CONTEXT.md) is **one** frameless,
transparent, always-on-top window — not two. Its collapsed and expanded states,
and the visual "separate chat panel floating above a separate composer bar with a
desktop-coloured gap between them", are produced entirely in the renderer: a
transparent window background with two rounded panels and a see-through gap. Expand
animates the window taller via `setBounds`, anchored at the bottom so the composer
stays put and the chat grows upward. Clicks in the transparent gap and rounded
corners pass through to the app behind via `setIgnoreMouseEvents(true, { forward: true })`
toggled by `mousemove` hit-testing.

## Considered Options

- **Two pinned windows** (a tiny composer window + a separate chat window locked to
  it). This was the obvious path — it matches the visual literally, and was the
  user's first instinct.
- **One transparent window painted as two** (chosen).

## Why

Two pinned windows looks simpler but is the harder, buggier path on macOS:

- **Position sync** — pinned windows must move together; macOS `move` events lag
  during drags, so the second window visibly trails/jitters.
- **Focus split** — typing in the composer while a second always-on-top window
  displays chat means two key-window targets fighting each other.
- **Two renderers** — the chat window needs the live transcript stream, the
  composer needs the snapshot: two entry points to keep in sync.
- **Z-order** — both `alwaysOnTop`, requiring constant re-assertion of
  chat-above-composer.

One window pushes all layout into CSS/DOM (cheap — the renderer already does hard
layout) and eliminates window-coordination plumbing (expensive, bug-prone). The
only thing two-windows buys — a real empty gap that passes clicks through for free
— is recovered with mouse-event forwarding, and only matters while expanded (when
the user is interacting with the HUD, not the app behind it).

## Consequences

- The see-through gap is a rendering choice (transparent background), not a window
  boundary. Do not "fix" the single-window design into two windows.
- Letting clicks through the gap/corners requires `mousemove` hit-testing against
  the DOM to toggle `setIgnoreMouseEvents` — accept this fiddliness as the cost of
  avoiding multi-window coordination.
