// One queued command with its photos, persisted across launches.

import DaycareKit
import Foundation

struct OutboxAttachment: Codable, Hashable, Sendable {
  var name: String
  // File inside the outbox folder
  var file: String
  // Coordinator path once uploaded
  var uploaded: FilePath?
}

struct OutboxItem: Codable, Hashable, Sendable, Identifiable {
  var key: RequestKey
  var command: MobileCommand
  var attachments: [OutboxAttachment]
  var attempts: Int
  var createdAt: Date

  var id: RequestKey { key }

  // Items in one lane run one at a time, in order
  var lane: String { command.session?.rawValue ?? "global" }

  // Upload key: "<item key>:<index>"
  func uploadKey(_ index: Int) -> RequestKey {
    RequestKey("\(key.rawValue):\(index)")
  }

  // Final command with uploaded paths added
  var resolvedCommand: MobileCommand {
    let paths = attachments.compactMap(\.uploaded)
    switch command {
    case .send(var send):
      send.files += paths
      return .send(send)
    case .create(var create):
      create.files += paths
      return .create(create)
    default:
      return command
    }
  }
}

struct OutboxFailure: Hashable, Sendable, Identifiable {
  var id = UUID()
  var method: String
  var message: String
  var at = Date()
}
