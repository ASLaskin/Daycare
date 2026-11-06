// One WebSocket to the gateway: text frames out, decoded frames in.

import DaycareKit
import Foundation

final class Socket: Sendable {
  private let task: URLSessionWebSocketTask

  init(url: URL, session: URLSession) {
    task = session.webSocketTask(with: url)
    // History pages and snapshots exceed the 1 MiB default
    task.maximumMessageSize = 32 * 1024 * 1024
  }

  func open() {
    task.resume()
  }

  func send(_ message: ClientMessage) async throws {
    try await task.send(.string(try WireCodec.encode(message)))
  }

  // Decodes off the main actor; ends when the socket closes
  func messages() -> AsyncThrowingStream<ServerMessage, Error> {
    let task = self.task
    return AsyncThrowingStream { continuation in
      let reader = Task.detached {
        do {
          while true {
            let frame = try await task.receive()
            guard let message = Socket.decode(frame) else {
              continue
            }
            continuation.yield(message)
          }
        } catch {
          continuation.finish(throwing: error)
        }
      }
      continuation.onTermination = { _ in
        reader.cancel()
      }
    }
  }

  func ping() async -> Bool {
    await withCheckedContinuation { continuation in
      task.sendPing { error in
        continuation.resume(returning: error == nil)
      }
    }
  }

  func close() {
    task.cancel(with: .normalClosure, reason: nil)
  }

  var closeCode: Int { task.closeCode.rawValue }

  private static func decode(_ frame: URLSessionWebSocketTask.Message) -> ServerMessage? {
    switch frame {
    case .string(let text):
      return try? WireCodec.decodeServer(Data(text.utf8))
    case .data(let data):
      return try? WireCodec.decodeServer(data)
    @unknown default:
      return nil
    }
  }
}
