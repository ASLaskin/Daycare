// Transcripts on disk, one JSON file per session.

import DaycareKit
import Foundation

struct TranscriptCache: Sendable {
  // Rows kept per session on disk
  static let limit = 1500

  private let directory: URL

  init() {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    directory = base.appendingPathComponent("transcripts", isDirectory: true)
    try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  }

  func load(_ session: SessionId) -> Transcript? {
    guard let data = try? Data(contentsOf: file(session)) else {
      return nil
    }
    return try? JSONDecoder().decode(Transcript.self, from: data)
  }

  func save(_ transcript: Transcript, for session: SessionId) {
    var bounded = transcript
    bounded.trim(keeping: TranscriptCache.limit)
    bounded.synced = false
    guard let data = try? JSONEncoder().encode(bounded) else {
      return
    }
    try? data.write(to: file(session), options: .atomic)
  }

  func remove(_ session: SessionId) {
    try? FileManager.default.removeItem(at: file(session))
  }

  func removeAll() {
    try? FileManager.default.removeItem(at: directory)
    try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  }

  private func file(_ session: SessionId) -> URL {
    let safe = session.rawValue.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? session.rawValue
    return directory.appendingPathComponent("\(safe).json")
  }
}
