// Thin status line when not connected, with the queued count.

import SwiftUI

struct ConnectionBanner: View {
  @Environment(Connection.self) private var connection
  @Environment(Outbox.self) private var outbox

  var body: some View {
    VStack(spacing: 0) {
      if let text {
        Text(text)
          .font(.footnote)
          .foregroundStyle(.secondary)
          .frame(maxWidth: .infinity)
          .padding(.vertical, 6)
      }
      if let failure = outbox.failures.first {
        HStack {
          Text("Could not \(failure.method): \(failure.message)")
            .font(.footnote)
            .foregroundStyle(.red)
            .lineLimit(2)
          Spacer()
          Button("Dismiss") {
            outbox.dismiss(failure)
          }
          .font(.footnote)
        }
        .padding(.horizontal)
        .padding(.vertical, 6)
      }
    }
    .background(.bar)
  }

  private var queued: String {
    let count = outbox.items.count
    return count == 0 ? "" : ", \(count) queued"
  }

  private var text: String? {
    switch connection.phase {
    case .online:
      return nil
    case .idle, .connecting:
      return "Connecting\(queued)"
    case .retrying:
      return "Offline, retrying\(queued)"
    case .noNetwork:
      return "No network\(queued)"
    case .replaced:
      return "Another connection from this phone took over"
    case .mismatch, .unauthorized:
      return nil
    }
  }
}
