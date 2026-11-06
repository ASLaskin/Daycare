// Coordinator keep awake and battery state; mirrors src/shared/power.ts.

public enum KeepAwake: String, Codable, Hashable, Sendable {
  case off
  case whileRunning = "while-running"
  case always
}

public struct Battery: Codable, Hashable, Sendable {
  public var percent: Int
  // Drawing from the power adapter
  public var pluggedIn: Bool
  public var charging: Bool
  // To empty when discharging, to full when charging; null while estimating
  public var minutesRemaining: Int?
  // Epoch ms of the reading
  public var readAt: Double

  public init(percent: Int, pluggedIn: Bool, charging: Bool, minutesRemaining: Int?, readAt: Double) {
    self.percent = percent
    self.pluggedIn = pluggedIn
    self.charging = charging
    self.minutesRemaining = minutesRemaining
    self.readAt = readAt
  }
}

// Phones toggle keep awake and allow sleep only
public enum PhoneKeepAwake: String, Codable, Hashable, Sendable {
  case off
  case always
}

// Lid closed keep awake, run by the desktop app
public struct LidClosed: Codable, Hashable, Sendable {
  // Desktop setting is on
  public var enabled: Bool
  // System sleep is disabled right now
  public var active: Bool

  public init(enabled: Bool, active: Bool) {
    self.enabled = enabled
    self.active = active
  }
}

public struct PowerState: Codable, Hashable, Sendable {
  public var mode: KeepAwake
  // Idle sleep assertion held now
  public var holding: Bool
  public var busyCount: Int
  // Null on Macs without a battery
  public var battery: Battery?
  // Desktop only and read only here; null without a desktop
  public var lidClosed: LidClosed?
  public var error: String?

  public init(mode: KeepAwake, holding: Bool, busyCount: Int, battery: Battery?, lidClosed: LidClosed?, error: String?) {
    self.mode = mode
    self.holding = holding
    self.busyCount = busyCount
    self.battery = battery
    self.lidClosed = lidClosed
    self.error = error
  }
}
