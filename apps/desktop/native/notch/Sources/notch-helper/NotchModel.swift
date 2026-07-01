import SwiftUI
import Combine

/// The notch's observable state. Fed by stdin frames (via `apply`) and by the
/// view's hover callback. `onChange` lets the panel controller resync window
/// geometry/visibility after any mutation without Combine plumbing.
@MainActor
final class NotchModel: ObservableObject {
    @Published var running: Int = 0
    @Published var completed: [NotchThread] = []
    @Published var toast: NotchThread? = nil
    @Published var hover: Bool = false

    /// Called after any state change so the controller can resize/show/hide.
    var onChange: () -> Void = {}

    private var toastClear: DispatchWorkItem?

    /// Only on screen when a run is in flight or a finished run is unread.
    var visible: Bool { running > 0 || !completed.isEmpty || toast != nil }

    /// Expanded = a finish is toasting, or the user hovers with unread finishes.
    var expandedShown: Bool { toast != nil || (hover && !completed.isEmpty) }

    func apply(_ frame: Incoming) {
        switch frame.type {
        case "state":
            running = frame.running ?? 0
            completed = frame.completed ?? []
        case "finish":
            if let id = frame.id, let title = frame.title {
                showToast(NotchThread(id: id, title: title))
            }
        default:
            break
        }
        onChange()
    }

    private func showToast(_ t: NotchThread) {
        toast = t
        toastClear?.cancel()
        let work = DispatchWorkItem { [weak self] in
            self?.toast = nil
            self?.onChange()
        }
        toastClear = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0, execute: work)
    }
}
