// Last known state the app leaves in the App Group for the widget.

import Foundation

public struct WidgetStatus: Codable, Hashable, Sendable {
  public var state: ActivityState
  public var host: String
  // False when the app last saw the gateway offline
  public var connected: Bool

  public init(state: ActivityState, host: String, connected: Bool) {
    self.state = state
    self.host = host
    self.connected = connected
  }

  public static let fileName = "status.json"

  public static func url(appGroup: String) -> URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)?.appendingPathComponent(fileName)
  }

  public static func load(appGroup: String) -> WidgetStatus? {
    guard let url = url(appGroup: appGroup), let data = try? Data(contentsOf: url) else {
      return nil
    }
    return try? JSONDecoder().decode(WidgetStatus.self, from: data)
  }

  public func save(appGroup: String) {
    guard let url = WidgetStatus.url(appGroup: appGroup), let data = try? JSONEncoder().encode(self) else {
      return
    }
    try? data.write(to: url, options: .atomic)
  }
}
