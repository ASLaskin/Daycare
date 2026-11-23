// Branded string wrapper for domain ids, tokens and paths.

public struct Tagged<Tag>: RawRepresentable, Codable, Hashable, Sendable, ExpressibleByStringLiteral, CustomStringConvertible {
  public let rawValue: String

  public init(rawValue: String) {
    self.rawValue = rawValue
  }

  public init(_ rawValue: String) {
    self.rawValue = rawValue
  }

  public init(stringLiteral value: String) {
    self.rawValue = value
  }

  public init(from decoder: Decoder) throws {
    rawValue = try decoder.singleValueContainer().decode(String.self)
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    try container.encode(rawValue)
  }

  public var description: String { rawValue }
}

extension Tagged: Identifiable {
  public var id: String { rawValue }
}

public enum SessionIdTag {}
public enum RequestIdTag {}
public enum ToolUseIdTag {}
public enum TaskIdTag {}
public enum ClaudeSessionIdTag {}
public enum AccountIdTag {}
public enum DirPathTag {}
public enum FilePathTag {}
public enum NativeIdTag {}
public enum PairingTokenTag {}
public enum RequestKeyTag {}
public enum DeviceIdTag {}
public enum ApnsTokenTag {}
public enum EpochTag {}
public enum ActivityIdTag {}
public enum Base64Tag {}

public typealias SessionId = Tagged<SessionIdTag>
public typealias RequestId = Tagged<RequestIdTag>
public typealias ToolUseId = Tagged<ToolUseIdTag>
public typealias TaskId = Tagged<TaskIdTag>
public typealias ClaudeSessionId = Tagged<ClaudeSessionIdTag>
public typealias AccountId = Tagged<AccountIdTag>
public typealias DirPath = Tagged<DirPathTag>
public typealias FilePath = Tagged<FilePathTag>
public typealias NativeId = Tagged<NativeIdTag>
public typealias PairingToken = Tagged<PairingTokenTag>
public typealias RequestKey = Tagged<RequestKeyTag>
public typealias DeviceId = Tagged<DeviceIdTag>
public typealias ApnsToken = Tagged<ApnsTokenTag>
public typealias Epoch = Tagged<EpochTag>
public typealias ActivityId = Tagged<ActivityIdTag>
public typealias Base64 = Tagged<Base64Tag>

// Per history row; stable across coordinator restarts
public typealias Entry = Int
