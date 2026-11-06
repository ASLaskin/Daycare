// Masters with their workers beneath, newest first.

import DaycareKit
import SwiftUI

struct SessionListView: View {
  @Environment(SessionStore.self) private var store
  @Environment(AppModel.self) private var model
  @AppStorage("showArchived") private var showArchived = false
  @AppStorage("showClosed") private var showClosed = true

  var body: some View {
    List {
      if !store.loaded && store.sessions.isEmpty {
        Text("Waiting for the Mac")
          .foregroundStyle(.secondary)
      }
      ForEach(visibleGroups) { group in
        Section {
          row(group.master)
          ForEach(group.workers) { worker in
            row(worker)
              .padding(.leading, 16)
          }
          if showArchived {
            ForEach(group.archivedWorkers) { worker in
              row(worker)
                .padding(.leading, 16)
            }
          }
        }
      }
      if !store.orphans.isEmpty {
        Section("Workers") {
          ForEach(store.orphans.filter { showArchived || !$0.archived }) { row($0) }
        }
      }
      Section {
        Toggle("Show closed", isOn: $showClosed)
        Toggle("Show archived workers", isOn: $showArchived)
      }
    }
    .listStyle(.insetGrouped)
    .overlay {
      if store.loaded && store.sessions.isEmpty {
        ContentUnavailableView {
          Text("No sessions")
        } description: {
          Text("Start one with New.")
        }
      }
    }
  }

  private var visibleGroups: [SessionGroup] {
    store.groups.filter { showClosed || !$0.master.closed }
  }

  private func row(_ session: MobileSession) -> some View {
    NavigationLink(value: session.id) {
      SessionRow(session: session, status: store.status(of: session))
    }
    .swipeActions(edge: .trailing) {
      swipe(session)
    }
  }

  @ViewBuilder
  private func swipe(_ session: MobileSession) -> some View {
    let target = SessionTarget(session: session.id)
    if session.role == .worker {
      if session.archived {
        Button("Unarchive") { model.send(.unarchive(target)) }
      } else {
        Button("Archive") { model.send(.archive(target)) }
          .tint(.indigo)
      }
    }
    if session.closed {
      Button("Reopen") { model.send(.reopen(target)) }
        .tint(.green)
    } else {
      Button("Close") { model.send(.close(target)) }
        .tint(.orange)
    }
  }
}
