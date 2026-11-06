// Message field with photo and camera attach; queues through the outbox.

import DaycareKit
import PhotosUI
import SwiftUI

struct ComposerView: View {
  let session: MobileSession

  @Environment(AppModel.self) private var model
  @State private var text = ""
  @State private var attachments = PhotoAttachments()
  @State private var showingCamera = false
  @FocusState private var focused: Bool

  private var canSend: Bool {
    !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !attachments.photos.isEmpty
  }

  var body: some View {
    @Bindable var attachments = attachments
    VStack(spacing: 6) {
      PhotoTray(attachments: attachments)
      if let error = attachments.error {
        Text(error)
          .font(.caption)
          .foregroundStyle(.red)
      }
      if session.closed {
        Text("Closed. Sending reopens it.")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      TextField("Message", text: $text, axis: .vertical)
        .lineLimit(1...6)
        .focused($focused)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 18))
      HStack(spacing: 16) {
        PhotosPicker("Photos", selection: $attachments.selection, maxSelectionCount: PhotoAttachments.limit, matching: .images)
        if CameraPicker.isAvailable {
          Button("Camera") {
            showingCamera = true
          }
        }
        if attachments.importing {
          ProgressView()
        }
        Spacer()
        if session.state == .running {
          Button("Stop") {
            model.send(.interrupt(SessionTarget(session: session.id)))
          }
          .tint(.red)
        }
        Button("Send") {
          send()
        }
        .buttonStyle(.borderedProminent)
        .disabled(!canSend)
      }
      .font(.subheadline)
    }
    .padding(.horizontal)
    .padding(.vertical, 8)
    .background(.bar)
    .fullScreenCover(isPresented: $showingCamera) {
      CameraPicker { attachments.add($0) }
        .ignoresSafeArea()
    }
  }

  private func send() {
    let message = text.trimmingCharacters(in: .whitespacesAndNewlines)
    model.send(.send(SendMessage(session: session.id, text: message, files: [])), photos: attachments.outgoing)
    text = ""
    attachments.clear()
  }
}
