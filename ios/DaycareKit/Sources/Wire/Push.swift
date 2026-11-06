// Push notification registration and payload types.

public enum PushKind: String, Codable, Hashable, Sendable, CaseIterable {
  case workerDone = "worker-done"
  case masterDone = "master-done"
  case approval
  case batteryLow = "battery-low"
}

public enum ApnsEnvironment: String, Codable, Hashable, Sendable {
  case development
  case production
}

// Custom "daycare" key of every alert push
public struct PushData: Codable, Hashable, Sendable {
  public var kind: PushKind
  public var session: SessionId?
  public var request: RequestId?

  public init(kind: PushKind, session: SessionId?, request: RequestId?) {
    self.kind = kind
    self.session = session
    self.request = request
  }
}
