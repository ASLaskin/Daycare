// Pushes store changes to the Live Activity and the widget cache, throttled.

import DaycareKit
import Foundation
import WidgetKit

@MainActor
final class StatusPublisher {
  private let activity: ActivityController
  private var pending: Task<Void, Never>?
  private var lastWidget: WidgetStatus?

  init(activity: ActivityController) {
    self.activity = activity
  }

  func schedule(_ build: @escaping @MainActor () -> (ActivityState, String, Bool)?) {
    guard pending == nil else {
      return
    }
    pending = Task {
      try? await Task.sleep(for: .seconds(2))
      pending = nil
      guard let (state, host, connected) = build() else {
        return
      }
      activity.update(state, host: host)
      writeWidget(WidgetStatus(state: state, host: host, connected: connected))
    }
  }

  private func writeWidget(_ status: WidgetStatus) {
    guard let group = AppInfo.appGroup else {
      return
    }
    var comparable = status
    comparable.state.updatedAt = lastWidget?.state.updatedAt ?? 0
    guard comparable != lastWidget else {
      return
    }
    lastWidget = status
    status.save(appGroup: group)
    WidgetCenter.shared.reloadAllTimelines()
  }
}
