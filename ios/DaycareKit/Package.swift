// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "DaycareKit",
  platforms: [.iOS(.v18), .macOS(.v15)],
  products: [
    .library(name: "DaycareKit", targets: ["DaycareKit"]),
  ],
  targets: [
    .target(name: "DaycareKit", path: "Sources"),
    .testTarget(
      name: "WireTests",
      dependencies: ["DaycareKit"],
      path: "Tests/WireTests",
      resources: [.copy("Fixtures")]
    ),
    .testTarget(name: "SyncTests", dependencies: ["DaycareKit"], path: "Tests/SyncTests"),
  ]
)
