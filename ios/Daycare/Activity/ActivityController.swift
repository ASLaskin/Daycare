// Starts, updates and ends the Live Activity; reports its push tokens.

import ActivityKit
import DaycareKit
import Foundation

@MainActor
final class ActivityController {
  private let connection: Connection
  private let push: PushRegistrar
  private var observed: Set<String> = []
  private var lastState: DaycareKit.ActivityState?

  init(connection: Connection, push: PushRegistrar) {
    self.connection = connection
    self.push = push
  }

  private var enabled: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }

  func observePushToStart() {
    Task {
      for await token in Activity<DaycareActivityAttributes>.pushToStartTokenUpdates {
        push.didReceivePushToStart(token)
      }
    }
    Activity<DaycareActivityAttributes>.activities.forEach(observe)
  }

  // Foreground only: start when work runs, update in place
  func update(_ state: DaycareKit.ActivityState, host: String) {
    guard enabled, state != lastState else {
      return
    }
    lastState = state
    let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(15 * 60))
    guard Activity<DaycareActivityAttributes>.activities.isEmpty else {
      Task {
        for activity in Activity<DaycareActivityAttributes>.activities {
          await activity.update(content)
        }
      }
      return
    }
    guard state.runningCount > 0 || state.approvals > 0 else {
      return
    }
    guard let activity = try? Activity.request(
      attributes: DaycareActivityAttributes(host: host), content: content, pushType: .token
    ) else {
      return
    }
    observe(activity)
  }

  // Tokens can change after every welcome
  func reportTokens() {
    Activity<DaycareActivityAttributes>.activities.forEach { activity in
      guard let token = activity.pushToken else {
        return
      }
      send(.activity(ActivityToken(activity: ActivityId(activity.id), token: hex(token))))
    }
  }

  func endAll() {
    Task {
      for activity in Activity<DaycareActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
  }

  private func observe(_ activity: Activity<DaycareActivityAttributes>) {
    guard !observed.contains(activity.id) else {
      return
    }
    observed.insert(activity.id)
    let id = ActivityId(activity.id)
    Task {
      for await token in activity.pushTokenUpdates {
        send(.activity(ActivityToken(activity: id, token: hex(token))))
      }
    }
    Task {
      for await state in activity.activityStateUpdates where state == .ended || state == .dismissed {
        send(.activityEnded(ActivityEnded(activity: id)))
        observed.remove(activity.id)
        return
      }
    }
  }

  private func send(_ command: MobileCommand) {
    Task {
      _ = try? await connection.request(command)
    }
  }

  private func hex(_ data: Data) -> ApnsToken {
    ApnsToken(data.map { String(format: "%02x", $0) }.joined())
  }
}
