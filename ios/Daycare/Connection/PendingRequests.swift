// Requests awaiting their response, keyed by connection local id.

import DaycareKit

enum RequestFailure: Error, Equatable {
  // Not connected, or the socket closed before the response
  case offline
  case gateway(GatewayError)
  case undecodable
}

@MainActor
final class PendingRequests {
  typealias Outcome = Result<(result: JSONValue, replayed: Bool), RequestFailure>

  private var nextId = 1
  private var waiting: [Int: CheckedContinuation<(result: JSONValue, replayed: Bool), Error>] = [:]

  func mint() -> Int {
    defer { nextId += 1 }
    return nextId
  }

  func wait(_ id: Int, continuation: CheckedContinuation<(result: JSONValue, replayed: Bool), Error>) {
    waiting[id] = continuation
  }

  func resolve(_ response: Response) {
    guard let continuation = waiting.removeValue(forKey: response.id) else {
      return
    }
    switch response.outcome {
    case .success(let result, let replayed):
      continuation.resume(returning: (result, replayed))
    case .failure(let error):
      continuation.resume(throwing: RequestFailure.gateway(error))
    }
  }

  func fail(_ id: Int, _ failure: RequestFailure) {
    waiting.removeValue(forKey: id)?.resume(throwing: failure)
  }

  func failAll(_ failure: RequestFailure) {
    let all = waiting.values
    waiting.removeAll()
    all.forEach { $0.resume(throwing: failure) }
  }
}
