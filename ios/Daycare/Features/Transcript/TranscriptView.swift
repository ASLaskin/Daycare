// Scrolling transcript: loads older pages at the top, follows the bottom.

import DaycareKit
import SwiftUI

struct TranscriptView: View {
  let session: MobileSession

  @Environment(TranscriptStore.self) private var transcripts
  @Environment(MediaStore.self) private var media
  @Environment(Outbox.self) private var outbox
  @State private var position = ScrollPosition(edge: .bottom)
  @State private var atBottom = true
  @State private var viewing: MediaSelection?

  var body: some View {
    let items = transcripts.items(session.id)
    let mediaByEntry = media.byEntry(session.id)
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 14) {
        header(first: items.first?.id)
        ForEach(items) { item in
          VStack(alignment: .leading, spacing: 8) {
            TranscriptRowView(item: item, session: session.id)
            let attached = item.entries.flatMap { mediaByEntry[$0] ?? [] }
            if !attached.isEmpty {
              MediaStrip(session: session.id, items: attached) { picked in
                viewing = MediaSelection(items: media.list(session.id), start: picked)
              }
            }
          }
          .id(item.id)
        }
        ForEach(outbox.pendingSends(for: session.id)) { item in
          PendingBubble(item: item)
        }
      }
      .scrollTargetLayout()
      .padding()
    }
    .scrollPosition($position)
    .defaultScrollAnchor(.bottom)
    .scrollDismissesKeyboard(.interactively)
    .onScrollGeometryChange(for: Bool.self) { geometry in
      geometry.contentOffset.y + geometry.containerSize.height >= geometry.contentSize.height - 120
    } action: { _, isAtBottom in
      atBottom = isAtBottom
    }
    .onChange(of: tailKey(items)) {
      guard atBottom else {
        return
      }
      withAnimation(.easeOut(duration: 0.15)) {
        position.scrollTo(edge: .bottom)
      }
    }
    .fullScreenCover(item: $viewing) { selection in
      MediaViewer(session: session.id, items: selection.items, start: selection.start)
    }
  }

  @ViewBuilder
  private func header(first: String?) -> some View {
    let transcript = transcripts.transcripts[session.id]
    if let failure = transcripts.failures[session.id] {
      Button(failure + ", tap to retry") {
        Task {
          await transcripts.sync(session.id)
        }
      }
      .font(.footnote)
    }
    if transcripts.syncing.contains(session.id) && (transcript?.rows.isEmpty ?? true) {
      ProgressView()
        .frame(maxWidth: .infinity)
    }
    if transcript?.hasOlder == true {
      ProgressView()
        .frame(maxWidth: .infinity)
        .onAppear {
          loadOlder(keeping: first)
        }
    }
    if transcript?.hasOlder == false && transcript?.evicted == true {
      Text("Earlier history was discarded")
        .font(.footnote)
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity)
    }
  }

  private func loadOlder(keeping first: String?) {
    Task {
      await transcripts.loadOlder(session.id)
      guard let first else {
        return
      }
      position.scrollTo(id: first, anchor: .top)
    }
  }

  // Changes when a row is added or the streaming tail grows
  private func tailKey(_ items: [TranscriptItem]) -> String {
    let pending = outbox.pendingSends(for: session.id).count
    guard let last = items.last else {
      return "empty-\(pending)"
    }
    guard case .assistant(let text, _) = last.content else {
      return "\(items.count)-\(last.id)-\(pending)"
    }
    return "\(items.count)-\(last.id)-\(text.count)-\(pending)"
  }
}

struct MediaSelection: Identifiable {
  let items: [MediaItem]
  let start: FilePath

  var id: FilePath { start }
}
