import SwiftUI

/// Peach Pi's hex dot-matrix loader, ported to SwiftUI (from
/// `src/lib/components/loaders/hex/hex-1.svelte`): 19 dots in rows 3-4-5-4-3
/// with a glow chasing the hexagon perimeter (two heads, half a lap apart).
/// Drawn with `Canvas` + `TimelineView(.animation)` so it animates without a
/// per-dot view tree.
struct HexDotMatrix: View {
    var color: Color = .green
    var dotSize: CGFloat = 2.3
    var gap: CGFloat = 2.0
    var speed: Double = 1.6

    private static let rowCounts = [3, 4, 5, 4, 3]
    private static let rowPitchRatio = 0.8660254 // sqrt(3)/2

    // hex-1 opacity constants.
    private static let base = 0.1, mid = 0.2, high = 0.96, center = 0.1
    private static let trailSpan = 5.0
    private static let perimeter = [
        "0,0", "0,1", "0,2", "1,3", "2,4", "3,3", "4,2", "4,1", "4,0", "3,0", "2,0", "1,0",
    ]

    /// (row, col, count) for every cell, precomputed once.
    private static let cells: [(row: Int, col: Int, count: Int)] = {
        var out: [(Int, Int, Int)] = []
        for (row, count) in rowCounts.enumerated() {
            for col in 0..<count { out.append((row, col, count)) }
        }
        return out
    }()

    private var colPitch: CGFloat { dotSize + gap }
    private var rowPitch: CGFloat { colPitch * Self.rowPitchRatio }
    private var matrixWidth: CGFloat { dotSize * 5 + gap * 4 }
    private var matrixHeight: CGFloat { dotSize * 5 + (rowPitch - dotSize) * 4 }

    var body: some View {
        TimelineView(.animation) { timeline in
            let cycle = 1.5 / speed
            let t = timeline.date.timeIntervalSinceReferenceDate
            let phase = (t.truncatingRemainder(dividingBy: cycle)) / cycle
            Canvas { ctx, size in
                let ox = (size.width - matrixWidth) / 2 + matrixWidth / 2
                let oy = (size.height - matrixHeight) / 2 + matrixHeight / 2
                for c in Self.cells {
                    let cx = ox + (CGFloat(c.col) - CGFloat(c.count - 1) / 2) * colPitch
                    let cy = oy + (CGFloat(c.row) - 2) * rowPitch
                    let op = opacity(row: c.row, col: c.col, phase: phase)
                    let rect = CGRect(x: cx - dotSize / 2, y: cy - dotSize / 2, width: dotSize, height: dotSize)
                    ctx.fill(Path(ellipseIn: rect), with: .color(color.opacity(op)))
                }
            }
        }
        .frame(width: matrixWidth, height: matrixHeight)
    }

    private func opacity(row: Int, col: Int, phase: Double) -> Double {
        let id = "\(row),\(col)"
        if id == "2,2" { return Self.center }
        if let idx = Self.perimeter.firstIndex(of: id) {
            let len = Double(Self.perimeter.count)
            let headA = phase * len
            let headB = (headA + len / 2).truncatingRemainder(dividingBy: len)
            let g = max(glow(head: headA, at: Double(idx)), glow(head: headB, at: Double(idx)) * 0.74)
            return min(Self.high, g)
        }
        return max(Self.base, col == 2 ? Self.mid : 0.18)
    }

    private func glow(head: Double, at pathIndex: Double) -> Double {
        let len = Double(Self.perimeter.count)
        let d = ((head - pathIndex).truncatingRemainder(dividingBy: len) + len).truncatingRemainder(dividingBy: len)
        let g = 1 - smoothstep(0, Self.trailSpan, d)
        return Self.base + g * (Self.high - Self.base)
    }

    private func smoothstep(_ e0: Double, _ e1: Double, _ x: Double) -> Double {
        guard e1 > e0 else { return x >= e1 ? 1 : 0 }
        let t = max(0, min(1, (x - e0) / (e1 - e0)))
        return t * t * (3 - 2 * t)
    }
}
