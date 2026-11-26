// Group header row: tap to collapse; menu to rename, recolor, ungroup.

import DaycareKit
import SwiftUI

struct GroupHeader: View {
  let group: SessionGroup
  let members: [MobileSession]

  @Environment(AppModel.self) private var model
  @Environment(SessionStore.self) private var store
  @State private var renaming = false
  @State private var newName = ""

  var body: some View {
    Button(action: toggle) {
      VStack(alignment: .leading, spacing: 2) {
        HStack(alignment: .firstTextBaseline) {
          Text(group.name)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(group.color.color)
            .lineLimit(1)
          Text(group.collapsed ? GroupLayout.kindSummary(members) : "\(members.count)")
            .font(.caption)
            .foregroundStyle(.secondary)
          Spacer()
          Image(systemName: "chevron.down")
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            .rotationEffect(.degrees(group.collapsed ? -90 : 0))
        }
        if group.collapsed {
          Text(members.map(\.name).joined(separator: ", "))
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityHint(group.collapsed ? "Expands the group" : "Collapses the group")
    .contextMenu {
      Button("Rename") {
        newName = group.name
        renaming = true
      }
      Picker("Color", selection: colorBinding) {
        ForEach(GroupColor.allCases, id: \.self) { Text($0.label).tag($0) }
      }
      .pickerStyle(.menu)
      Button("Ungroup") {
        model.editGroups { GroupEdits.dissolveGroup($0, group.id) }
      }
    }
    .dropDestination(for: String.self) { ids, _ in
      join(ids)
    }
    .alert("Rename group", isPresented: $renaming) {
      TextField("Name", text: $newName)
      Button("Save", action: rename)
      Button("Cancel", role: .cancel) {}
    }
  }

  private func toggle() {
    withAnimation {
      model.editGroups { GroupEdits.editGroup($0, group.id) { $0.collapsed.toggle() } }
    }
  }

  private func rename() {
    let name = newName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty else {
      return
    }
    model.editGroups { GroupEdits.editGroup($0, group.id) { $0.name = name } }
  }

  private var colorBinding: Binding<GroupColor> {
    Binding(
      get: { group.color },
      set: { color in model.editGroups { GroupEdits.editGroup($0, group.id) { $0.color = color } } }
    )
  }

  // Dropped top-level sessions join this group
  private func join(_ ids: [String]) -> Bool {
    let dropped = ids.map { SessionId($0) }.filter { store.sessions[$0]?.role == .master }
    guard !dropped.isEmpty else {
      return false
    }
    model.editGroups { groups in
      dropped.reduce(groups) { GroupEdits.dropOnGroup($0, dragged: $1, group: group.id) }
    }
    return true
  }
}
