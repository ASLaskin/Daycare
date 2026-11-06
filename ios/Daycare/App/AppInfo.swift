// App version strings from the bundle.

import Foundation

enum AppInfo {
  static var version: String {
    Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
  }

  // "1.0 (12)", sent in hello for logs
  static var build: String {
    let number = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
    return "\(version) (\(number))"
  }

  static var appGroup: String? {
    Bundle.main.object(forInfoDictionaryKey: "DaycareAppGroup") as? String
  }
}
