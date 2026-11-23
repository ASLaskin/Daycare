// Media files per session, from the media command and media events.

import DaycareKit
import Foundation
import Observation

@MainActor
@Observable
final class MediaStore {
  private(set) var items: [SessionId: [FilePath: MediaItem]] = [:]
  @ObservationIgnored private let connection: Connection

  init(connection: Connection) {
    self.connection = connection
  }

  // Newest first
  func list(_ session: SessionId) -> [MediaItem] {
    (items[session] ?? [:]).values.sorted { ($0.entry ?? -1, $0.modifiedAt) > ($1.entry ?? -1, $1.modifiedAt) }
  }

  // Mentioned files by the entry that mentions them
  func byEntry(_ session: SessionId) -> [Entry: [MediaItem]] {
    let mentioned = list(session).reversed().compactMap { item in item.entry.map { ($0, item) } }
    return Dictionary(grouping: mentioned, by: \.0).mapValues { $0.map(\.1) }
  }

  func apply(_ media: MediaList) {
    let merged = media.items.reduce(into: items[media.session] ?? [:]) { all, item in
      all[item.path] = item
    }
    items[media.session] = merged
  }

  func refresh(_ session: SessionId) async {
    guard let list = try? await connection.request(.media(SessionTarget(session: session)), as: MediaList.self) else {
      return
    }
    items[session] = Dictionary(list.items.map { ($0.path, $0) }, uniquingKeysWith: { first, _ in first })
  }

  func removed(_ session: SessionId) {
    items.removeValue(forKey: session)
  }

  func reset() {
    items = [:]
  }
}
