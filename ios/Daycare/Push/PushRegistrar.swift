// APNs and push to start tokens, sent with register after every welcome.

import DaycareKit
import Foundation
import Observation
import UIKit
import UserNotifications

@MainActor
@Observable
final class PushRegistrar {
  private(set) var deviceToken: ApnsToken?
  private(set) var pushToStart: ApnsToken?
  private(set) var authorized = false
  private(set) var kinds: Set<PushKind>

  @ObservationIgnored private let connection: Connection
  @ObservationIgnored private let defaults = UserDefaults.standard
  private static let kindsKey = "pushKinds"

  init(connection: Connection) {
    self.connection = connection
    let stored = UserDefaults.standard.stringArray(forKey: PushRegistrar.kindsKey)
    kinds = stored.map { Set($0.compactMap(PushKind.init(rawValue:))) } ?? Set(PushKind.allCases)
  }

  func requestAuthorization() async {
    let center = UNUserNotificationCenter.current()
    let granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    authorized = granted
    UIApplication.shared.registerForRemoteNotifications()
  }

  func refreshAuthorization() async {
    let settings = await UNUserNotificationCenter.current().notificationSettings()
    authorized = settings.authorizationStatus == .authorized
    if authorized {
      UIApplication.shared.registerForRemoteNotifications()
    }
  }

  func didRegister(_ token: Data) {
    deviceToken = ApnsToken(token.map { String(format: "%02x", $0) }.joined())
    register()
  }

  func didReceivePushToStart(_ token: Data) {
    pushToStart = ApnsToken(token.map { String(format: "%02x", $0) }.joined())
    register()
  }

  func setKind(_ kind: PushKind, enabled: Bool) {
    if enabled {
      kinds.insert(kind)
    } else {
      kinds.remove(kind)
    }
    defaults.set(kinds.map(\.rawValue).sorted(), forKey: PushRegistrar.kindsKey)
    register()
  }

  func register() {
    guard connection.isOnline, let deviceToken else {
      return
    }
    let command = MobileCommand.register(
      Register(apnsToken: deviceToken, environment: .development, pushToStart: pushToStart, kinds: PushKind.allCases.filter(kinds.contains))
    )
    Task {
      _ = try? await connection.request(command)
    }
  }

  func unregister() async {
    guard connection.isOnline else {
      return
    }
    _ = try? await connection.request(.unregister)
  }
}
