// Splits assistant text into prose and fenced code blocks.

public enum MarkdownBlock: Hashable, Sendable {
  case prose(String)
  case code(language: String, body: String)
}

public enum MarkdownBlocks {
  public static func split(_ text: String) -> [MarkdownBlock] {
    let lines = text.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
    let state = lines.reduce(into: SplitState()) { $0.add($1) }
    return state.finished()
  }
}

private struct SplitState {
  var blocks: [MarkdownBlock] = []
  var buffer: [String] = []
  // Language of the open fence, nil outside code
  var fence: String?

  mutating func add(_ line: String) {
    let trimmed = line.trimmingLeadingSpaces()
    guard trimmed.hasPrefix("```") else {
      buffer.append(line)
      return
    }
    flush()
    fence = fence == nil ? String(trimmed.dropFirst(3)).trimmingLeadingSpaces() : nil
  }

  mutating func flush() {
    let body = buffer.joined(separator: "\n")
    buffer = []
    guard let language = fence else {
      if !body.allSatisfy(\.isWhitespace) {
        blocks.append(.prose(body))
      }
      return
    }
    blocks.append(.code(language: language, body: body))
  }

  func finished() -> [MarkdownBlock] {
    var copy = self
    copy.flush()
    return copy.blocks
  }
}

extension String {
  fileprivate func trimmingLeadingSpaces() -> String {
    String(drop { $0 == " " || $0 == "\t" })
  }
}
