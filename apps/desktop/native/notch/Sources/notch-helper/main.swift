import AppKit
import SwiftUI

/// A fixed, full-width, transparent panel pinned to the top of the notch screen
/// and living above the menu bar. It never resizes — the SwiftUI `NotchView`
/// grows/shrinks the black island *inside* it (that's the spring "bounce"). The
/// panel ignores mouse events while closed (clicks pass through to the menu bar
/// / apps behind) and accepts them only while opened; hover/click detection is
/// done with global `NSEvent` monitors. Window setup adapted from
/// jwintz/pi-island (MIT).
final class NotchPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

@MainActor
final class NotchController {
    private let model: NotchModel
    private let panel: NotchPanel

    init(screen: NSScreen) {
        let geometry = NotchGeometry(screen: screen)
        model = NotchModel(geometry: geometry)

        let height: CGFloat = 600
        let frame = NSRect(
            x: screen.frame.origin.x,
            y: screen.frame.maxY - height,
            width: screen.frame.width,
            height: height)

        panel = NotchPanel(
            contentRect: frame,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false)
        panel.isFloatingPanel = true
        panel.level = .mainMenu + 3
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.isMovable = false
        panel.hidesOnDeactivate = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        panel.ignoresMouseEvents = true

        panel.contentView = NSHostingView(rootView: NotchView(model: model))
        panel.setFrame(frame, display: true)
        panel.orderFrontRegardless()

        model.onOpenThread = { id in emitOpen(id) }
        // Accept clicks only while opened; otherwise let them pass through to the
        // menu bar / app behind. A non-activating panel delivers row clicks
        // without stealing key focus from the user's current app, so we do NOT
        // activate/makeKey on hover-open (that would be jarring).
        model.onStatusChange = { [weak panel] status in
            panel?.ignoresMouseEvents = (status != .opened)
        }

        startStdinReader { [weak model] frame in model?.apply(frame) }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var controller: NotchController?
    func applicationDidFinishLaunching(_ notification: Notification) {
        guard let screen = NSScreen.notchScreen else { return }
        controller = NotchController(screen: screen)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
