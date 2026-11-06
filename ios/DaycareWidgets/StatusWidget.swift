// Lock screen and home screen widget from the state the app last saved.

import DaycareKit
import SwiftUI
import WidgetKit

struct StatusEntry: TimelineEntry {
  let date: Date
  let status: WidgetStatus?
}

struct StatusProvider: TimelineProvider {
  func placeholder(in context: Context) -> StatusEntry {
    StatusEntry(date: Date(), status: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (StatusEntry) -> Void) {
    completion(entry())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<StatusEntry>) -> Void) {
    completion(Timeline(entries: [entry()], policy: .after(Date().addingTimeInterval(30 * 60))))
  }

  private func entry() -> StatusEntry {
    let group = Bundle.main.object(forInfoDictionaryKey: "DaycareAppGroup") as? String
    return StatusEntry(date: Date(), status: group.flatMap(WidgetStatus.load(appGroup:)))
  }
}

struct StatusWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "DaycareStatus", provider: StatusProvider()) { entry in
      StatusWidgetView(entry: entry)
        .containerBackground(.fill.tertiary, for: .widget)
    }
    .configurationDisplayName("Daycare")
    .description("Running sessions and Mac battery, as of the last time the app was open.")
    .supportedFamilies([.accessoryRectangular, .accessoryInline, .accessoryCircular, .systemSmall])
  }
}

struct StatusWidgetView: View {
  let entry: StatusEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    if let state = entry.status?.state {
      content(state)
    } else {
      Text("Open Daycare")
    }
  }

  @ViewBuilder
  private func content(_ state: ActivityState) -> some View {
    switch family {
    case .accessoryInline:
      Text("\(ActivityText.running(state)), \(ActivityText.battery(state))")
    case .accessoryCircular:
      VStack(spacing: 0) {
        Text("\(state.runningCount)")
          .font(.title2.weight(.semibold))
        Text("running")
          .font(.caption2)
      }
    default:
      VStack(alignment: .leading, spacing: 2) {
        Text(ActivityText.running(state))
          .font(.headline)
        if state.approvals > 0 {
          Text(Formatting.count(state.approvals, "approval") + " waiting")
        }
        Text(ActivityText.battery(state))
        Text("As of \(Date(timeIntervalSince1970: state.updatedAt).formatted(date: .omitted, time: .shortened))")
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}
