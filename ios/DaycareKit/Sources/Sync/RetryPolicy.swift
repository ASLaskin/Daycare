// Outbox action for each failure, per the PROTOCOL.md error table.

public enum RetryPolicy {
  public enum Action: Equatable, Sendable {
    // Give up and show the message
    case drop
    // Stop everything and ask to pair again
    case repair
    // Keep the item and try again after a delay
    case retry
  }

  public static let maxInternalAttempts = 3

  public static func action(for code: ErrorCode, attempts: Int) -> Action {
    switch code {
    case .badRequest, .rejected, .tooLarge:
      return .drop
    case .unauthorized:
      return .repair
    case .unavailable:
      return .retry
    case .internal:
      return attempts < maxInternalAttempts ? .retry : .drop
    }
  }
}

// Reconnect delay: 1 s doubling to 30 s
public struct Backoff: Sendable, Equatable {
  public private(set) var attempt = 0
  public let base: Double
  public let cap: Double

  public init(base: Double = 1, cap: Double = 30) {
    self.base = base
    self.cap = cap
  }

  public mutating func next() -> Double {
    let delay = min(cap, base * Double(1 << min(attempt, 16)))
    attempt += 1
    return delay
  }

  public mutating func reset() {
    attempt = 0
  }
}
