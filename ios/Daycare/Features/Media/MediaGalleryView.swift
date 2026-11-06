// Grid of every media file a session mentioned, newest first.

import DaycareKit
import SwiftUI

struct MediaGalleryView: View {
  let session: SessionId

  @Environment(MediaStore.self) private var media
  @Environment(\.dismiss) private var dismiss
  @State private var viewing: MediaSelection?

  private let columns = [GridItem(.adaptive(minimum: 110), spacing: 4)]

  var body: some View {
    let items = media.list(session)
    NavigationStack {
      ScrollView {
        LazyVGrid(columns: columns, spacing: 4) {
          ForEach(items) { item in
            MediaThumb(session: session, item: item, size: CGSize(width: 120, height: 120))
              .onTapGesture {
                viewing = MediaSelection(items: items, start: item.path)
              }
          }
        }
        .padding(4)
      }
      .navigationTitle("Media")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Done") { dismiss() }
        }
      }
      .refreshable {
        await media.refresh(session)
      }
      .overlay {
        if items.isEmpty {
          ContentUnavailableView {
            Text("No media yet")
          } description: {
            Text("Images and videos the session creates show up here.")
          }
        }
      }
    }
    .fullScreenCover(item: $viewing) { selection in
      MediaViewer(session: session, items: selection.items, start: selection.start)
    }
  }
}
