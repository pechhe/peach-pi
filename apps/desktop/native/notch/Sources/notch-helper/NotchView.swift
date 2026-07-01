import SwiftUI

/// The island content, drawn top-centre inside the fixed full-width window.
/// Closed = exactly the notch (invisible/merged); running expands the *width*
/// at notch height (tucked, flanking counts); a finish pulses ("bounce out");
/// opened grows downward into a clickable session list. Layout adapted from
/// jwintz/pi-island (MIT).
struct NotchView: View {
    @ObservedObject var model: NotchModel

    private let sideWidth: CGFloat = 44
    private let openAnim = Animation.spring(response: 0.42, dampingFraction: 0.78)
    private let closeAnim = Animation.spring(response: 0.38, dampingFraction: 0.9)
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
    private var bottomRadius: CGFloat { isOpen ? 24 : 14 }

    var body: some View {
        VStack(spacing: 0) {
            content
                .frame(width: size.width, height: size.height, alignment: .top)
                .background(.black)
                .clipShape(NotchShape(topCornerRadius: topRadius, bottomCornerRadius: bottomRadius))
                // Faint edge so the opened island reads against dark wallpapers.
                .overlay(
                    NotchShape(topCornerRadius: topRadius, bottomCornerRadius: bottomRadius)
                        .stroke(.white.opacity(isOpen ? 0.09 : 0), lineWidth: 0.5)
                )
                // Proximity peek: stretch downward toward the approaching cursor.
                .scaleEffect(x: 1 + (isOpen ? 0 : model.peek * 0.05),
                             y: 1 + (isOpen ? 0 : model.peek * 0.30),
                             anchor: .top)
                .scaleEffect(model.flash ? 1.06 : 1.0, anchor: .top)
                .shadow(color: (isOpen || model.peek > 0.01) ? .black.opacity(0.55) : .clear,
                        radius: isOpen ? 14 : 8, y: isOpen ? 6 : 4)
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

    /// Cross-fade + slide between the tucked header and the opened list, so
    /// the island's contents morph with the shape instead of snapping.
    @ViewBuilder private var content: some View {
        ZStack(alignment: .top) {
            if isOpen {
                openedContent
                    .transition(.opacity.combined(with: .move(edge: .top)))
            } else {
                header
                    .transition(.opacity)
            }
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
            Text("\(model.running.count)")
                .foregroundStyle(.white.opacity(0.9))
                .font(.system(size: 12, weight: .semibold))
                .monospacedDigit()
                .contentTransition(.numericText())
        }
    }

    private var completedBadge: some View {
        HStack(spacing: 4) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.blue).font(.system(size: 12))
                .scaleEffect(model.flash ? 1.25 : 1.0)
            Text("\(model.completed.count)")
                .foregroundStyle(.white.opacity(0.9))
                .font(.system(size: 12, weight: .semibold))
                .monospacedDigit()
                .contentTransition(.numericText())
        }
    }

    // MARK: - Opened: badges flank the physical notch, session lists below.
    private var openedContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Top strip mirrors the tucked layout so the open morph is continuous.
            HStack {
                if !model.running.isEmpty { runningBadge }
                Spacer()
                if !model.completed.isEmpty { completedBadge }
            }
            .padding(.horizontal, 16)
            .frame(height: model.closedNotchSize.height)

            ScrollView {
                VStack(alignment: .leading, spacing: 3) {
                    if !model.running.isEmpty {
                        sectionHeader("Running")
                        ForEach(model.running) { t in
                            SessionRow(thread: t, running: true) { model.openThread(t.id) }
                        }
                    }
                    if !model.completed.isEmpty {
                        sectionHeader("Finished")
                        ForEach(model.completed) { t in
                            SessionRow(thread: t, running: false) { model.openThread(t.id) }
                        }
                    }
                }
                .padding(.horizontal, 8)
            }
            .scrollBounceBehavior(.basedOnSize)
            .scrollIndicators(.hidden)
            .padding(.bottom, 10)
        }
    }

    private func sectionHeader(_ label: String) -> some View {
        Text(label.uppercased())
            .font(.system(size: 10, weight: .semibold))
            .kerning(0.8)
            .foregroundStyle(.white.opacity(0.35))
            .padding(.horizontal, 10)
            .padding(.top, 6)
            .padding(.bottom, 2)
    }
}

// MARK: - Rows

/// One clickable session row with a proper hover affordance: the row lights
/// up, the title brightens, an open-arrow slides in, and the cursor becomes a
/// pointing hand. Press gives a small scale-down.
private struct SessionRow: View {
    let thread: NotchThread
    let running: Bool
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 9) {
                ZStack {
                    if running {
                        HexDotMatrix(dotSize: 2.0, gap: 1.6)
                    } else {
                        Image(systemName: "checkmark")
                            .font(.system(size: 7.5, weight: .heavy))
                            .foregroundStyle(.black)
                            .frame(width: 14, height: 14)
                            .background(Circle().fill(.blue))
                    }
                }
                .frame(width: 18)

                Text(thread.title.isEmpty ? "Untitled session" : thread.title)
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(.white.opacity(hovering ? 0.98 : 0.75))
                    .lineLimit(1)
                    .truncationMode(.tail)

                Spacer(minLength: 4)

                Image(systemName: "arrow.up.forward")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.6))
                    .opacity(hovering ? 1 : 0)
                    .offset(x: hovering ? 0 : -4)
            }
            .padding(.horizontal, 10)
            .frame(height: 34)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(.white.opacity(hovering ? 0.11 : 0))
            )
            .contentShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
        }
        .buttonStyle(RowButtonStyle())
        .onHover { h in
            withAnimation(.easeOut(duration: 0.12)) { hovering = h }
            // set() (not push/pop) so a row disappearing mid-hover can't
            // leave an unbalanced cursor stack.
            (h ? NSCursor.pointingHand : NSCursor.arrow).set()
        }
    }
}

/// Small scale-down while pressed, springing back on release.
private struct RowButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(response: 0.2, dampingFraction: 0.7), value: configuration.isPressed)
    }
}
