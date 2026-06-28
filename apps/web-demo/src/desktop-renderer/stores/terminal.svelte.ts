/**
 * Integrated terminal visibility. A single terminal dock lives at the app
 * shell bottom (full window width) and is bound to the selected thread; this
 * store only tracks whether it's shown. Toggled via the thread header button
 * or ⌃` (VS Code muscle memory).
 */
class TerminalStore {
  visible = $state(false);

  toggle(): void {
    this.visible = !this.visible;
  }

  hide(): void {
    this.visible = false;
  }
}

export const terminal = new TerminalStore();
