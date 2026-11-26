// A master or chat row with its workers beneath.

import DaycareKit
import SwiftUI

struct FamilyRows: View {
  let family: SessionFamily
  let showArchived: Bool
  // Group color along the leading edge
  var tint: Color?

  var body: some View {
    SessionListRow(session: family.master)
      .listRowBackground(tint.map(GroupBar.init))
    ForEach(showArchived ? family.workers + family.archivedWorkers : family.workers) { worker in
      SessionListRow(session: worker)
        .padding(.leading, 16)
        .listRowBackground(tint.map(GroupBar.init))
    }
  }
}
