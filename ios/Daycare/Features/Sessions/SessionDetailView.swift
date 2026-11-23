// One session: transcript, its pending approvals, composer.

import DaycareKit
import SwiftUI

struct SessionDetailView: View {
  let id: SessionId

  @Environment(SessionStore.self) private var store
  @Environment(TranscriptStore.self) private var transcripts
  @Environment(MediaStore.self) private var media
  @Environment(Router.self) private var router
  @State private var showingMedia = false

  var body: some View {
    Group {
      if let session = store.sessions[id] {
        content(session)
      } else {
        ContentUnavailableView {
          Text("Session removed")
        }
      }
    }
    .onAppear {
      transcripts.open(id)
      router.visibleSession = id
      Task {
        await media.refresh(id)
      }
    }
    .onDisappear {
      transcripts.close(id)
      if router.visibleSession == id {
        router.visibleSession = nil
      }
    }
  }

  private func content(_ session: MobileSession) -> some View {
    VStack(spacing: 0) {
      TranscriptView(session: session)
      SessionApprovals(session: id)
      ComposerView(session: session)
    }
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .principal) {
        VStack(spacing: 0) {
          Text(session.name)
            .font(.headline)
            .lineLimit(1)
          StatusText(status: store.status(of: session))
        }
      }
      ToolbarItemGroup(placement: .topBarTrailing) {
        let count = media.list(id).count
        if count > 0 {
          Button("Media \(count)") {
            showingMedia = true
          }
        }
        SessionActionsMenu(session: session)
      }
    }
    .sheet(isPresented: $showingMedia) {
      MediaGalleryView(session: id)
    }
  }
}

// Pending approvals for this session, above the composer
struct SessionApprovals: View {
  let session: SessionId
  @Environment(SessionStore.self) private var store

  var body: some View {
    let approvals = store.approvals(for: session)
    if !approvals.isEmpty {
      ScrollView {
        VStack(spacing: 8) {
          ForEach(approvals) { approval in
            ApprovalCard(approval: approval, showsSession: false)
          }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
      }
      .frame(maxHeight: 280)
      .fixedSize(horizontal: false, vertical: true)
      .background(.bar)
    }
  }
}
