import AppKit
import Combine

/// Global + local mouse monitors. Global monitors observe the cursor even while
/// our window ignores mouse events (so we can detect hover/click over the notch
/// without capturing the menu bar). Adapted from jwintz/pi-island (MIT).
@MainActor
final class EventMonitors {
    static let shared = EventMonitors()

    let mouseLocation = PassthroughSubject<CGPoint, Never>()
    let mouseDown = PassthroughSubject<Void, Never>()

    private init() {
        NSEvent.addGlobalMonitorForEvents(matching: [.mouseMoved]) { [weak self] _ in
            self?.mouseLocation.send(NSEvent.mouseLocation)
        }
        NSEvent.addLocalMonitorForEvents(matching: [.mouseMoved]) { [weak self] e in
            self?.mouseLocation.send(NSEvent.mouseLocation); return e
        }
        NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown]) { [weak self] _ in
            self?.mouseDown.send()
        }
        NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown]) { [weak self] e in
            self?.mouseDown.send(); return e
        }
    }
}
