// Frames the phone sends; mirrors MobileClientMessage.

public struct Resume: Codable, Hashable, Sendable {
  public var epoch: Epoch
  public var seq: Int

  public init(epoch: Epoch, seq: Int) {
    self.epoch = epoch
    self.seq = seq
  }
}

public struct Hello: Codable, Hashable, Sendable {
  public var `protocol`: Int
  // App build, for logs only
  public var app: String
  public var token: PairingToken
  public var device: DeviceId
  public var resume: Resume?
  public var watch: Watch?

  public init(protocol: Int, app: String, token: PairingToken, device: DeviceId, resume: Resume?, watch: Watch?) {
    self.protocol = `protocol`
    self.app = app
    self.token = token
    self.device = device
    self.resume = resume
    self.watch = watch
  }
}

public struct Request: Codable, Hashable, Sendable {
  public var id: Int
  // Required for anything the outbox retries
  public var key: RequestKey?
  public var command: MobileCommand

  public init(id: Int, key: RequestKey?, command: MobileCommand) {
    self.id = id
    self.key = key
    self.command = command
  }
}

public enum ClientMessage: Codable, Hashable, Sendable {
  case hello(Hello)
  case request(Request)

  public init(from decoder: Decoder) throws {
    let type = try decoder.discriminator(.type)
    switch type {
    case "hello": self = .hello(try Hello(from: decoder))
    case "request": self = .request(try Request(from: decoder))
    default:
      throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown type \(type)"))
    }
  }

  public func encode(to encoder: Encoder) throws {
    switch self {
    case .hello(let hello):
      try encoder.encode(discriminator: .type, "hello", payload: hello)
    case .request(let request):
      try encoder.encode(discriminator: .type, "request", payload: request)
    }
  }
}
