# ADR-0016: Notch surface as a native Swift sidecar

Status: Accepted (2026-07-01)

## Decision

The **Notch** — a Dynamic-Island-style status pill + completion notifier anchored
to the MacBook notch — is a **separate native macOS helper process** (SwiftUI),
not an Electron window. The Electron main process owns all state and drives the
helper over a line-delimited JSON (NDJSON) pipe: main writes state/finish frames
to the helper's stdin, the helper writes click/interaction frames back on stdout.

The helper shows only when there is something to show (a run is in flight, or a
finished run is unread). It surfaces two counts (**running**, **completed-unread**),
pops a toast out of the notch when a run finishes, and expands on hover into a list
of finished threads; clicking one focuses that thread in the Main Window.

## Considered Options

- **Pure Electron transparent window** (a `#notch` route reusing the ADR-0002 HUD
  recipe). Shares the Svelte/theme/dev-loop, but hand-rolls animations and cannot
  read real notch geometry (Electron exposes none), so it must hug *below* the notch.
- **Native Swift sidecar** (chosen). Authentic Dynamic-Island feel, real notch
  geometry via `NSScreen.safeAreaInsets`/`auxiliaryTopLeftArea`, and matches the
  reference projects (Atoll, DynamicNotch, pi-island).

## Why native

The repo already has both muscles this needs, so the "native is messy" cost is
mostly pre-paid:

- **Build**: `record-and-replay/native/capture.swift` already compiles Swift in the
  toolchain and is driven from Node via stdout NDJSON.
- **Bundle/sign**: `CuaDriver.app` is already vendored via `extraResource` + a
  `prePackage` hook and signed/notarized with the app (see `forge.config.ts`).

The sidecar buys real notch geometry and free spring animations that an Electron
window would have to fake. The cost — a SwiftUI island that does not share the
`metal-dye` theme and has its own build step — is accepted: the notch is meant to
read as a macOS system affordance, not as Peach Pi chrome.

## Seam

The completion signal is **not** new: the notch subscribes to `ThreadService`'s
existing frame bus (`{ kind: "status", status, prev }`), exactly like the
`finish-cue-router`. A **clean `completed` transition** (`prev !== "completed"`) is
the finish trigger. The routing/inbox logic is a **pure, Electron-free reducer**
(`notch-state.ts`, unit-tested like `finish-cue.ts`); `notch-service.ts` only reads
Electron globals, spawns the helper, and shuttles NDJSON.

Clicking a finished thread reuses the existing `event:focusThread` + `showMainWindow()`
path — no new renderer IPC is introduced.

## Consequences

- The notch is the third finish-cue *peer* (HUD ambient cue, system notification,
  now notch); the existing `routeFinishCue`/HUD done-badge behaviour is untouched.
- The "completed" count is an **unread inbox**: a finish adds to it; opening the
  thread, or the thread (re)starting, clears it. Not a lifetime tally.
- The helper is optional at runtime: if the binary is missing (e.g. an unbuilt dev
  checkout), `NotchService.start()` logs and no-ops — the app runs without a notch.
- The Swift lives at `apps/desktop/native/notch/` (SwiftPM), built to a `notch-helper`
  binary and shipped via `extraResource`, mirroring the CuaDriver vendoring.

## Window & interaction model

The notch is **one fixed, full-width, transparent `NSPanel`** pinned to the top of
the notch screen at `level = .mainMenu + 3` (above the menu bar), spanning all
Spaces. It **never resizes** — the SwiftUI `NotchShape` grows/shrinks the black
island *inside* the fixed window (spring animation = the "bounce out" of the notch).

- **Closed** = exactly the physical notch size, so it is invisible (merged with
  the notch). While a run is in flight the island stays at notch *height* but
  expands *width* to flank the notch with a spinner + running count ("tucked in").
- **Finish** pulses the island and enters a brief `hint` state, then auto-collapses.
- **Hover** (~0.45s) or **click** on the notch opens it downward into a clickable
  finished-thread list; clicking a row emits `open` and collapses.

The panel `ignoresMouseEvents` while closed (clicks pass through to the menu bar /
apps behind) and accepts them only while opened. Hover/click are detected with
global `NSEvent` monitors, so no menu-bar real estate is captured when idle, and
no Accessibility permission is required. The window/shape/geometry approach is
adapted from **pi-island** (MIT, © 2026 Julien Wintz); see `native/notch/NOTICE.md`.
