// Frames the gateway sends; mirrors MobileServerMessage.

public struct Welcome: Codable, Hashable, Sendable {
  public var `protocol`: Int
  // Coordinator package version, for display
  public var coordinator: String
  public var epoch: Epoch
  // Replayed events follow when true, a snapshot when false
  public var resumed: Bool
}

public struct Snapshot: Codable, Hashable, Sendable {
  public var epoch: Epoch
  public var seq: Int
  public var sessions: [MobileSession]
  public var approvals: [Approval]
  public var power: PowerState
  // Null until a desktop has connected once
  public var catalog: Catalog?
  public var unavailable: [String]

  public init(
    epoch: Epoch, seq: Int, sessions: [MobileSession], approvals: [Approval], power: PowerState,
    catalog: Catalog?, unavailable: [String]
  ) {
    self.epoch = epoch
    self.seq = seq
    self.sessions = sessions
    self.approvals = approvals
    self.power = power
    self.catalog = catalog
    self.unavailable = unavailable
  }
}

public struct EventFrame: Codable, Hashable, Sendable {
  public var seq: Int
  public var event: MobileEvent

  public init(seq: Int, event: MobileEvent) {
    self.seq = seq
    self.event = event
  }
}

public struct Response: Hashable, Sendable {
  public enum Outcome: Hashable, Sendable {
    // Replayed: result stored from an earlier request with the same key
    case success(result: JSONValue, replayed: Bool)
    case failure(GatewayError)
  }

  public var id: Int
  public var outcome: Outcome
}

extension Response: Codable {
  private enum Keys: String, CodingKey {
    case id, result, replayed, error
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: Keys.self)
    id = try container.decode(Int.self, forKey: .id)
    if container.contains(.error) {
      outcome = .failure(try container.decode(GatewayError.self, forKey: .error))
      return
    }
    let result = try container.decode(JSONValue.self, forKey: .result)
    outcome = .success(result: result, replayed: try container.decode(Bool.self, forKey: .replayed))
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: Keys.self)
    try container.encode(id, forKey: .id)
    switch outcome {
    case .success(let result, let replayed):
      try container.encode(result, forKey: .result)
      try container.encode(replayed, forKey: .replayed)
    case .failure(let error):
      try container.encode(error, forKey: .error)
    }
  }
}

public struct ProtocolMismatch: Codable, Hashable, Sendable {
  public var server: Int
  public var client: Int

  public init(server: Int, client: Int) {
    self.server = server
    self.client = client
  }
}

// Not tied to a request; fatal ones are followed by a close
public struct ServerError: Codable, Hashable, Sendable {
  public var error: GatewayError
}

public enum ServerMessage: Codable, Hashable, Sendable {
  case welcome(Welcome)
  case snapshot(Snapshot)
  case event(EventFrame)
  case response(Response)
  case protocolMismatch(ProtocolMismatch)
  case error(ServerError)

  public init(from decoder: Decoder) throws {
    let type = try decoder.discriminator(.type)
    switch type {
    case "welcome": self = .welcome(try Welcome(from: decoder))
    case "snapshot": self = .snapshot(try Snapshot(from: decoder))
    case "event": self = .event(try EventFrame(from: decoder))
    case "response": self = .response(try Response(from: decoder))
    case "protocol_mismatch": self = .protocolMismatch(try ProtocolMismatch(from: decoder))
    case "error": self = .error(try ServerError(from: decoder))
    default:
      throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown type \(type)"))
    }
  }

  public func encode(to encoder: Encoder) throws {
    switch self {
    case .welcome(let p): try encoder.encode(discriminator: .type, "welcome", payload: p)
    case .snapshot(let p): try encoder.encode(discriminator: .type, "snapshot", payload: p)
    case .event(let p): try encoder.encode(discriminator: .type, "event", payload: p)
    case .response(let p): try encoder.encode(discriminator: .type, "response", payload: p)
    case .protocolMismatch(let p): try encoder.encode(discriminator: .type, "protocol_mismatch", payload: p)
    case .error(let p): try encoder.encode(discriminator: .type, "error", payload: p)
    }
  }
}
