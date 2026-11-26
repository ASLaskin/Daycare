// Quiet Master, Chat or Worker tag; masters take the accent.

import DaycareKit
import SwiftUI

struct RoleTag: View {
  let session: MobileSession

  var body: some View {
    Text(session.kindLabel)
      .font(.caption2.weight(.medium))
      .foregroundStyle(session.masterMode ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary))
  }
}
