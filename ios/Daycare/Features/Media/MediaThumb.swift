// Inline media preview: image, video poster with length, or audio label.

import DaycareKit
import SwiftUI

struct MediaStrip: View {
  let session: SessionId
  let items: [MediaItem]
  let onOpen: (FilePath) -> Void

  var body: some View {
    if items.count == 1, let item = items.first {
      MediaThumb(session: session, item: item, size: CGSize(width: 280, height: 200))
        .onTapGesture { onOpen(item.path) }
    } else {
      ScrollView(.horizontal) {
        HStack(spacing: 8) {
          ForEach(items) { item in
            MediaThumb(session: session, item: item, size: CGSize(width: 160, height: 120))
              .onTapGesture { onOpen(item.path) }
          }
        }
      }
    }
  }
}

struct MediaThumb: View {
  let session: SessionId
  let item: MediaItem
  let size: CGSize

  @Environment(\.mediaEndpoint) private var endpoint
  @Environment(\.displayScale) private var scale
  @State private var image: UIImage?
  @State private var duration: Double?
  @State private var failed = false

  var body: some View {
    ZStack(alignment: .bottomLeading) {
      Rectangle()
        .fill(.quaternary)
      if let image {
        Image(uiImage: image)
          .resizable()
          .scaledToFill()
      }
      if failed {
        Text("Could not load \(item.name)")
          .font(.caption)
          .foregroundStyle(.secondary)
          .padding(8)
      }
      label
    }
    .frame(width: size.width, height: size.height)
    .clipShape(RoundedRectangle(cornerRadius: 12))
    .contentShape(Rectangle())
    .task(id: item.version + item.path.rawValue) {
      await load()
    }
  }

  @ViewBuilder
  private var label: some View {
    switch item.kind {
    case .image:
      EmptyView()
    case .video:
      caption(["Play", duration.map(Formatting.duration)].compactMap { $0 }.joined(separator: "  "))
    case .audio:
      caption("Audio  \(item.name)")
    }
  }

  private func caption(_ text: String) -> some View {
    Text(text)
      .font(.caption.weight(.semibold))
      .foregroundStyle(.white)
      .padding(.horizontal, 8)
      .padding(.vertical, 4)
      .background(.black.opacity(0.55), in: Capsule())
      .padding(8)
  }

  private func load() async {
    guard let endpoint else {
      return
    }
    switch item.kind {
    case .image:
      guard let request = endpoint.request(session, item.path) else {
        return
      }
      do {
        image = try await ImageLoader.shared.image(request, version: item.version, maxPixels: max(size.width, size.height) * scale)
      } catch {
        failed = true
      }
    case .video:
      guard let asset = endpoint.asset(session, item.path) else {
        return
      }
      let poster = await VideoPosterLoader.shared.poster(asset, version: item.version)
      image = poster.image
      duration = poster.duration
    case .audio:
      return
    }
  }
}
