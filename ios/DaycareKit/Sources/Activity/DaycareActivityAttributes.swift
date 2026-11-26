// Live Activity attributes shared by the app and the widget extension.

#if canImport(ActivityKit) && os(iOS)
import ActivityKit

public struct DaycareActivityAttributes: ActivityAttributes {
  public typealias ContentState = ActivityState

  public var host: String

  public init(host: String) {
    self.host = host
  }
}
#endif
