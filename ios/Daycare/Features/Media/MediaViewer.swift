// Full screen pager over a session's media: zoomable images, streamed video.

import AVFoundation
import DaycareKit
import SwiftUI

struct MediaViewer: View {
  let session: SessionId
  let items: [MediaItem]

  @Environment(\.dismiss) private var dismiss
  @Environment(\.mediaEndpoint) private var endpoint
  @State private var current: FilePath
  @State private var sharing: URL?
  @State private var preparingShare = false

  init(session: SessionId, items: [MediaItem], start: FilePath) {
    self.session = session
    self.items = items
    _current = State(initialValue: start)
  }

  private var index: Int { items.firstIndex { $0.path == current } ?? 0 }

  var body: some View {
    NavigationStack {
      TabView(selection: $current) {
        ForEach(items) { item in
          MediaPage(session: session, item: item, active: item.path == current)
            .tag(item.path)
        }
      }
      .tabViewStyle(.page(indexDisplayMode: .never))
      .background(.black)
      .ignoresSafeArea(edges: .bottom)
      .toolbarBackground(.black, for: .navigationBar)
      .toolbarColorScheme(.dark, for: .navigationBar)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarLeading) {
          Button("Close") { dismiss() }
        }
        ToolbarItem(placement: .principal) {
          VStack(spacing: 0) {
            Text(items.isEmpty ? "" : items[index].name)
              .font(.subheadline.weight(.semibold))
              .lineLimit(1)
            Text(items.isEmpty ? "" : "\(index + 1) of \(items.count), \(Formatting.bytes(items[index].size))")
              .font(.caption)
              .foregroundStyle(.secondary)
          }
        }
        ToolbarItem(placement: .topBarTrailing) {
          Button(preparingShare ? "Loading" : "Share") {
            share()
          }
          .disabled(preparingShare)
        }
      }
      .sheet(item: $sharing) { url in
        ShareSheet(items: [url])
      }
    }
  }

  private func share() {
    guard !items.isEmpty, let request = endpoint?.request(session, items[index].path) else {
      return
    }
    let name = items[index].name
    preparingShare = true
    Task {
      sharing = try? await ImageLoader.shared.download(request, name: name)
      preparingShare = false
    }
  }
}

struct MediaPage: View {
  let session: SessionId
  let item: MediaItem
  let active: Bool

  @Environment(\.mediaEndpoint) private var endpoint
  @State private var player: AVPlayer?
  @State private var image: UIImage?
  @State private var failed = false

  var body: some View {
    Group {
      switch item.kind {
      case .image:
        if let image {
          ZoomableImage(image: image)
        } else {
          placeholder
        }
      case .video, .audio:
        if let player {
          PlayerView(player: player)
        } else {
          placeholder
        }
      }
    }
    .task(id: item.path) {
      await load()
    }
    .onChange(of: active) { _, isActive in
      guard isActive else {
        player?.pause()
        return
      }
      player?.play()
    }
    .onDisappear {
      player?.pause()
    }
  }

  @ViewBuilder
  private var placeholder: some View {
    if failed {
      Text("Could not load \(item.name)")
        .foregroundStyle(.secondary)
    } else {
      ProgressView()
        .tint(.white)
    }
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
        image = try await ImageLoader.shared.image(request, version: item.version, maxPixels: 4096)
      } catch {
        failed = true
      }
    case .video, .audio:
      guard player == nil, let asset = endpoint.asset(session, item.path) else {
        return
      }
      let player = AVPlayer(playerItem: AVPlayerItem(asset: asset))
      self.player = player
      if active {
        player.play()
      }
    }
  }
}

extension URL: @retroactive Identifiable {
  public var id: String { absoluteString }
}
