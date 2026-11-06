// User message: text, attached images and file chips.

import DaycareKit
import SwiftUI
import UIKit

struct UserBubble: View {
  let user: UserEvent
  let refs: FileRefs

  private var files: [FilePath] {
    Array(Set(refs.files + user.files)).sorted { $0.rawValue < $1.rawValue }
  }

  var body: some View {
    VStack(alignment: .trailing, spacing: 6) {
      if !user.images.isEmpty {
        ScrollView(.horizontal) {
          HStack {
            ForEach(Array(user.images.enumerated()), id: \.offset) { _, image in
              InlineImage(image: image)
            }
          }
        }
      }
      if !files.isEmpty {
        FlowChips(names: files.map(FileRefs.fileName))
      }
      if user.omittedImages > 0 {
        Text("\(Formatting.count(Int(user.omittedImages), "image")) not kept in history")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      if !refs.text.isEmpty {
        Text(refs.text)
          .textSelection(.enabled)
          .padding(.horizontal, 12)
          .padding(.vertical, 8)
          .background(Color.accentColor.opacity(0.18), in: RoundedRectangle(cornerRadius: 14))
      }
    }
    .frame(maxWidth: .infinity, alignment: .trailing)
  }
}

struct InlineImage: View {
  let image: ChatImage

  var body: some View {
    if let data = Data(base64Encoded: image.data.rawValue), let ui = UIImage(data: data) {
      Image(uiImage: ui)
        .resizable()
        .scaledToFill()
        .frame(width: 120, height: 120)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
  }
}

struct FlowChips: View {
  let names: [String]

  var body: some View {
    VStack(alignment: .trailing, spacing: 4) {
      ForEach(names, id: \.self) { name in
        Text(name)
          .font(.caption)
          .lineLimit(1)
          .padding(.horizontal, 8)
          .padding(.vertical, 4)
          .background(.quaternary, in: Capsule())
      }
    }
  }
}

// Queued or in flight message from the outbox
struct PendingBubble: View {
  let item: OutboxItem
  @Environment(Outbox.self) private var outbox
  @Environment(Connection.self) private var connection

  var body: some View {
    if case .send(let send) = item.command {
      VStack(alignment: .trailing, spacing: 4) {
        if !item.attachments.isEmpty {
          Text(Formatting.count(item.attachments.count, "photo"))
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        Text(send.text)
          .padding(.horizontal, 12)
          .padding(.vertical, 8)
          .background(Color.accentColor.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
        HStack {
          Text(connection.isOnline ? "Sending" : "Queued")
          Button("Cancel") {
            outbox.cancel(item.key)
          }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
      }
      .frame(maxWidth: .infinity, alignment: .trailing)
    }
  }
}
