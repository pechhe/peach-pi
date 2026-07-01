import AppKit
import Combine
import SwiftUI

enum NotchStatus { case closed, hint, opened }

/// The notch state machine + data, driven by stdin frames (running count,
/// finished-thread list) and by global mouse events (hover/click to open).
/// Structure adapted from jwintz/pi-island (MIT); the session/RPC layer is
/// replaced by our simple `state`/`finish` NDJSON frames.
@MainActor
final class NotchModel: ObservableObject {
    // Data pushed from Electron main.
    @Published private(set) var running: [NotchThread] = []
    @Published private(set) var completed: [NotchThread] = []
    /// A just-finished thread → pulse the notch (the "bounce out").
    @Published private(set) var flash: Bool = false
    /// Cursor proximity to the notch, 0 (far) → 1 (at the notch). Drives the
    /// live "peek" stretch toward the mouse before it fully opens.
    @Published private(set) var peek: CGFloat = 0

    // Interaction state.
    @Published private(set) var status: NotchStatus = .closed

    let geometry: NotchGeometry
    /// Emits open requests back to Electron main (stdout NDJSON).
    var onOpenThread: (String) -> Void = { _ in }
    /// Lets the window toggle click-through as the state changes.
    var onStatusChange: (NotchStatus) -> Void = { _ in }

    private let events = EventMonitors.shared
    private var cancellables = Set<AnyCancellable>()
    private var hoverTimer: DispatchWorkItem?
    private var hintTimer: DispatchWorkItem?
    private var flashTimer: DispatchWorkItem?
    private var isHovering = false

    init(geometry: NotchGeometry) {
        self.geometry = geometry
        setupEventHandlers()
    }

    /// Something is running, or a finish is unread → the notch is on screen.
    var hasActivity: Bool { !running.isEmpty || !completed.isEmpty }

    var closedNotchSize: CGSize { geometry.notchSize }

    /// Opened panel size, sized to the running + finished session lists
    /// (plus a section header for each non-empty group).
    var openedSize: CGSize {
        let headers = (running.isEmpty ? 0 : 1) + (completed.isEmpty ? 0 : 1)
        let rows = max(running.count + completed.count, 1)
        let h = min(
            geometry.screenRect.height - 8,
            closedNotchSize.height + 16 + CGFloat(headers) * 22 + CGFloat(rows) * 38 + 14)
        return CGSize(width: min(geometry.screenRect.width * 0.42, 400), height: h)
    }

    // MARK: - Incoming frames

    func apply(_ frame: Incoming) {
        switch frame.type {
        case "state":
            running = frame.running ?? []
            completed = frame.completed ?? []
            if !hasActivity, status != .opened { close() }
        case "finish":
            triggerFlash()
            if status == .closed { hint() }
        default:
            break
        }
    }

    // MARK: - Mouse handling

    private func setupEventHandlers() {
        events.mouseLocation
            .throttle(for: .milliseconds(40), scheduler: DispatchQueue.main, latest: true)
            .sink { [weak self] loc in self?.handleMove(loc) }
            .store(in: &cancellables)
        events.mouseDown
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.handleDown() }
            .store(in: &cancellables)
    }

    private func handleMove(_ loc: CGPoint) {
        updatePeek(loc)
        let inNotch = geometry.isPointInNotch(loc)
        let inOpened = status == .opened && geometry.isPointInOpened(loc, size: openedSize)
        let hovering = inNotch || inOpened
        guard hovering != isHovering else { return }
        isHovering = hovering
        hoverTimer?.cancel(); hoverTimer = nil
        if hovering, status != .opened, hasActivity {
            // Short dwell so brushing past doesn't fully open, but close enough
            // that reaching the notch after the peek expands promptly.
            let work = DispatchWorkItem { [weak self] in
                guard let self, self.isHovering else { return }
                self.open()
            }
            hoverTimer = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.12, execute: work)
        } else if !hovering, status == .opened {
            // Leaving the opened panel collapses it after a short grace period.
            let work = DispatchWorkItem { [weak self] in
                guard let self, !self.isHovering else { return }
                self.close()
            }
            hoverTimer = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35, execute: work)
        }
    }

    private func handleDown() {
        let loc = NSEvent.mouseLocation
        switch status {
        case .opened:
            if !geometry.isPointInOpened(loc, size: openedSize) { close() }
        case .closed, .hint:
            if hasActivity, geometry.isPointInNotch(loc) { open() }
        }
    }

    /// Continuous proximity: 1 when the cursor is at the notch, fading to 0 by
    /// `radius` points below/beside it. Only active while closed with activity.
    private func updatePeek(_ loc: CGPoint) {
        guard hasActivity, status != .opened else {
            if peek != 0 { peek = 0 }
            return
        }
        let near = geometry.notchRect.insetBy(dx: -46, dy: 0)
        let dx = max(near.minX - loc.x, loc.x - near.maxX, 0)
        let dy = max(near.minY - loc.y, 0) // distance below the notch bottom
        let dist = (dx * dx + dy * dy).squareRoot()
        let radius: CGFloat = 80
        let p = max(0, min(1, 1 - dist / radius))
        if abs(p - peek) > 0.01 { peek = p }
    }

    // MARK: - Transitions

    func open() {
        hintTimer?.cancel(); hoverTimer?.cancel()
        peek = 0
        setStatus(.opened)
    }

    func close() {
        hoverTimer?.cancel()
        setStatus(.closed)
    }

    /// Subtle unread indication after a finish; auto-collapses.
    private func hint() {
        hintTimer?.cancel()
        setStatus(.hint)
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.status == .hint else { return }
            self.setStatus(.closed)
        }
        hintTimer = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0, execute: work)
    }

    private func triggerFlash() {
        flash = true
        flashTimer?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.flash = false }
        flashTimer = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5, execute: work)
    }

    private func setStatus(_ s: NotchStatus) {
        guard s != status else { return }
        status = s
        onStatusChange(s)
    }

    /// A finished-thread row was clicked → tell main to focus it, then collapse.
    func openThread(_ id: String) {
        onOpenThread(id)
        close()
    }
}
