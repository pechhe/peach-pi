import SwiftUI

/// The island content, drawn top-centre inside the fixed full-width window.
/// Closed = exactly the notch (invisible/merged); running expands the *width*
/// at notch height (tucked, flanking counts); a finish pulses ("bounce out");
/// opened grows downward into a clickable finished-thread list. Layout adapted
/// from jwintz/pi-island (MIT).
struct NotchView: View {
    @ObservedObject var model: NotchModel

    private let sideWidth: CGFloat = 44
    private let openAnim = Animation.spring(response: 0.42, dampingFraction: 0.78)
    private let closeAnim = Animation.spring(response: 0.45, dampingFraction: 1.0)
    private let flashAnim = Animation.spring(response: 0.3, dampingFraction: 0.55)
    // Snappy, slightly springy tracking so the peek follows the cursor live.
    private let peekAnim = Animation.interactiveSpring(response: 0.24, dampingFraction: 0.66)

    private var isOpen: Bool { model.status == .opened }
    private var visible: Bool { model.hasActivity || model.status != .closed }

    private var expansionWidth: CGFloat {
        guard model.hasActivity, !isOpen else { return 0 }
        return 2 * sideWidth
    }
    private var size: CGSize {
        isOpen
            ? model.openedSize
            : CGSize(width: model.closedNotchSize.width + expansionWidth,
                     height: model.closedNotchSize.height)
    }
    private var topRadius: CGFloat { isOpen ? 12 : 6 }
    private var bottomRadius: CGFloat { isOpen ? 22 : 14 }

    var body: some View {
        VStack(spacing: 0) {
            content
                .frame(width: size.width, height: size.height, alignment: .top)
                .background(.black)
                .clipShape(NotchShape(topCornerRadius: topRadius, bottomCornerRadius: bottomRadius))
                // Proximity peek: stretch downward toward the approaching cursor.
                .scaleEffect(x: 1 + (isOpen ? 0 : model.peek * 0.05),
                             y: 1 + (isOpen ? 0 : model.peek * 0.30),
                             anchor: .top)
                .scaleEffect(model.flash ? 1.06 : 1.0, anchor: .top)
                .shadow(color: (isOpen || model.peek > 0.01) ? .black.opacity(0.5) : .clear,
                        radius: 8, y: 4)
                .animation(isOpen ? openAnim : closeAnim, value: model.status)
                .animation(openAnim, value: size)
                .animation(flashAnim, value: model.flash)
                .animation(peekAnim, value: model.peek)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .opacity(visible ? 1 : 0)
        .animation(.easeInOut(duration: 0.2), value: visible)
        .preferredColorScheme(.dark)
    }

    @ViewBuilder private var content: some View {
        if isOpen {
            openedContent
        } else {
            header
        }
    }

    // MARK: - Closed / hint: counts flanking the notch at notch height.
    private var header: some View {
        HStack(spacing: 0) {
            ZStack {
                if !model.running.isEmpty { runningBadge }
            }
            .frame(width: sideWidth)
            Color.clear.frame(width: max(0, model.closedNotchSize.width - 12))
            ZStack {
                if !model.completed.isEmpty { completedBadge }
            }
            .frame(width: sideWidth)
        }
        .frame(height: model.closedNotchSize.height)
    }

    private var runningBadge: some View {
        HStack(spacing: 4) {
            HexDotMatrix()
            Text("\(model.running.count)").foregroundStyle(.white).font(.system(size: 12, weight: .semibold))
        }
    }

    private var completedBadge: some View {
        HStack(spacing: 4) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.blue).font(.system(size: 12))
                .scaleEffect(model.flash ? 1.25 : 1.0)
            Text("\(model.completed.count)").foregroundStyle(.white).font(.system(size: 12, weight: .semibold))
        }
    }

    // MARK: - Opened: running + finished session lists.
    private var openedContent: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 12) {
                if !model.running.isEmpty { runningBadge }
                if !model.completed.isEmpty { completedBadge }
                Spacer()
            }
            .padding(.top, model.closedNotchSize.height - 6)

            if !model.running.isEmpty {
                sectionHeader("Running")
                ForEach(model.running) { t in row(t, running: true) }
            }
            if !model.completed.isEmpty {
                sectionHeader("Finished")
                ForEach(model.completed) { t in row(t, running: false) }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14).padding(.bottom, 12)
    }

    private func sectionHeader(_ label: String) -> some View {
        Text(label.uppercased())
            .foregroundStyle(.white.opacity(0.4))
            .font(.system(size: 10, weight: .semibold)).kerning(0.6)
            .padding(.top, 2)
    }

    private func row(_ t: NotchThread, running: Bool) -> some View {
        Button(action: { model.openThread(t.id) }) {
            HStack(spacing: 8) {
                if running {
                    HexDotMatrix(dotSize: 2.0, gap: 1.6)
                } else {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(.blue)
                }
                Text(t.title.isEmpty ? "Untitled thread" : t.title)
                    .foregroundStyle(.white).font(.system(size: 13)).lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10).padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color.white.opacity(0.06)))
        }
        .buttonStyle(.plain)
    }
}
