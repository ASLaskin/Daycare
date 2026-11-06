// Widget extension entry: Live Activity and lock screen status widget.

import SwiftUI
import WidgetKit

@main
struct DaycareWidgetsBundle: WidgetBundle {
  var body: some Widget {
    DaycareLiveActivity()
    StatusWidget()
  }
}
