// Session status shown in lists, derived like view.ts status.

public enum SessionStatus: Hashable, Sendable {
  case needsYou
  case starting
  case working
  case done
  case idle
  case interrupted
  case incomplete
  case closed
  case archived

  public init(_ session: MobileSession, pendingApprovals: Int) {
    self = SessionStatus.derive(session, pendingApprovals: pendingApprovals)
  }

  private static func derive(_ s: MobileSession, pendingApprovals: Int) -> SessionStatus {
    if s.archived {
      return .archived
    }
    if s.closed {
      return .closed
    }
    if pendingApprovals > 0 {
      return .needsYou
    }
    switch s.state {
    case .creating:
      return s.live ? .starting : .idle
    case .running:
      return .working
    case .idle:
      return .done
    case .interrupted:
      return .interrupted
    case .incomplete:
      return .incomplete
    }
  }

  public var label: String {
    switch self {
    case .needsYou: "Needs you"
    case .starting: "Starting"
    case .working: "Working"
    case .done: "Done"
    case .idle: "Idle"
    case .interrupted: "Interrupted"
    case .incomplete: "Incomplete"
    case .closed: "Closed"
    case .archived: "Archived"
    }
  }

  public var isActive: Bool {
    self == .working || self == .starting || self == .needsYou
  }
}
