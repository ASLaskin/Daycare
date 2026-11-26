// List row for one session: opens it, swipes to close or archive.

import DaycareKit
import SwiftUI

struct SessionListRow: View {
  let session: MobileSession

  @Environment(SessionStore.self) private var store
  @Environment(AppModel.self) private var model

  var body: some View {
    NavigationLink(value: session.id) {
      SessionRow(session: session, status: store.status(of: session))
    }
    .swipeActions(edge: .trailing) {
      swipe
    }
    .modifier(GroupingActions(session: session))
  }

  private var target: SessionTarget { SessionTarget(session: session.id) }

  @ViewBuilder
  private var swipe: some View {
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
