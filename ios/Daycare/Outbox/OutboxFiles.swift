// Outbox queue and attachment files under Application Support.

import DaycareKit
import Foundation

struct OutboxFiles: Sendable {
  private let directory: URL

  init() {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    directory = base.appendingPathComponent("outbox", isDirectory: true)
    try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  }

  private var queueFile: URL { directory.appendingPathComponent("queue.json") }

  func load() -> [OutboxItem] {
    guard let data = try? Data(contentsOf: queueFile) else {
      return []
    }
    return (try? JSONDecoder().decode([OutboxItem].self, from: data)) ?? []
  }

  func save(_ items: [OutboxItem]) {
    guard let data = try? JSONEncoder().encode(items) else {
      return
    }
    try? data.write(to: queueFile, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
  }

  func store(_ data: Data, key: RequestKey, index: Int) throws -> String {
    let name = "\(key.rawValue)-\(index).bin"
    try data.write(to: directory.appendingPathComponent(name), options: .atomic)
    return name
  }

  func read(_ file: String) throws -> Data {
    try Data(contentsOf: directory.appendingPathComponent(file))
  }

  func url(_ file: String) -> URL {
    directory.appendingPathComponent(file)
  }

  func delete(_ item: OutboxItem) {
    item.attachments.forEach { try? FileManager.default.removeItem(at: directory.appendingPathComponent($0.file)) }
  }

  func removeAll() {
    try? FileManager.default.removeItem(at: directory)
    try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  }
}
