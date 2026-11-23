// Lock screen and Dynamic Island views for running workers and battery.

import ActivityKit
import DaycareKit
import SwiftUI
import WidgetKit

struct DaycareLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: DaycareActivityAttributes.self) { context in
      LockScreenActivity(state: context.state)
        .padding()
        .activityBackgroundTint(Color.black.opacity(0.6))
        .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Text(ActivityText.running(context.state))
            .font(.headline)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(ActivityText.battery(context.state))
            .font(.headline)
        }
        DynamicIslandExpandedRegion(.bottom) {
          WorkerList(workers: context.state.running)
        }
      } compactLeading: {
        Text("\(context.state.runningCount)")
          .font(.headline)
      } compactTrailing: {
        Text(context.state.approvals > 0 ? "Needs you" : ActivityText.battery(context.state))
          .font(.caption)
      } minimal: {
        Text("\(context.state.runningCount)")
      }
    }
  }
}

struct LockScreenActivity: View {
  let state: DaycareKit.ActivityState

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text(ActivityText.running(state))
          .font(.headline)
        Spacer()
        Text(ActivityText.battery(state))
          .font(.headline)
      }
      if state.approvals > 0 {
        Text(Formatting.count(state.approvals, "approval") + " waiting")
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(.orange)
      }
      WorkerList(workers: state.running)
    }
    .foregroundStyle(.white)
  }
}

struct WorkerList: View {
  let workers: [ActivityWorker]

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      ForEach(workers) { worker in
        HStack {
          Text(worker.master.map { "\(worker.name) for \($0)" } ?? worker.name)
            .lineLimit(1)
          Spacer()
          Text(Date(timeIntervalSince1970: worker.since), style: .relative)
            .multilineTextAlignment(.trailing)
        }
        .font(.subheadline)
      }
    }
  }
}

enum ActivityText {
  static func running(_ state: DaycareKit.ActivityState) -> String {
    state.runningCount == 0 ? "Nothing running" : "\(state.runningCount) running"
  }

  static func battery(_ state: DaycareKit.ActivityState) -> String {
    guard let percent = state.batteryPercent else {
      return state.keepAwake ? "Awake" : ""
    }
    return state.charging ? "\(percent)% charging" : "\(percent)%"
  }
}
