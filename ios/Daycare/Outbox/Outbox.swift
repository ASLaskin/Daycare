// Queued commands sent after welcome, one in flight per session, keyed for replay.

import DaycareKit
import Foundation
import Observation

struct OutgoingPhoto: Sendable {
  var name: String
  var data: Data
}

enum OutboxError: Error {
  case photoTooLarge
}

@MainActor
@Observable
final class Outbox {
  private(set) var items: [OutboxItem]
  private(set) var failures: [OutboxFailure] = []

  @ObservationIgnored var onCreated: (RequestKey, SessionId) -> Void = { _, _ in }
  @ObservationIgnored var onUnauthorized: () -> Void = {}

  @ObservationIgnored private let connection: Connection
  @ObservationIgnored private let files = OutboxFiles()
  @ObservationIgnored private var runningLanes: Set<String> = []
  @ObservationIgnored private var retryTask: Task<Void, Never>?
  @ObservationIgnored private var backoff = Backoff(base: 2, cap: 60)

  private enum Outcome {
    case done
    case drop(String)
    case retry
    case offline
    case repair
  }

  init(connection: Connection) {
    self.connection = connection
    items = files.load()
  }

  @discardableResult
  func enqueue(_ command: MobileCommand, photos: [OutgoingPhoto] = []) throws -> RequestKey {
    guard photos.allSatisfy({ $0.data.count <= WireProtocol.maxUploadBytes }) else {
      throw OutboxError.photoTooLarge
    }
    let key = RequestKey(UUID().uuidString)
    let attachments = try photos.enumerated().map { index, photo in
      OutboxAttachment(name: photo.name, file: try files.store(photo.data, key: key, index: index), uploaded: nil)
    }
    items.append(OutboxItem(key: key, command: command, attachments: attachments, attempts: 0, createdAt: Date()))
    files.save(items)
    drain()
    return key
  }

  // Sends pending items in each lane; safe to call any time
  func drain() {
    guard connection.isOnline else {
      return
    }
    Set(items.map(\.lane)).subtracting(runningLanes).forEach { lane in
      runningLanes.insert(lane)
      Task {
        await run(lane)
      }
    }
  }

  func pendingSends(for session: SessionId) -> [OutboxItem] {
    items.filter { item in
      guard case .send(let send) = item.command else {
        return false
      }
      return send.session == session
    }
  }

  func attachmentURL(_ attachment: OutboxAttachment) -> URL {
    files.url(attachment.file)
  }

  func cancel(_ key: RequestKey) {
    guard let item = items.first(where: { $0.key == key }) else {
      return
    }
    remove(item)
  }

  func dismiss(_ failure: OutboxFailure) {
    failures.removeAll { $0.id == failure.id }
  }

  func reset() {
    items = []
    failures = []
    files.removeAll()
  }

  private func run(_ lane: String) async {
    defer { runningLanes.remove(lane) }
    while connection.isOnline, let item = items.first(where: { $0.lane == lane }) {
      switch await process(item) {
      case .done:
        backoff.reset()
        remove(item)
      case .drop(let message):
        remove(item)
        failures.insert(OutboxFailure(method: item.command.method, message: message), at: 0)
      case .retry:
        update(item.key) { $0.attempts += 1 }
        scheduleRetry()
        return
      case .offline:
        return
      case .repair:
        onUnauthorized()
        return
      }
    }
  }

  private func process(_ item: OutboxItem) async -> Outcome {
    do {
      try await upload(item)
      guard let current = items.first(where: { $0.key == item.key }) else {
        return .done
      }
      let (result, _) = try await connection.request(current.resolvedCommand, key: current.key)
      if case .create = current.command, let created = try? result.decode(CreateResult.self) {
        onCreated(current.key, created.session)
      }
      return .done
    } catch RequestFailure.gateway(let error) {
      switch RetryPolicy.action(for: error.code, attempts: item.attempts + 1) {
      case .drop:
        return .drop(error.message)
      case .retry:
        return .retry
      case .repair:
        return .repair
      }
    } catch RequestFailure.undecodable {
      return .done
    } catch RequestFailure.offline {
      return .offline
    } catch {
      return .drop("A photo for this message is missing")
    }
  }

  private func upload(_ item: OutboxItem) async throws {
    let missing = item.attachments.indices.filter { item.attachments[$0].uploaded == nil }
    for index in missing {
      let attachment = item.attachments[index]
      let data = try files.read(attachment.file)
      let upload = Upload(name: attachment.name, data: Base64(data.base64EncodedString()))
      let result = try await connection.request(.upload(upload), key: item.uploadKey(index), as: UploadResult.self)
      update(item.key) { $0.attachments[index].uploaded = result.path }
    }
  }

  private func update(_ key: RequestKey, _ change: (inout OutboxItem) -> Void) {
    guard let index = items.firstIndex(where: { $0.key == key }) else {
      return
    }
    change(&items[index])
    files.save(items)
  }

  private func remove(_ item: OutboxItem) {
    items.removeAll { $0.key == item.key }
    files.delete(item)
    files.save(items)
  }

  private func scheduleRetry() {
    guard retryTask == nil else {
      return
    }
    let delay = backoff.next()
    retryTask = Task {
      try? await Task.sleep(for: .seconds(delay))
      retryTask = nil
      drain()
    }
  }
}
