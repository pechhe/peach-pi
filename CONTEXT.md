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
