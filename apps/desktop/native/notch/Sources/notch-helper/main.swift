import AppKit
import SwiftUI

/// Owns the floating notch panel: computes notch geometry, hosts `NotchView`,
/// and resizes/shows/hides the panel whenever the model changes. The panel is a
/// non-activating, borderless, all-spaces `NSPanel` above the menu bar so it can
/// draw into (and merge with) the physical notch without stealing focus.
@MainActor
final class NotchController {
    private let model = NotchModel()
    private let panel: NSPanel

    init() {
        panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 200, height: 40),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.isFloatingPanel = true
        panel.level = .statusBar
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = false
        panel.isMovable = false
        panel.hidesOnDeactivate = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]

        let root = NotchView(model: model, notchInset: notchInset(), onOpen: { id in emitOpen(id) })
        panel.contentView = NSHostingView(rootView: root)

        model.onChange = { [weak self] in self?.sync() }
        startStdinReader { [weak self] frame in self?.model.apply(frame) }
        sync()
    }

    /// The screen whose top holds the notch (falls back to the main screen).
    private func notchScreen() -> NSScreen? {
        NSScreen.screens.first(where: { $0.safeAreaInsets.top > 0 }) ?? NSScreen.main
    }

    /// Height of the notch/menu-bar region to inset content below.
    private func notchInset() -> CGFloat {
        let top = notchScreen()?.safeAreaInsets.top ?? 0
        return top > 0 ? top : 32
    }

    /// Width of the physical notch (gap between the two usable top areas).
    private func notchWidth(_ s: NSScreen) -> CGFloat {
        let left = s.auxiliaryTopLeftArea?.width ?? 0
        let right = s.auxiliaryTopRightArea?.width ?? 0
        if left > 0, right > 0 { return max(120, s.frame.width - left - right) }
        return 200
    }

    /// Resize + reposition + show/hide the panel from the current model state.
    private func sync() {
        guard let screen = notchScreen() else { return }
        if !model.visible {
            panel.orderOut(nil)
            return
        }
        let inset = notchInset()
        let notch = notchWidth(screen)
        let w: CGFloat
        let h: CGFloat
        if model.expandedShown {
            let rows = max(model.completed.count, model.toast != nil ? 1 : 0)
            w = 380
            h = min(screen.frame.height - 8, inset + 44 + CGFloat(rows) * 38 + 12)
        } else {
            w = notch + 132
            h = inset + 30
        }
        let x = screen.frame.midX - w / 2
        let y = screen.frame.maxY - h
        panel.setFrame(NSRect(x: x, y: y, width: w, height: h), display: true, animate: false)
        panel.orderFrontRegardless()
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var controller: NotchController?
    func applicationDidFinishLaunching(_ notification: Notification) {
        controller = NotchController()
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
