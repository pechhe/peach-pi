import SwiftUI

/// The Dynamic-Island-style content. A black rounded slab fills the whole panel
/// (its top region overlaps the physical notch so the two merge); content is
/// inset below the notch and grows downward. Collapsed = two counts; expanded =
/// a toast (on finish) and a clickable list of finished threads.
struct NotchView: View {
    @ObservedObject var model: NotchModel
    let notchInset: CGFloat
    var onOpen: (String) -> Void

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: notchInset)
            if model.expandedShown {
                expanded
            } else {
                collapsed
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Color.black)
        )
        .contentShape(Rectangle())
        .onHover { model.hover = $0 }
        .animation(.spring(response: 0.32, dampingFraction: 0.82), value: model.expandedShown)
    }

    // MARK: collapsed pill — the two counts flanking the notch.
    private var collapsed: some View {
        HStack(spacing: 14) {
            if model.running > 0 {
                counter(system: "circle.dotted", value: model.running, tint: .green)
            }
            if !model.completed.isEmpty {
                counter(system: "checkmark.circle.fill", value: model.completed.count, tint: .blue)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 5)
        .frame(maxWidth: .infinity)
    }

    // MARK: expanded panel — toast + finished-thread list.
    private var expanded: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 12) {
                if model.running > 0 {
                    counter(system: "circle.dotted", value: model.running, tint: .green)
                }
                counter(system: "checkmark.circle.fill", value: model.completed.count, tint: .blue)
                Spacer()
            }
            .padding(.bottom, 2)

            if let t = model.toast {
                row(t, highlighted: true)
            }
            ForEach(model.completed.filter { $0.id != model.toast?.id }) { t in
                row(t, highlighted: false)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func counter(system: String, value: Int, tint: Color) -> some View {
        HStack(spacing: 5) {
            Image(systemName: system).foregroundStyle(tint)
            Text("\(value)").foregroundStyle(.white).font(.system(size: 13, weight: .semibold))
        }
    }

    private func row(_ t: NotchThread, highlighted: Bool) -> some View {
        Button(action: { onOpen(t.id) }) {
            HStack(spacing: 8) {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(highlighted ? Color.blue : Color.white.opacity(0.7))
                Text(t.title.isEmpty ? "Untitled thread" : t.title)
                    .foregroundStyle(.white)
                    .font(.system(size: 13, weight: highlighted ? .semibold : .regular))
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(highlighted ? Color.white.opacity(0.12) : Color.white.opacity(0.05))
            )
        }
        .buttonStyle(.plain)
    }
}
