// Interrupt, model, effort, rename, close, archive and remove.

import DaycareKit
import SwiftUI

struct SessionActionsMenu: View {
  let session: MobileSession

  @Environment(AppModel.self) private var model
  @Environment(SessionStore.self) private var store
  @State private var renaming = false
  @State private var newName = ""
  @State private var confirmingRemove = false

  private var target: SessionTarget { SessionTarget(session: session.id) }

  var body: some View {
    Menu("Actions") {
      if session.state == .running {
        Button("Interrupt") { model.send(.interrupt(target)) }
      }
      if let catalog = store.catalog, session.provider == .claude {
        Picker("Model", selection: modelBinding) {
          ForEach(catalog.models) { Text($0.label).tag($0.id) }
        }
        .pickerStyle(.menu)
        Picker("Effort", selection: effortBinding) {
          ForEach(catalog.efforts) { Text($0.label).tag($0.id) }
        }
        .pickerStyle(.menu)
      }
      Button("Rename") {
        newName = session.name
        renaming = true
      }
      Divider()
      if session.closed {
        Button("Reopen") { model.send(.reopen(target)) }
      } else {
        Button("Stop and close") { model.send(.close(target)) }
      }
      if session.role == .worker {
        if session.archived {
          Button("Unarchive") { model.send(.unarchive(target)) }
        } else {
          Button("Archive") { model.send(.archive(target)) }
        }
      }
      Button("Remove", role: .destructive) {
        confirmingRemove = true
      }
    }
    .alert("Rename", isPresented: $renaming) {
      TextField("Name", text: $newName)
      Button("Save") {
        let name = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else {
          return
        }
        model.send(.rename(Rename(session: session.id, name: name)))
      }
      Button("Cancel", role: .cancel) {}
    }
    .confirmationDialog("Remove \(session.name)?", isPresented: $confirmingRemove, titleVisibility: .visible) {
      Button("Remove and delete history", role: .destructive) {
        model.send(.remove(target))
      }
    } message: {
      Text(session.role == .master ? "Its workers and all history are deleted too." : "Its history is deleted too.")
    }
  }

  private var modelBinding: Binding<String> {
    Binding(
      get: { session.model ?? store.catalog?.model ?? "" },
      set: { model.send(.model(SetModel(session: session.id, model: $0))) }
    )
  }

  private var effortBinding: Binding<String> {
    Binding(
      get: { session.effort ?? store.catalog?.effort ?? "" },
      set: { model.send(.effort(SetEffort(session: session.id, effort: $0))) }
    )
  }
}
