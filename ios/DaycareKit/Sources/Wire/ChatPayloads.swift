// Field sets of each ChatEvent kind, mirroring src/shared/chat.ts.

public enum ChatState: String, Codable, Hashable, Sendable {
  case running
  case idle
}

public enum ImageMediaType: String, Codable, Hashable, Sendable {
  case png = "image/png"
  case jpeg = "image/jpeg"
  case gif = "image/gif"
  case webp = "image/webp"
}

public struct ChatImage: Codable, Hashable, Sendable {
  public var mediaType: ImageMediaType
  public var data: Base64

  public init(mediaType: ImageMediaType, data: Base64) {
    self.mediaType = mediaType
    self.data = data
  }
}

public struct ReadyEvent: Codable, Hashable, Sendable {
  public var claudeSessionId: ClaudeSessionId?
  public var model: String?
  public var cwd: DirPath?
  public var tools: [String]
  public var slashCommands: [String]
}

public struct StateEvent: Codable, Hashable, Sendable {
  public var state: ChatState

  public init(state: ChatState) {
    self.state = state
  }
}

public struct TextEvent: Codable, Hashable, Sendable {
  public var block: String
  public var text: String

  public init(block: String, text: String) {
    self.block = block
    self.text = text
  }
}

public struct ThinkingEvent: Codable, Hashable, Sendable {
  public var block: String
  public var text: String
  public var tokens: Double?
}

public struct ToolStartEvent: Codable, Hashable, Sendable {
  public var toolUseId: ToolUseId
  public var name: String
  public var title: String
  public var input: JSONValue
  public var parentToolUseId: ToolUseId?

  public init(toolUseId: ToolUseId, name: String, title: String, input: JSONValue, parentToolUseId: ToolUseId?) {
    self.toolUseId = toolUseId
    self.name = name
    self.title = title
    self.input = input
    self.parentToolUseId = parentToolUseId
  }
}

public struct ToolEndEvent: Codable, Hashable, Sendable {
  public var toolUseId: ToolUseId
  public var isError: Bool
  public var content: String
  public var structured: JSONValue?

  public init(toolUseId: ToolUseId, isError: Bool, content: String, structured: JSONValue?) {
    self.toolUseId = toolUseId
    self.isError = isError
    self.content = content
    self.structured = structured
  }
}

public struct TaskEvent: Codable, Hashable, Sendable {
  public var taskId: TaskId
  public var status: String
  public var description: String
  public var subagentType: String?
  public var summary: String
  public var lastTool: String?
  public var usage: [String: JSONValue]?
}

public struct TurnEndEvent: Codable, Hashable, Sendable {
  public var isError: Bool
  public var stopReason: String?
  public var costUsd: Double
  public var contextTokens: Double
  public var numTurns: Double?
  public var durationMs: Double?
  public var text: String
}

public struct PermissionEvent: Codable, Hashable, Sendable {
  public var requestId: RequestId
  public var toolUseId: ToolUseId?
  public var name: String
  public var title: String
  public var input: JSONValue
  public var description: String
  public var suggestions: [JSONValue]
  // Prompts like AskUserQuestion and ExitPlanMode
  public var requiresUserInteraction: Bool
  // The request's own answers, when the coordinator offers them
  public var choices: [String]?
}

public struct PermissionResolvedEvent: Codable, Hashable, Sendable {
  public enum Reason: String, Codable, Hashable, Sendable {
    case cancelled
  }

  public var requestId: RequestId
  public var allowed: Bool
  public var reason: Reason?
}

public struct UserEvent: Codable, Hashable, Sendable {
  public var text: String
  public var images: [ChatImage]
  // Images left out of history to bound its size
  public var omittedImages: Double
  // Other files, sent to claude by path
  public var files: [FilePath]

  public init(text: String, images: [ChatImage], omittedImages: Double, files: [FilePath]) {
    self.text = text
    self.images = images
    self.omittedImages = omittedImages
    self.files = files
  }

  private enum CodingKeys: String, CodingKey {
    case text, images, omittedImages, files
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    text = try container.decode(String.self, forKey: .text)
    images = try container.decode([ChatImage].self, forKey: .images)
    omittedImages = try container.decode(Double.self, forKey: .omittedImages)
    files = try container.decodeIfPresent([FilePath].self, forKey: .files) ?? []
  }
}

public struct RateLimitEvent: Codable, Hashable, Sendable {
  public var percent: Double
}

public struct MessageEvent: Codable, Hashable, Sendable {
  public var message: String
}

public struct InterruptedEvent: Codable, Hashable, Sendable {
  public var reason: String
}

public struct ExitEvent: Codable, Hashable, Sendable {
  public var code: Double?
  public var stderrTail: String
}

public struct OversizedEvent: Codable, Hashable, Sendable {
  public var original: String
  public var bytes: Double
  public var preview: String
}
