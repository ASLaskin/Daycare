// Hub event as filtered for one phone; mirrors MobileEvent.

public struct RemovedEvent: Codable, Hashable, Sendable {
  public var session: SessionId
  public var parentId: SessionId?
}

public struct ApprovalResolvedEvent: Codable, Hashable, Sendable {
  public var session: SessionId
  public var request: RequestId
  public var allowed: Bool
  public var cancelled: Bool
}

public struct SessionChatEvent: Codable, Hashable, Sendable {
  public var session: SessionId
  public var entry: Entry
  public var event: ChatEvent

  public init(session: SessionId, entry: Entry, event: ChatEvent) {
    self.session = session
    self.entry = entry
    self.event = event
  }
}

// New media files for a session, watched or not
public typealias MediaEvent = MediaList

public enum MobileEvent: Codable, Hashable, Sendable {
  case session(MobileSession)
  case removed(RemovedEvent)
  case approval(Approval)
  // Sent for every session, watched or not
  case approvalResolved(ApprovalResolvedEvent)
  // Watched sessions only
  case chat(SessionChatEvent)
  case power(PowerState)
  case catalog(Catalog)
  case media(MediaEvent)
  // Kind added by a newer coordinator
  case unknown(String)

  private enum Keys: String, CodingKey {
    case session, approval, power, catalog
  }

  public init(from decoder: Decoder) throws {
    let kind = try decoder.discriminator(.kind)
    let container = try decoder.container(keyedBy: Keys.self)
    switch kind {
    case "session": self = .session(try container.decode(MobileSession.self, forKey: .session))
    case "removed": self = .removed(try RemovedEvent(from: decoder))
    case "approval": self = .approval(try container.decode(Approval.self, forKey: .approval))
    case "approval-resolved": self = .approvalResolved(try ApprovalResolvedEvent(from: decoder))
    case "chat": self = .chat(try SessionChatEvent(from: decoder))
    case "power": self = .power(try container.decode(PowerState.self, forKey: .power))
    case "catalog": self = .catalog(try container.decode(Catalog.self, forKey: .catalog))
    case "media": self = .media(try MediaEvent(from: decoder))
    default: self = .unknown(kind)
    }
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: Keys.self)
    switch self {
    case .session(let session):
      try container.encode(session, forKey: .session)
      try encoder.encode(discriminator: .kind, "session", payload: nil)
    case .removed(let removed):
      try encoder.encode(discriminator: .kind, "removed", payload: removed)
    case .approval(let approval):
      try container.encode(approval, forKey: .approval)
      try encoder.encode(discriminator: .kind, "approval", payload: nil)
    case .approvalResolved(let resolved):
      try encoder.encode(discriminator: .kind, "approval-resolved", payload: resolved)
    case .chat(let chat):
      try encoder.encode(discriminator: .kind, "chat", payload: chat)
    case .power(let power):
      try container.encode(power, forKey: .power)
      try encoder.encode(discriminator: .kind, "power", payload: nil)
    case .catalog(let catalog):
      try container.encode(catalog, forKey: .catalog)
      try encoder.encode(discriminator: .kind, "catalog", payload: nil)
    case .media(let media):
      try encoder.encode(discriminator: .kind, "media", payload: media)
    case .unknown(let kind):
      try encoder.encode(discriminator: .kind, kind, payload: nil)
    }
  }
}
