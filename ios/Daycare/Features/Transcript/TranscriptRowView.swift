// One display item, by kind.

import DaycareKit
import SwiftUI

struct TranscriptRowView: View {
  let item: TranscriptItem
  let session: SessionId

  var body: some View {
    switch item.content {
    case .user(let user, let refs):
      UserBubble(user: user, refs: refs)
    case .assistant(let text, let streaming):
      AssistantText(text: text, streaming: streaming)
    case .thinking(let text):
      ThinkingRow(text: text)
    case .tool(let call):
      ToolRow(call: call)
    case .permission(let permission, let resolved):
      PermissionRow(permission: permission, resolved: resolved)
    case .task(let task):
      Text("Task \(task.description), \(task.status)")
        .font(.footnote)
        .foregroundStyle(.secondary)
    case .turnEnd(let end):
      TurnEndRow(end: end)
    case .notice(let message, let tone):
      NoticeRow(message: message, tone: tone)
    case .evicted:
      NoticeRow(message: "Earlier history was discarded", tone: .info)
    }
  }
}

struct NoticeRow: View {
  let message: String
  let tone: NoticeTone

  var body: some View {
    Text(message)
      .font(.footnote)
      .foregroundStyle(color)
      .textSelection(.enabled)
  }

  private var color: Color {
    switch tone {
    case .info: .secondary
    case .warning: .orange
    case .failure: .red
    }
  }
}

struct TurnEndRow: View {
  let end: TurnEndEvent

  var body: some View {
    Text(summary)
      .font(.caption)
      .foregroundStyle(end.isError ? .red : .secondary)
      .frame(maxWidth: .infinity, alignment: .center)
  }

  private var summary: String {
    let duration = end.durationMs.map { " in \(Int(($0 / 1000).rounded())) s" } ?? ""
    let cost = end.costUsd > 0 ? ", \(Formatting.cost(end.costUsd))" : ""
    return end.isError ? "Turn failed\(duration)" : "Finished\(duration)\(cost)"
  }
}

struct ThinkingRow: View {
  let text: String

  var body: some View {
    DisclosureGroup("Thinking") {
      Text(text)
        .font(.footnote)
        .foregroundStyle(.secondary)
        .textSelection(.enabled)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .font(.footnote)
    .foregroundStyle(.secondary)
  }
}
