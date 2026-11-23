// Phone request command, discriminated by "method"; mirrors MobileCommand.

public enum MobileCommand: Codable, Hashable, Sendable {
  case watch(Watch)
  case history(HistoryQuery)
  case create(CreateSession)
  case send(SendMessage)
  case upload(Upload)
  case interrupt(SessionTarget)
  case answer(Answer)
  case close(SessionTarget)
  case reopen(SessionTarget)
  case archive(SessionTarget)
  case unarchive(SessionTarget)
  case rename(Rename)
  case remove(SessionTarget)
  case move(Move)
  case model(SetModel)
  case effort(SetEffort)
  case configure(Configure)
  case power(SetPower)
  // Media files the session's events mention, newest first
  case media(SessionTarget)
  case register(Register)
  case unregister
  case activity(ActivityToken)
  case activityEnded(ActivityEnded)

  public init(from decoder: Decoder) throws {
    let method = try decoder.discriminator(.method)
    switch method {
    case "watch": self = .watch(try Watch(from: decoder))
    case "history": self = .history(try HistoryQuery(from: decoder))
    case "create": self = .create(try CreateSession(from: decoder))
    case "send": self = .send(try SendMessage(from: decoder))
    case "upload": self = .upload(try Upload(from: decoder))
    case "interrupt": self = .interrupt(try SessionTarget(from: decoder))
    case "answer": self = .answer(try Answer(from: decoder))
    case "close": self = .close(try SessionTarget(from: decoder))
    case "reopen": self = .reopen(try SessionTarget(from: decoder))
    case "archive": self = .archive(try SessionTarget(from: decoder))
    case "unarchive": self = .unarchive(try SessionTarget(from: decoder))
    case "rename": self = .rename(try Rename(from: decoder))
    case "remove": self = .remove(try SessionTarget(from: decoder))
    case "move": self = .move(try Move(from: decoder))
    case "model": self = .model(try SetModel(from: decoder))
    case "effort": self = .effort(try SetEffort(from: decoder))
    case "configure": self = .configure(try Configure(from: decoder))
    case "power": self = .power(try SetPower(from: decoder))
    case "media": self = .media(try SessionTarget(from: decoder))
    case "register": self = .register(try Register(from: decoder))
    case "unregister": self = .unregister
    case "activity": self = .activity(try ActivityToken(from: decoder))
    case "activity-ended": self = .activityEnded(try ActivityEnded(from: decoder))
    default:
      throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown method \(method)"))
    }
  }

  public func encode(to encoder: Encoder) throws {
    try encoder.encode(discriminator: .method, method, payload: payload)
  }

  public var method: String {
    switch self {
    case .watch: "watch"
    case .history: "history"
    case .create: "create"
    case .send: "send"
    case .upload: "upload"
    case .interrupt: "interrupt"
    case .answer: "answer"
    case .close: "close"
    case .reopen: "reopen"
    case .archive: "archive"
    case .unarchive: "unarchive"
    case .rename: "rename"
    case .remove: "remove"
    case .move: "move"
    case .model: "model"
    case .effort: "effort"
    case .configure: "configure"
    case .power: "power"
    case .media: "media"
    case .register: "register"
    case .unregister: "unregister"
    case .activity: "activity"
    case .activityEnded: "activity-ended"
    }
  }

  // Session the command acts on, for per session ordering
  public var session: SessionId? {
    switch self {
    case .history(let p): p.session
    case .send(let p): p.session
    case .answer(let p): p.session
    case .rename(let p): p.session
    case .move(let p): p.session
    case .model(let p): p.session
    case .effort(let p): p.session
    case .interrupt(let p), .close(let p), .reopen(let p), .archive(let p), .unarchive(let p), .remove(let p), .media(let p): p.session
    case .watch, .create, .upload, .configure, .power, .register, .unregister, .activity, .activityEnded: nil
    }
  }

  private var payload: (any Encodable)? {
    switch self {
    case .watch(let p): p
    case .history(let p): p
    case .create(let p): p
    case .send(let p): p
    case .upload(let p): p
    case .interrupt(let p), .close(let p), .reopen(let p), .archive(let p), .unarchive(let p), .remove(let p), .media(let p): p
    case .answer(let p): p
    case .rename(let p): p
    case .move(let p): p
    case .model(let p): p
    case .effort(let p): p
    case .configure(let p): p
    case .power(let p): p
    case .register(let p): p
    case .unregister: nil
    case .activity(let p): p
    case .activityEnded(let p): p
    }
  }
}
