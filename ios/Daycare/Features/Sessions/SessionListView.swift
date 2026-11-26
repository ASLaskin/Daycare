// Masters and chats with their workers beneath, newest first, gathered into groups.

import DaycareKit
import SwiftUI

struct SessionListView: View {
  @Environment(SessionStore.self) private var store
  @AppStorage("showArchived") private var showArchived = false
  @AppStorage("showClosed") private var showClosed = true

  var body: some View {
    List {
      if !store.loaded && store.sessions.isEmpty {
        Text("Waiting for the Mac")
          .foregroundStyle(.secondary)
      }
      ForEach(entries) { entry in
        switch entry {
        case .single(let family):
          Section {
            FamilyRows(family: family, showArchived: showArchived)
          }
        case .group(let group, let members):
          GroupSection(group: group, members: members, showArchived: showArchived)
        }
      }
      if !store.orphans.isEmpty {
        Section("Workers") {
          ForEach(store.orphans.filter { showArchived || !$0.archived }) { SessionListRow(session: $0) }
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

  private var entries: [SessionListEntry] {
    GroupLayout.entries(store.families.filter { showClosed || !$0.master.closed }, groups: store.groups)
  }
}
