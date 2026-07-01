import Foundation
import AppKit

/// A finished thread the notch lists and can open.
struct NotchThread: Codable, Identifiable, Equatable {
    let id: String
    let title: String
}

/// One NDJSON line from Electron main (see notch-service.ts).
///   { "type": "state", "running": [{id,title}], "completed": [{id,title}] }
///   { "type": "finish", "id": "...", "title": "..." }
struct Incoming: Decodable {
    let type: String
    let running: [NotchThread]?
    let completed: [NotchThread]?
    let id: String?
    let title: String?
}

/// One NDJSON line back to main: the user clicked a finished thread.
private struct OpenMsg: Encodable {
    let type = "open"
    let id: String
}

/// Emit `{ "type":"open", "id":... }` on stdout for main to focus the thread.
func emitOpen(_ id: String) {
    guard let data = try? JSONEncoder().encode(OpenMsg(id: id)) else { return }
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([0x0a]))
}

/// Read NDJSON from stdin on a background queue; deliver decoded frames on the
/// main queue. When stdin closes (Electron main exited) the helper terminates.
func startStdinReader(_ onFrame: @escaping (Incoming) -> Void) {
    DispatchQueue.global(qos: .utility).async {
        while let line = readLine(strippingNewline: true) {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard !trimmed.isEmpty, let data = trimmed.data(using: .utf8) else { continue }
            guard let frame = try? JSONDecoder().decode(Incoming.self, from: data) else { continue }
            DispatchQueue.main.async { onFrame(frame) }
        }
        DispatchQueue.main.async { NSApplication.shared.terminate(nil) }
    }
}
