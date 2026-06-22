// capture = the compiled binary entry point for Record & Replay.
//
// Captures (emits ONE NDJSON event per line on stdout):
//   - Global mouse clicks (CGEventTap) with resolved AX target: title, role,
//     value, ancestor path + the focused element's value/selected text.
//   - Global keystrokes / typed text (CGEventTap), chunked into text events.
//   - Frontmost window title on change (AX notifications where available,
//     1s poll fallback).
//   - App activation / deactivation (NSWorkspace notifications).
//   - Focus + selection change in the frontmost app (AXObserver):
//       kAXFocusedUIElementChangedNotification, kAXSelectedTextChangedNotification.
//   - Browser URL bar (Chrome/Safari, best-effort via AX).
//   - Screenshots of the frontmost window on click, non-char keypress, focus
//     change, and end-of-typing-burst (deduped to >=1.5s). PNG via ImageIO.
//
// Arg layout: argv[1] = recording id, argv[2] = recordings dir (shots land
// in <recordings>/<id>.shots/).
//
// Requires macOS Accessibility + Input Monitoring permissions granted to
// the launching process (the pi MCP host). If absent, emits a permission
// warning event and exits.
//
// Compile: bash native/build.sh

import Cocoa
import ApplicationServices
import CoreGraphics
import ImageIO
import ScreenCaptureKit
import UniformTypeIdentifiers

let recordingId = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "unknown"
let recordingsRoot = CommandLine.arguments.count > 2
  ? CommandLine.arguments[2]
  : (NSHomeDirectory() + "/.pi/agent/recordings")
let shotsDir = (recordingsRoot as NSString).appendingPathComponent("\(recordingId).shots")
try? FileManager.default.createDirectory(atPath: shotsDir, withIntermediateDirectories: true)

let start = Date()

// ---- emit ----
func emit(_ type: String, _ payload: [String: Any]) {
    let t = Int(Date().timeIntervalSince(start) * 1000)
    let ts = ISO8601DateFormatter().string(from: Date())
    var p = payload
    if p["window"] == nil { p["window"] = frontWindowTitle() ?? NSNull() }
    if p["app"] == nil { p["app"] = frontmostAppBundle() ?? NSNull() }
    let evt: [String: Any] = ["t": t, "ts": ts, "type": type, "payload": p]
    if let data = try? JSONSerialization.data(withJSONObject: evt),
       let line = String(data: data, encoding: .utf8) {
        FileHandle.standardOutput.write((line + "\n").data(using: .utf8)!)
    }
}

// ---- frontmost app / window ----
func frontmostApp() -> NSRunningApplication? {
    return NSWorkspace.shared.frontmostApplication
}
func frontmostAppBundle() -> String? {
    return frontmostApp()?.bundleIdentifier
}
func frontmostPid() -> pid_t? {
    return frontmostApp()?.processIdentifier
}
func frontmostAppElement() -> AXUIElement? {
    guard let pid = frontmostPid() else { return nil }
    return AXUIElementCreateApplication(pid)
}
func frontWindow() -> AXUIElement? {
    guard let app = frontmostAppElement() else { return nil }
    var ref: CFTypeRef?
    AXUIElementCopyAttributeValue(app, kAXMainWindowAttribute as CFString, &ref)
    return axEl(ref)
}
func frontWindowTitle() -> String? {
    guard let win = frontWindow() else { return nil }
    return axAttr(win, kAXTitleAttribute)
}

// ---- AX helpers ----
/** Unwrap a CFTypeRef into an AXUIElement, or nil. AXUIElement is a
    CF_BRIDGED_TYPE(id) — the value is guaranteed to be an AXUIElement when
    returned by the element-valued AX attribute getters we call. */
func axEl(_ ref: CFTypeRef?) -> AXUIElement? {
    guard let r = ref else { return nil }
    return unsafeBitCast(r, to: AXUIElement.self)
}
func axAttr(_ el: AXUIElement, _ attr: String) -> String? {
    var v: CFTypeRef?
    AXUIElementCopyAttributeValue(el, attr as CFString, &v)
    if let s = v as? String { return s }
    return nil
}
func axRole(_ el: AXUIElement) -> String? {
    return axAttr(el, kAXRoleAttribute)
}
/** Description string used as ClickPayload.target: prefer title, else role+value. */
func axLabel(_ el: AXUIElement) -> String? {
    if let t = axAttr(el, kAXTitleAttribute), !t.isEmpty { return t }
    if let v = axAttr(el, kAXValueAttribute), !v.isEmpty { return v }
    if let r = axRole(el) { return r }
    return nil
}
/** Ancestor titles root -> element, for disambiguation (e.g. which panel). */
func axPath(_ el: AXUIElement, maxDepth: Int = 8) -> [String] {
    var path: [String] = []
    var cur: AXUIElement? = el
    var depth = 0
    while let c = cur, depth < maxDepth {
        if let t = axAttr(c, kAXTitleAttribute), !t.isEmpty { path.insert(t, at: 0) }
        var parent: CFTypeRef?
        AXUIElementCopyAttributeValue(c, kAXParentAttribute as CFString, &parent)
        cur = axEl(parent)
        depth += 1
    }
    return path
}
/** Rich AX description at a screen point (system-wide hit-test). */
func axClickTarget(_ location: CGPoint) -> [String: Any]? {
    let system = AXUIElementCreateSystemWide()
    var hovered: AXUIElement?
    AXUIElementCopyElementAtPosition(system, Float(location.x), Float(location.y), &hovered)
    guard let el = hovered else { return nil }
    var d: [String: Any] = [:]
    if let label = axLabel(el) { d["target"] = label }
    if let role = axRole(el) { d["role"] = role }
    if let v = axAttr(el, kAXValueAttribute) { d["value"] = v }
    // For text fields, also grab selected text + focused element's value.
    let focused = frontmostAppElement().flatMap { axFocused($0) }
    if let f = focused, let fv = axAttr(f, kAXValueAttribute), !fv.isEmpty { d["focusedValue"] = fv }
    let path = axPath(el)
    if !path.isEmpty { d["targetPath"] = path }
    // AX identifier / custom hint if exposed (often nil; cheap to ask).
    if let hint = axAttr(el, kAXIdentifierAttribute as String) { d["elementId"] = hint }
    return d.isEmpty ? nil : d
}
func axFocused(_ app: AXUIElement) -> AXUIElement? {
    var ref: CFTypeRef?
    AXUIElementCopyAttributeValue(app, kAXFocusedUIElementAttribute as CFString, &ref)
    return axEl(ref)
}

// ---- browser URL bar (best-effort, Chrome + Safari) ----
func urlBar() -> String? {
    guard let bundle = frontmostAppBundle() else { return nil }
    let isBrowser = bundle.hasPrefix("com.google.Chrome")
        || bundle == "com.apple.Safari"
        || bundle.hasPrefix("org.mozilla.firefox")
        || bundle.hasPrefix("com.microsoft.edgemac")
        || bundle.hasPrefix("com.brave.Browser")
        || bundle.hasPrefix("com.vivaldi.Vivaldi")
    if !isBrowser { return nil }
    // Chrome/Safari expose the address field as an AXTextField under the bar.
    // We do a breadth-first walk of the front window looking for an AXTextField
    // whose value looks like a URL.
    guard let win = frontWindow() else { return nil }
    var found: String?
    var queue: [AXUIElement] = [win]
    var seen = 0
    while !queue.isEmpty, seen < 400 {
        let el = queue.removeFirst()
        seen += 1
        if let role = axRole(el), role == "AXTextField", let v = axAttr(el, kAXValueAttribute),
           v.hasPrefix("http") || v.hasPrefix("about:") {
            found = v; break
        }
        var kids: CFTypeRef?
        AXUIElementCopyAttributeValue(el, kAXChildrenAttribute as CFString, &kids)
        if let arr = kids as? [AXUIElement] { queue.append(contentsOf: arr) }
    }
    return found
}

func checkPermissions() -> Bool {
    return AXIsProcessTrustedWithOptions(
        [kAXTrustedCheckOptionPrompt.takeRetainedValue(): false] as CFDictionary
    )
}

// ---- screenshots ----
var shotIndex = 0
var lastShotT = -10_000
/** Frontmost window bounds via CGWindowList (matches by pid + title). */
func frontWindowBounds() -> (CGRect, CGWindowID)? {
    guard let pid = frontmostPid() else { return nil }
    let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
    guard let list = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else { return nil }
    for w in list {
        guard let owner = w[kCGWindowOwnerPID as String] as? pid_t, owner == pid else { continue }
        guard let wid = w[kCGWindowNumber as String] as? CGWindowID else { continue }
        guard let bounds = w[kCGWindowBounds as String] as? [String: CGFloat] else { continue }
        let layer = (w[kCGWindowLayer as String] as? Int) ?? 0
        if layer == 0, let x = bounds["X"], let y = bounds["Y"], let w = bounds["Width"], let h = bounds["Height"] {
            let r = CGRect(x: x, y: y, width: w, height: h)
            // Prefer the window whose AX title matches the frontmost window.
            return (r, wid)
        }
    }
    return nil
}
/** Capture the frontmost window region to a PNG. Dedups >=1.5s.
    Uses ScreenCaptureKit (macOS 15.2+) — CGWindowListCreateImage/
    CGDisplayCreateImageForRect are deprecated in macOS 15. Fires the SCK
    capture asynchronously and emits the `screenshot` event from its
    completion handler (must not block inside a CGEventTap callback). */
func captureScreenshot(_ trigger: String, _ t: Int) {
    if t - lastShotT < 1500 { return }
    lastShotT = t
    shotIndex += 1
    let index = shotIndex
    let path = (shotsDir as NSString).appendingPathComponent("\(String(format: "%05d", index)).png")
    let srcT = t
    guard let (bounds, _) = frontWindowBounds() else { return }
    SCScreenshotManager.captureImage(in: bounds) { image, error in
        guard let image, error == nil else {
            emit("note", ["note": "SCREENSHOT_FAILED: \(error?.localizedDescription ?? "") — grant Screen Recording permission in System Settings > Privacy & Security."])
            return
        }
        guard let url = URL(string: "file://\(path)") else { return }
        guard let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else { return }
        CGImageDestinationAddImage(dest, image, nil)
        if CGImageDestinationFinalize(dest) {
            emit("screenshot", ["path": path, "trigger": trigger, "index": index, "captureMs": srcT])
        }
    }
}

// ---- text buffer ----
var textBuffer = ""
var lastFlush = 0
func flushTextSoon(_ t: Int) {
    if t - lastFlush > 250 { flushText(t) }
}
func flushText(_ t: Int) {
    if !textBuffer.isEmpty {
        emit("text", ["text": textBuffer])
        // Capture a screenshot at the end of a typing burst so the LLM sees what
        // landed in the field (AX value may lag).
        captureScreenshot("typing-burst", t)
        textBuffer = ""
        lastFlush = t
    }
}

func keyName(_ keycode: Int64, _ flags: CGEventFlags) -> String {
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
    return (mods + [base]).joined(separator: "+")
}

func printableChar(_ keycode: Int64, _ shifted: Bool) -> String? {
    let lower = "abcdefghijklmnopqrstuvwxyz0123456789"
    let map: [Int64: String] = Dictionary(uniqueKeysWithValues: zip(0..<26, lower.prefix(26).map { String($0) }))
    if let c = map[keycode] { return shifted ? c.uppercased() : c }
    if keycode == 36 { return "\n" }
    if keycode == 49 { return " " }
    return nil
}

// ---- CGEventTap callback ----
let callback: CGEventTapCallBack = { proxy, type, event, refcon in
    let t = Int(Date().timeIntervalSince(start) * 1000)
    switch type {
    case .leftMouseDown, .rightMouseDown, .otherMouseDown:
        let pos = event.location
        let btn = type == .leftMouseDown ? "left" : (type == .rightMouseDown ? "right" : "other")
        // Flush any pending text before the click.
        flushText(t)
        var payload: [String: Any] = ["x": pos.x, "y": pos.y, "button": btn]
        if let target = axClickTarget(pos) { payload.merge(target) { _, new in new } }
        emit("click", payload)
        captureScreenshot("click", t)
    case .keyDown:
        let flags = event.flags
        let keycode = event.getIntegerValueField(.keyboardEventKeycode)
        let key = keyName(keycode, flags)
        let shiftOnly = CGEventFlags(rawValue: CGEventFlags.maskShift.rawValue)
        if flags.isEmpty || flags == shiftOnly, let ch = printableChar(keycode, flags.contains(.maskShift)) {
            textBuffer.append(ch)
            flushTextSoon(t)
        } else {
            flushText(t)
            emit("keypress", ["key": key])
            captureScreenshot("keypress", t)
        }
    default:
        break
    }
    return Unmanaged.passUnretained(event)
}

// ---- AX focus observer (reattached on app switch) ----
var observedAppPid: pid_t? = nil
var axObserver: AXObserver?
var observedFocusElement: AXUIElement? = nil
let kNotifications: [String] = [
    kAXFocusedUIElementChangedNotification as String,
    kAXSelectedTextChangedNotification as String,
]

let focusObserverCallback: AXObserverCallback = { _, _, notif, _ in
    let t = Int(Date().timeIntervalSince(start) * 1000)
    let name = notif as String
    guard let app = frontmostAppElement(), let focused = axFocused(app) else { return }
    // Dedup by element identity (kAXFocusedUIElementChanged can fire rapidly).
    if name == (kAXFocusedUIElementChangedNotification as String), focused == observedFocusElement { return }
    observedFocusElement = focused
    var payload: [String: Any] = [:]
    let role = axRole(focused)
    if let role { payload["role"] = role }
    if let v = axAttr(focused, kAXValueAttribute), !v.isEmpty { payload["value"] = v }
    if let t2 = axAttr(focused, kAXTitleAttribute), !t2.isEmpty { payload["element"] = t2 }
    if let url = urlBar() { payload["url"] = url }
    if payload.isEmpty { return }
    flushText(t)
    emit("focus", payload)
    captureScreenshot("focus", t)
}

func attachFocusObserver() {
    guard let pid = frontmostPid() else { return }
    if pid == observedAppPid, axObserver != nil { return }
    detachFocusObserver()
    observedAppPid = pid
    var obs: AXObserver?
    guard AXObserverCreate(pid, focusObserverCallback, &obs) == .success, let obs else { return }
    axObserver = obs
    let appElem = frontMostAppElement(pid: pid)
    for n in kNotifications {
        AXObserverAddNotification(obs, appElem, n as CFString, nil)
    }
    CFRunLoopAddSource(CFRunLoopGetCurrent(), AXObserverGetRunLoopSource(obs), .commonModes)
}
func frontMostAppElement(pid: pid_t) -> AXUIElement {
    return AXUIElementCreateApplication(pid)
}
func detachFocusObserver() {
    if let obs = axObserver {
        if let app = observedAppPid.map({ frontMostAppElement(pid: $0) }) {
            for n in kNotifications {
                AXObserverRemoveNotification(obs, app, n as CFString)
            }
        }
        CFRunLoopSourceInvalidate(AXObserverGetRunLoopSource(obs))
    }
    axObserver = nil
    observedAppPid = nil
    observedFocusElement = nil
}

// ---- window-title poller (fallback: ax notifications sometimes miss titles) ----
var lastWin: String? = nil
let windowTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
    let w = frontWindowTitle()
    if w != lastWin {
        lastWin = w
        if let w {
            emit("window", ["action": "title", "window": w])
            attachFocusObserver()
        }
    }
}

// ---- app activation notifications ----
let notifCenter = NSWorkspace.shared.notificationCenter
notifCenter.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { n in
    guard let app = n.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication else { return }
    let bundle = app.bundleIdentifier ?? "(unknown)"
    let title = frontWindowTitle()
    emit("window", ["action": "activate", "window": title ?? bundle, "app": bundle])
    attachFocusObserver()
}
notifCenter.addObserver(forName: NSWorkspace.didDeactivateApplicationNotification, object: nil, queue: .main) { n in
    flushText(Int(Date().timeIntervalSince(start) * 1000))
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

attachFocusObserver()
CFRunLoopRun()


