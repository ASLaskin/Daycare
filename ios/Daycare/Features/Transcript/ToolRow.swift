// Tool call: title and state, expandable input and output.

import DaycareKit
import SwiftUI

struct ToolRow: View {
  let call: ToolCall
  static let outputLimit = 4000

  var body: some View {
    DisclosureGroup {
      VStack(alignment: .leading, spacing: 8) {
        if let input = call.start?.input, input != .null {
          code(input.pretty())
        }
        if let end = call.end, !end.content.isEmpty {
          code(String(end.content.prefix(ToolRow.outputLimit)))
            .foregroundStyle(end.isError ? .red : .primary)
        }
      }
    } label: {
      HStack(alignment: .firstTextBaseline) {
        Text(call.start?.name ?? "Tool")
          .font(.footnote.weight(.semibold))
        Text(call.start?.title ?? "")
          .font(.footnote)
          .lineLimit(1)
        Spacer()
        Text(state)
          .font(.caption)
          .foregroundStyle(call.end?.isError == true ? .red : .secondary)
      }
    }
    .padding(10)
    .background(.quaternary.opacity(0.35), in: RoundedRectangle(cornerRadius: 10))
  }

  private var state: String {
    guard let end = call.end else {
      return "Running"
    }
    return end.isError ? "Failed" : "Done"
  }

  private func code(_ text: String) -> some View {
    ScrollView(.horizontal) {
      Text(text)
        .font(.caption.monospaced())
        .textSelection(.enabled)
    }
  }
}

// Permission prompt in the transcript; live ones are answered from the card
struct PermissionRow: View {
  let permission: PermissionEvent
  let resolved: PermissionResolvedEvent?

  var body: some View {
    HStack(alignment: .firstTextBaseline) {
      Text(permission.title.isEmpty ? permission.name : permission.title)
        .font(.footnote.weight(.semibold))
        .lineLimit(2)
      Spacer()
      Text(state)
        .font(.caption)
        .foregroundStyle(.secondary)
    }
    .padding(10)
    .background(.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
  }

  private var state: String {
    guard let resolved else {
      return "Waiting for you"
    }
    if resolved.reason == .cancelled {
      return "Withdrawn"
    }
    return resolved.allowed ? "Allowed" : "Denied"
  }
}
