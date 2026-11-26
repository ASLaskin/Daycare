// Group menu and drag and drop for master and chat rows.

import DaycareKit
import SwiftUI

struct GroupingActions: ViewModifier {
  let session: MobileSession

  @Environment(SessionStore.self) private var store
  @Environment(AppModel.self) private var model
  @State private var choosing = false

  func body(content: Content) -> some View {
    if session.role == .master {
      content
        .contextMenu {
          Button("Group with…") { choosing = true }
          if store.group(of: session.id) != nil {
            Button("Remove from group") {
              model.editGroups { GroupEdits.ungroupSession($0, session.id) }
            }
          }
        }
        .draggable(session.id.rawValue)
        .dropDestination(for: String.self) { ids, _ in
          dropped(ids)
        }
        .sheet(isPresented: $choosing) {
          GroupWithSheet(session: session)
        }
    } else {
      content
    }
  }

  // Dropped masters and chats group with this one
  private func dropped(_ ids: [String]) -> Bool {
    let dragged = ids.map { SessionId($0) }.filter { $0 != session.id && store.sessions[$0]?.role == .master }
    guard !dragged.isEmpty else {
      return false
    }
    model.editGroups { groups in
      dragged.reduce(groups) { GroupEdits.dropOnSession($0, dragged: $1, target: session.id, fresh: .random()) }
    }
    return true
  }
}
