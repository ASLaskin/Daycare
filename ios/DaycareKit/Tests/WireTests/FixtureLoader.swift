// Loads JSON fixtures written by ios/scripts/fixtures.ts.

import Foundation
import DaycareKit

enum Fixture {
  static func data(_ name: String) throws -> Data {
    guard let url = Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures") else {
      throw CocoaError(.fileNoSuchFile, userInfo: [NSFilePathErrorKey: name])
    }
    return try Data(contentsOf: url)
  }

  static func decode<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
    try JSONDecoder().decode(type, from: data(name))
  }

  // Parsed JSON for structural comparison
  static func object(_ data: Data) throws -> NSObject {
    try JSONSerialization.jsonObject(with: data) as? NSObject ?? NSNull()
  }

  static func names(in folder: String) -> [String] {
    let urls = Bundle.module.urls(forResourcesWithExtension: "json", subdirectory: "Fixtures/\(folder)") ?? []
    return urls.map { "\(folder)/\($0.deletingPathExtension().lastPathComponent)" }.sorted()
  }
}
