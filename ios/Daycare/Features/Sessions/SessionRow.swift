// One session: name, status in words, preview and age.

import DaycareKit
import SwiftUI

struct SessionRow: View {
  let session: MobileSession
  let status: SessionStatus

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(alignment: .firstTextBaseline) {
        Text(session.name)
          .font(.headline)
          .lineLimit(1)
        Spacer()
        StatusText(status: status)
      }
      if let preview = session.preview, !preview.isEmpty {
        Text(preview)
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .lineLimit(2)
      }
      HStack {
        Text(directory)
        Spacer()
        if let at = session.lastEventAt {
          Text(Date(timeIntervalSince1970: at / 1000), style: .relative)
        }
      }
      .font(.caption)
      .foregroundStyle(.tertiary)
      .lineLimit(1)
    }
    .padding(.vertical, 2)
  }

  private var directory: String {
    session.cwd.rawValue.split(separator: "/").last.map(String.init) ?? session.cwd.rawValue
  }
}

struct StatusText: View {
  let status: SessionStatus

  var body: some View {
    Text(status.label)
      .font(.caption.weight(.semibold))
      .foregroundStyle(color)
  }

  private var color: Color {
    switch status {
    case .needsYou: .orange
    case .working, .starting: .blue
    case .done: .green
    case .interrupted, .incomplete: .yellow
    case .idle, .closed, .archived: .secondary
    }
  }
}
