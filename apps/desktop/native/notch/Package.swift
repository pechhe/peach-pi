// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "notch-helper",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(name: "notch-helper", path: "Sources/notch-helper"),
    ]
)
