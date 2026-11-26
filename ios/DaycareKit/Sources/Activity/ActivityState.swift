// Live Activity content state; mirrors ActivityState in src/shared/mobile.ts.

public struct ActivityWorker: Codable, Hashable, Sendable, Identifiable {
  public var id: SessionId
  public var name: String
  // Master's name, null for a running master
  public var master: String?
  // Epoch seconds the current turn started
  public var since: Double

  public init(id: SessionId, name: String, master: String?, since: Double) {
    self.id = id
    self.name = name
    self.master = master
    self.since = since
  }
}

public struct ActivityState: Codable, Hashable, Sendable {
  // At most 4, newest first
  public var running: [ActivityWorker]
  public var runningCount: Int
  public var approvals: Int
  public var batteryPercent: Int?
  public var charging: Bool
  public var keepAwake: Bool
  // Epoch seconds
  public var updatedAt: Double

  public init(
    running: [ActivityWorker], runningCount: Int, approvals: Int, batteryPercent: Int?, charging: Bool,
    keepAwake: Bool, updatedAt: Double
  ) {
    self.running = running
    self.runningCount = runningCount
    self.approvals = approvals
    self.batteryPercent = batteryPercent
    self.charging = charging
    self.keepAwake = keepAwake
    self.updatedAt = updatedAt
  }

  public static let maxRunning = 4
}
