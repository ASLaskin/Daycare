// Display rows built from history: streamed text joined, tools paired.

import Foundation

public struct ToolCall: Hashable, Sendable {
  public var start: ToolStartEvent?
  public var end: ToolEndEvent?

  public init(start: ToolStartEvent? = nil, end: ToolEndEvent? = nil) {
    self.start = start
    self.end = end
  }
}

public enum NoticeTone: Hashable, Sendable {
  case info
  case warning
  case failure
}

public enum TranscriptContent: Hashable, Sendable {
  case user(UserEvent, refs: FileRefs)
  case assistant(text: String, streaming: Bool)
  case thinking(String)
  case tool(ToolCall)
  case permission(PermissionEvent, resolved: PermissionResolvedEvent?)
  case task(TaskEvent)
  case turnEnd(TurnEndEvent)
  case notice(String, tone: NoticeTone)
  case evicted
}

public struct TranscriptItem: Hashable, Sendable, Identifiable {
  public var id: String
  // History rows folded into this item, for placing media
  public var entries: [Entry]
  public var content: TranscriptContent
}

public enum TranscriptItems {
  public static func build(_ rows: [HistoryRow]) -> [TranscriptItem] {
    rows.reduce(into: Builder()) { $0.add($1) }.items
  }
}

private struct Builder {
  var items: [TranscriptItem] = []
  var index: [String: Int] = [:]

  mutating func add(_ row: HistoryRow) {
    switch row.event {
    case .user(let user):
      append("e\(row.entry)", row.entry, .user(user, refs: FileRefs.split(user.text)))
    case .textDelta(let delta):
      upsertText(delta, entry: row.entry, streaming: true)
    case .text(let text):
      upsertText(text, entry: row.entry, streaming: false)
    case .thinking(let thinking):
      append("e\(row.entry)", row.entry, .thinking(thinking.text))
    case .toolStart(let start):
      upsertTool(start.toolUseId, entry: row.entry) { $0.start = start }
    case .toolEnd(let end):
      upsertTool(end.toolUseId, entry: row.entry) { $0.end = end }
    case .permission(let permission):
      append("p\(permission.requestId)", row.entry, .permission(permission, resolved: nil))
    case .permissionResolved(let resolved):
      resolve(resolved, entry: row.entry)
    case .task(let task):
      upsert("t\(task.taskId)", row.entry, .task(task))
    case .turnEnd(let end):
      append("e\(row.entry)", row.entry, .turnEnd(end))
    case .error(let error):
      append("e\(row.entry)", row.entry, .notice(error.message, tone: .failure))
    case .notice(let notice):
      append("e\(row.entry)", row.entry, .notice(notice.message, tone: .info))
    case .interrupted(let interrupted):
      append("e\(row.entry)", row.entry, .notice("Interrupted: \(interrupted.reason)", tone: .warning))
    case .exit(let exit):
      append("e\(row.entry)", row.entry, .notice(exitMessage(exit), tone: .failure))
    case .rateLimit(let limit):
      append("e\(row.entry)", row.entry, .notice("Rate limit \(Int(limit.percent))% used", tone: .warning))
    case .oversized(let oversized):
      append("e\(row.entry)", row.entry, .notice(oversized.preview, tone: .info))
    case .historyEvicted:
      append("e\(row.entry)", row.entry, .evicted)
    case .ready, .state, .unknown:
      return
    }
  }

  mutating func append(_ id: String, _ entry: Entry, _ content: TranscriptContent) {
    index[id] = items.count
    items.append(TranscriptItem(id: id, entries: [entry], content: content))
  }

  mutating func upsert(_ id: String, _ entry: Entry, _ content: TranscriptContent) {
    guard let at = index[id] else {
      append(id, entry, content)
      return
    }
    items[at].entries.append(entry)
    items[at].content = content
  }

  mutating func upsertText(_ event: TextEvent, entry: Entry, streaming: Bool) {
    let id = "b\(event.block)"
    guard let at = index[id], case .assistant(let previous, true) = items[at].content else {
      upsert(id, entry, .assistant(text: event.text, streaming: streaming))
      return
    }
    let text = streaming ? previous + event.text : event.text
    upsert(id, entry, .assistant(text: text, streaming: streaming))
  }

  mutating func upsertTool(_ toolUseId: ToolUseId, entry: Entry, change: (inout ToolCall) -> Void) {
    let id = "u\(toolUseId)"
    var call = ToolCall()
    if let at = index[id], case .tool(let existing) = items[at].content {
      call = existing
    }
    change(&call)
    upsert(id, entry, .tool(call))
  }

  mutating func resolve(_ resolved: PermissionResolvedEvent, entry: Entry) {
    let id = "p\(resolved.requestId)"
    guard let at = index[id], case .permission(let permission, _) = items[at].content else {
      return
    }
    items[at].entries.append(entry)
    items[at].content = .permission(permission, resolved: resolved)
  }

  func exitMessage(_ exit: ExitEvent) -> String {
    let code = exit.code.map { "Exited with code \(Int($0))" } ?? "Exited"
    let tail = exit.stderrTail.trimmingCharacters(in: .whitespacesAndNewlines)
    return tail.isEmpty ? code : "\(code): \(tail)"
  }
}
