# peach-pi

Local-first macOS GUI for the pi coding agent. Glossary of domain language.
Implementation details live in `docs/REWRITE_PLAN.md` and `docs/adr/`, not here.

## Language

### Surfaces

**Main Window**:
The full app — sidebar, thread list, timeline, composer. The primary surface.
_Avoid_: dashboard, home.

**HUD**:
The persistent floating composer that stays on screen over other apps while you
work, does not hide on blur, and can reveal live chat content on demand. Toggled
with ⌘⇧Space. Has its own active thread, independent of the Main Window. The only
overlay surface (the old ephemeral summon-and-vanish launcher was removed).
_Avoid_: overlay, launcher, transparent mode, headless mode.

**Background mode**:
Not a separate feature — simply the HUD left up while the Main Window is closed.
The app keeps running and the agent keeps working; the dock icon reopens the Main
Window.
_Avoid_: headless mode.

### Remote

**Host session**:
A session on a master machine that peach-pi serves over the tailnet so another
peach-pi can observe it. The master runs the real `AgentSession`; serving is off
by default and exposes one or more chosen threads. See ADR-0009.
_Avoid_: server mode, remote control.

**Attach**:
Connecting a laptop's peach-pi read-only to a Host session — the conversation
renders in the normal timeline with no composer. You watch and pull; you do not
steer the remote session (v1).
_Avoid_: join, mirror, remote into.

**Session tap**:
The one-way conversation stream from a Host session to an attached peach-pi.
Distinct from **DevTap**, which taps app *runtime* telemetry, not the
conversation.
_Avoid_: feed, relay (the relay is the transport, not the stream).

**Checkpoint branch**:
A disposable `wip/<sessionId>` branch the master snapshots the working tree onto
(tracked + untracked) so work travels by git without polluting real history. A
checkpoint is transport, not endorsement — squash/cherry-pick if good, delete if
wrong.
_Avoid_: backup branch, save point.
