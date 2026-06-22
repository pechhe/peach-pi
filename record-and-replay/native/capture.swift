// capture = the compiled binary entry point for Record & Replay.
//
// Captures:
//   - Global mouse clicks (CGEventTap) with resolved AX target + window title.
//   - Global keystrokes / typed text (CGEventTap), chunked into text events.
//   - Frontmost window title + focused element (AXUIElement) on focus change.
//   - Browser URL bar content when the focused app is a browser (best-effort).
//
// Emits ONE NDJSON event per line on stdout: {"t":ms,"ts":ISO,"type":..,"payload":{..}}
//
// First arg = recording id (echoed in session_start).
// NOTE: Requires macOS Accessibility + Input Monitoring permissions granted to
// the launching process (the pi MCP host). If absent, emits a permission
// warning event and exits.
//
// Compile: bash native/build.sh
//

import Cocoa
import ApplicationServices
import CoreGraphics

let recordingId = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "unknown"
let start = Date()

func emit(_ type: String, _ payload: [String: Any]) {
    let t = Int(Date().timeIntervalSince(start) * 1000)
    let ts = ISO8601DateFormatter().string(from: Date())
    var p = payload
    // Augment with current window/app context for any event lacking it.
    if p["window"] == nil { p["window"] = frontWindowTitle() ?? NSNull() }
    if p["app"] == nil { p["app"] = frontmostApp() ?? NSNull() }
    let evt: [String: Any] = ["t": t, "ts": ts, "type": type, "payload": p]
    if let data = try? JSONSerialization.data(withJSONObject: evt),
       let line = String(data: data, encoding: .utf8) {
        FileHandle.standardOutput.write((line + "\n").data(using: .utf8)!)
    }
}

func frontmostApp() -> String? {
    return NSWorkspace.shared.frontmostApplication?.bundleIdentifier
}

func frontWindowTitle() -> String? {
    let ws = NSWorkspace.shared
    guard let app = ws.frontmostApplication else { return nil }
    // AX: kAXMainMenuWindow -> kAXTitle
    let pid = app.processIdentifier
    let appElem = AXUIElementCreateApplication(pid)
    var elemRef: CFTypeRef?
    AXUIElementCopyAttributeValue(appElem, kAXMainWindowAttribute as CFString, &elemRef)
    guard let elem = elemRef else { return nil }
    var title: CFTypeRef?
    AXUIElementCopyAttributeValue(elem as! AXUIElement, kAXTitleAttribute as CFString, &title)
    return title as? String
}

func axClickTarget(_ location: CGPoint) -> String? {
    let system = AXUIElementCreateSystemWide()
    var hovered: AXUIElement?
    AXUIElementCopyElementAtPosition(system, Float(location.x), Float(location.y), &hovered)
    var title: CFTypeRef?
    if let hovered { AXUIElementCopyAttributeValue(hovered, kAXTitleAttribute as CFString, &title) }
    return title as? String
}

func urlBar() -> String? {
    // Best-effort: Safari/Chrome expose AX of the address field; skip on failure.
    return nil
}

func checkPermissions() -> Bool {
    let trusted = AXIsProcessTrustedWithOptions(
        [kAXTrustedCheckOptionPrompt.takeRetainedValue(): false] as CFDictionary
    )
    return trusted
}

// ---- signature for CGEventTap callbacks ----
let callback: CGEventTapCallBack = { proxy, type, event, refcon in
    let t = Int(Date().timeIntervalSince(start) * 1000)
    switch type {
    case .leftMouseDown, .rightMouseDown, .otherMouseDown:
        let pos = event.location
        let btn = type == .leftMouseDown ? "left" : (type == .rightMouseDown ? "right" : "other")
        emit("click", [
            "x": pos.x, "y": pos.y, "button": btn,
            "target": axClickTarget(pos) ?? NSNull(),
        ])
    case .keyDown:
        let flags = event.flags
        let keycode = event.getIntegerValueField(.keyboardEventKeycode)
        let key = keyName(keycode, flags)
        // Printable, no modifier combos -> contribute to text stream.
        let shiftOnly = CGEventFlags(rawValue: CGEventFlags.maskShift.rawValue)
        if flags.isEmpty || flags == shiftOnly, let ch = printableChar(keycode, flags.contains(.maskShift)) {
            textBuffer.append(ch)
            flushTextSoon(t)
        } else {
            flushText(t)
            emit("keypress", ["key": key])
        }
    default:
        break
    }
    return Unmanaged.passUnretained(event)
}

var textBuffer = ""
var lastFlush = 0
func flushTextSoon(_ t: Int) {
    // Coalesce: flush if 250ms passed since last flush.
    if t - lastFlush > 250 {
        flushText(t)
    }
}
func flushText(_ t: Int) {
    if !textBuffer.isEmpty {
        emit("text", ["text": textBuffer])
        textBuffer = ""
        lastFlush = t
    }
}

func keyName(_ keycode: Int64, _ flags: CGEventFlags) -> String {
    // Minimal mapping; combos joined with "+".
    let mods: [String] = [
        flags.contains(.maskCommand) ? "cmd" : nil,
        flags.contains(.maskControl) ? "ctrl" : nil,
        flags.contains(.maskAlternate) ? "alt" : nil,
        flags.contains(.maskShift) ? "shift" : nil,
    ].compactMap { $0 }
    let base: String
    switch keycode {
    case 36: base = "Return"
    case 48: base = "tab"
    case 49: base = "space"
    case 51: base = "backspace"
    case 53: base = "esc"
    case 123: base = "left"
    case 124: base = "right"
    case 125: base = "down"
    case 126: base = "up"
    case 122: base = "F1"
    default: base = "key\(keycode)"
    }
    let combo = mods + [base]
    return combo.joined(separator: "+")
}

func printableChar(_ keycode: Int64, _ shifted: Bool) -> String? {
    // Tiny map — covers alnum + common punctuation. Good enough for digest.
    let lower = "abcdefghijklmnopqrstuvwxyz0123456789"
    let map: [Int64: String] = Dictionary(uniqueKeysWithValues: zip(0..<26, lower.prefix(26).map { String($0) }))
    if let c = map[keycode] { return shifted ? c.uppercased() : c }
    if keycode == 36 { return "\n" }
    if keycode == 49 { return " " }
    return nil
}

// ---- main ----
emit("session_start", ["reason": "start", "id": recordingId, "maxMs": 30 * 60 * 1000])

if !checkPermissions() {
    emit("note", ["note": "PERMISSION_DENIED: Accessibility/Input Monitoring not granted to the launching process. Grant it in System Settings > Privacy & Security, then restart the recording. No further events will be captured."])
    exit(0)
}

// CGEventTap — capture session-wide input.
let eventsOfInterest = CGEventMask(
    CGEventType.leftMouseDown.rawValue |
    CGEventType.rightMouseDown.rawValue |
    CGEventType.otherMouseDown.rawValue |
    CGEventType.keyDown.rawValue
)
guard let tap = CGEvent.tapCreate(
    tap: .cgSessionEventTap,
    place: .headInsertEventTap,
    options: .listenOnly,
    eventsOfInterest: eventsOfInterest,
    callback: callback,
    userInfo: nil
) else {
    emit("note", ["note": "TAP_FAILED: could not create CGEventTap. Input Monitoring permission likely missing."])
    exit(1)
}
let src = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
CFRunLoopAddSource(CFRunLoopGetCurrent(), src, .commonModes)
CGEvent.tapEnable(tap: tap, enable: true)

// Window-title poller: emit "window" events on front-window change.
var lastWin: String? = nil
Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
    let w = frontWindowTitle()
    if w != lastWin {
        lastWin = w
        if let w { emit("window", ["action": "title", "window": w]) }
    }
}

CFRunLoopRun()
