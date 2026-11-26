// Row background with the group's color along the leading edge.

import SwiftUI

struct GroupBar: View {
  let color: Color

  var body: some View {
    Color(.secondarySystemGroupedBackground)
      .overlay(alignment: .leading) {
        color.frame(width: 4)
      }
  }
}
