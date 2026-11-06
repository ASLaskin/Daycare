// Transcript event, discriminated by "kind"; mirrors ChatEvent in src/shared/chat.ts.

public enum ChatEvent: Codable, Hashable, Sendable {
  case ready(ReadyEvent)
  case state(StateEvent)
  // Streaming text, later replaced by a text event
  case textDelta(TextEvent)
  case text(TextEvent)
  case thinking(ThinkingEvent)
  case toolStart(ToolStartEvent)
  case toolEnd(ToolEndEvent)
  case task(TaskEvent)
  case turnEnd(TurnEndEvent)
  case permission(PermissionEvent)
  case permissionResolved(PermissionResolvedEvent)
  case user(UserEvent)
  case rateLimit(RateLimitEvent)
  case error(MessageEvent)
  case interrupted(InterruptedEvent)
  case notice(MessageEvent)
  case exit(ExitEvent)
  case historyEvicted
  case oversized(OversizedEvent)
  // Kind added by a newer coordinator
  case unknown(String)

  public init(from decoder: Decoder) throws {
    let kind = try decoder.discriminator(.kind)
    switch kind {
    case "ready": self = .ready(try ReadyEvent(from: decoder))
    case "state": self = .state(try StateEvent(from: decoder))
    case "text-delta": self = .textDelta(try TextEvent(from: decoder))
    case "text": self = .text(try TextEvent(from: decoder))
    case "thinking": self = .thinking(try ThinkingEvent(from: decoder))
    case "tool-start": self = .toolStart(try ToolStartEvent(from: decoder))
    case "tool-end": self = .toolEnd(try ToolEndEvent(from: decoder))
    case "task": self = .task(try TaskEvent(from: decoder))
    case "turn-end": self = .turnEnd(try TurnEndEvent(from: decoder))
    case "permission": self = .permission(try PermissionEvent(from: decoder))
    case "permission-resolved": self = .permissionResolved(try PermissionResolvedEvent(from: decoder))
    case "user": self = .user(try UserEvent(from: decoder))
    case "rate-limit": self = .rateLimit(try RateLimitEvent(from: decoder))
    case "error": self = .error(try MessageEvent(from: decoder))
    case "interrupted": self = .interrupted(try InterruptedEvent(from: decoder))
    case "notice": self = .notice(try MessageEvent(from: decoder))
    case "exit": self = .exit(try ExitEvent(from: decoder))
    case "history-evicted": self = .historyEvicted
    case "oversized": self = .oversized(try OversizedEvent(from: decoder))
    default: self = .unknown(kind)
    }
  }

  public func encode(to encoder: Encoder) throws {
    try encoder.encode(discriminator: .kind, kind, payload: payload)
  }

  public var kind: String {
    switch self {
    case .ready: "ready"
    case .state: "state"
    case .textDelta: "text-delta"
    case .text: "text"
    case .thinking: "thinking"
    case .toolStart: "tool-start"
    case .toolEnd: "tool-end"
    case .task: "task"
    case .turnEnd: "turn-end"
    case .permission: "permission"
    case .permissionResolved: "permission-resolved"
    case .user: "user"
    case .rateLimit: "rate-limit"
    case .error: "error"
    case .interrupted: "interrupted"
    case .notice: "notice"
    case .exit: "exit"
    case .historyEvicted: "history-evicted"
    case .oversized: "oversized"
    case .unknown(let kind): kind
    }
  }

  private var payload: (any Encodable)? {
    switch self {
    case .ready(let p): p
    case .state(let p): p
    case .textDelta(let p): p
    case .text(let p): p
    case .thinking(let p): p
    case .toolStart(let p): p
    case .toolEnd(let p): p
    case .task(let p): p
    case .turnEnd(let p): p
    case .permission(let p): p
    case .permissionResolved(let p): p
    case .user(let p): p
    case .rateLimit(let p): p
    case .error(let p): p
    case .interrupted(let p): p
    case .notice(let p): p
    case .exit(let p): p
    case .oversized(let p): p
    case .historyEvicted, .unknown: nil
    }
  }
}
