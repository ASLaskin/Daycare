// Picks a group to join or an ungrouped session to form a group with.

import DaycareKit
import SwiftUI

struct GroupWithSheet: View {
  let session: MobileSession

  @Environment(SessionStore.self) private var store
  @Environment(AppModel.self) private var model
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      List {
        if !joinable.isEmpty {
          Section("Groups") {
            ForEach(joinable) { group in
              Button {
                pick { GroupEdits.dropOnGroup($0, dragged: session.id, group: group.id) }
              } label: {
                groupChoice(group)
              }
              .listRowBackground(GroupBar(color: group.color.color))
            }
          }
        }
        if !partners.isEmpty {
          Section("Sessions") {
            ForEach(partners) { partner in
              Button {
                pick { GroupEdits.dropOnSession($0, dragged: session.id, target: partner.id, fresh: .random()) }
              } label: {
                HStack(alignment: .firstTextBaseline) {
                  Text(partner.name)
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                  RoleTag(session: partner)
                }
              }
            }
          }
        }
      }
      .overlay {
        if joinable.isEmpty && partners.isEmpty {
          ContentUnavailableView {
            Text("Nothing to group with")
          } description: {
            Text("No other masters or chats outside this group.")
          }
        }
      }
      .navigationTitle("Group with")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { dismiss() }
        }
      }
    }
  }

  private var joinable: [SessionGroup] {
    store.groups.filter { !$0.members.contains(session.id) }
  }

  // Ungrouped masters and chats besides this one
  private var partners: [MobileSession] {
    store.topLevel.filter { $0.id != session.id && store.group(of: $0.id) == nil }
  }

  private func groupChoice(_ group: SessionGroup) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(group.name)
        .foregroundStyle(group.color.color)
      Text(group.members.compactMap { store.sessions[$0]?.name }.joined(separator: ", "))
        .font(.caption)
        .foregroundStyle(.secondary)
        .lineLimit(1)
    }
  }

  private func pick(_ edit: ([SessionGroup]) -> [SessionGroup]) {
    model.editGroups(edit)
    dismiss()
  }
}
