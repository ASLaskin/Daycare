// One group: header, then members with their workers unless collapsed.

import DaycareKit
import SwiftUI

struct GroupSection: View {
  let group: SessionGroup
  let members: [SessionFamily]
  let showArchived: Bool

  var body: some View {
    Section {
      GroupHeader(group: group, members: members.map(\.master))
        .listRowBackground(GroupBar(color: group.color.color))
      if !group.collapsed {
        ForEach(members) { family in
          FamilyRows(family: family, showArchived: showArchived, tint: group.color.color)
        }
      }
    }
  }
}
