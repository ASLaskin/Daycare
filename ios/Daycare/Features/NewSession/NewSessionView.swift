// Start a session: prompt, location, model, effort, permissions, account, photos.

import DaycareKit
import PhotosUI
import SwiftUI

struct NewSessionView: View {
  @Environment(AppModel.self) private var model
  @Environment(SessionStore.self) private var store
  @Environment(\.dismiss) private var dismiss

  @State private var draft = NewSessionDraft()
  @State private var attachments = PhotoAttachments()
  @State private var showingCamera = false

  var body: some View {
    NavigationStack {
      Group {
        if let catalog = store.catalog {
          form(catalog)
        } else {
          ContentUnavailableView {
            Text("Settings not loaded")
          } description: {
            Text("Open Daycare on the Mac once so the phone learns your locations and models.")
          }
        }
      }
      .navigationTitle("New session")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Start") { start() }
            .disabled(!draft.canStart)
        }
      }
      .onAppear {
        guard let catalog = store.catalog else {
          return
        }
        draft.adopt(catalog, sessions: Array(store.sessions.values))
      }
    }
  }

  private func form(_ catalog: Catalog) -> some View {
    @Bindable var attachments = attachments
    return Form {
      Section("Prompt") {
        TextField("What should it do?", text: $draft.prompt, axis: .vertical)
          .lineLimit(4...12)
        PhotoTray(attachments: attachments)
        HStack(spacing: 16) {
          PhotosPicker("Photos", selection: $attachments.selection, maxSelectionCount: PhotoAttachments.limit, matching: .images)
          if CameraPicker.isAvailable {
            Button("Camera") { showingCamera = true }
          }
        }
        .buttonStyle(.borderless)
      }
      Section("Where") {
        Picker("Location", selection: $draft.cwd) {
          ForEach(draft.locations(catalog, sessions: Array(store.sessions.values)), id: \.path) { location in
            Text(location.label).tag(Optional(location.path))
          }
        }
        TextField("Name (optional)", text: $draft.name)
      }
      Section("Model") {
        let providers = Provider.allCases.filter { !store.unavailable.contains($0.rawValue) }
        if providers.count > 1 {
          Picker("Provider", selection: $draft.provider) {
            ForEach(providers, id: \.self) { Text($0.rawValue.capitalized).tag($0) }
          }
        }
        Picker("Model", selection: $draft.model) {
          ForEach(catalog.models) { Text($0.label).tag($0.id) }
        }
        Picker("Effort", selection: $draft.effort) {
          ForEach(catalog.efforts) { Text($0.label).tag($0.id) }
        }
        Picker("Permissions", selection: $draft.permissionMode) {
          ForEach(PermissionMode.allCases, id: \.self) { Text(NewSessionDraft.label($0)).tag($0) }
        }
        if catalog.accounts.count > 1 {
          Picker("Account", selection: $draft.accountId) {
            ForEach(catalog.accounts) { Text($0.label).tag($0.id) }
          }
        }
      }
    }
    .fullScreenCover(isPresented: $showingCamera) {
      CameraPicker { attachments.add($0) }
        .ignoresSafeArea()
    }
  }

  private func start() {
    guard let command = draft.command(catalog: store.catalog) else {
      return
    }
    model.send(.create(command), photos: attachments.outgoing)
    dismiss()
  }
}
