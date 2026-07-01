import AppKit

extension NSScreen {
    /// The physical notch size (falls back to a sensible pill on non-notch Macs).
    /// Adapted from jwintz/pi-island (MIT).
    var notchSize: CGSize {
        guard safeAreaInsets.top > 0 else { return CGSize(width: 220, height: 32) }
        let notchHeight = safeAreaInsets.top
        let left = auxiliaryTopLeftArea?.width ?? 0
        let right = auxiliaryTopRightArea?.width ?? 0
        guard left > 0, right > 0 else { return CGSize(width: 180, height: notchHeight) }
        return CGSize(width: frame.width - left - right + 4, height: notchHeight)
    }

    var hasPhysicalNotch: Bool { safeAreaInsets.top > 0 }

    var isBuiltinDisplay: Bool {
        guard let n = deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? CGDirectDisplayID
        else { return false }
        return CGDisplayIsBuiltin(n) != 0
    }

    /// The screen that owns the notch (prefer a physical notch, else built-in).
    static var notchScreen: NSScreen? {
        screens.first(where: { $0.hasPhysicalNotch })
            ?? screens.first(where: { $0.isBuiltinDisplay })
            ?? main
    }
}

/// Pure geometry for hit-testing global mouse positions against the notch and
/// the opened panel (both in screen coordinates).
struct NotchGeometry {
    let screenRect: CGRect
    let notchRect: CGRect

    init(screen: NSScreen) {
        screenRect = screen.frame
        let size = screen.notchSize
        notchRect = CGRect(
            x: screen.frame.midX - size.width / 2,
            y: screen.frame.maxY - size.height,
            width: size.width,
            height: size.height)
    }

    var notchSize: CGSize { notchRect.size }

    /// Rect an opened panel of `size` occupies, anchored top-centre.
    func openedRect(_ size: CGSize) -> CGRect {
        CGRect(
            x: screenRect.midX - size.width / 2,
            y: screenRect.maxY - size.height,
            width: size.width,
            height: size.height)
    }

    /// Notch hit area, padded so hover/click is forgiving.
    func isPointInNotch(_ p: CGPoint) -> Bool {
        notchRect.insetBy(dx: -14, dy: -6).contains(p)
    }

    func isPointInOpened(_ p: CGPoint, size: CGSize) -> Bool {
        openedRect(size).contains(p)
    }
}
