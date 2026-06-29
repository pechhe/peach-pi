// Light tap feedback for native-feel interactions.
//
// Two paths, because mobile web haptics are fragmented:
//   • Vibration API (`navigator.vibrate`) — Android Chrome / installed PWAs.
//   • A hidden `<input type="checkbox" switch>` — iOS Safari 17.4+ has *no*
//     Vibration API, but toggling a native switch inside the tap gesture emits
//     the system "tick" haptic. Clicking it programmatically from within a real
//     pointer/click handler counts as a user gesture, so the tick fires.
//
// Both are best-effort and silently no-op where unsupported.

let switchEl: HTMLInputElement | null = null;

function iosSwitch(): HTMLInputElement | null {
  if (typeof document === "undefined") return null;
  if (switchEl) return switchEl;
  const label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  label.style.cssText =
    "position:fixed;left:-9999px;top:0;width:0;height:0;overflow:hidden;pointer-events:none;opacity:0";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", ""); // iOS 17.4+ native switch
  label.appendChild(input);
  document.body.appendChild(label);
  switchEl = input;
  return input;
}

/** Fire a light tap. Call from inside a real user-gesture handler. */
export function haptic(ms = 8): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(ms);
    }
  } catch {
    // Some engines throw if called outside a gesture — ignore.
  }
  const sw = iosSwitch();
  if (sw) {
    try {
      sw.click();
    } catch {
      // ignore
    }
  }
}
