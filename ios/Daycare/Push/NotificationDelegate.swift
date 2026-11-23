// Foreground banners and notification taps.

import DaycareKit
import Foundation
import UserNotifications

final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate, Sendable {
  private let router: Router

  init(router: Router) {
    self.router = router
  }

  static func pushData(_ userInfo: [AnyHashable: Any]) -> PushData? {
    guard let raw = userInfo["daycare"], JSONSerialization.isValidJSONObject(raw),
      let data = try? JSONSerialization.data(withJSONObject: raw)
    else {
      return nil
    }
    return try? JSONDecoder().decode(PushData.self, from: data)
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter, willPresent notification: UNNotification
  ) async -> UNNotificationPresentationOptions {
    let push = NotificationDelegate.pushData(notification.request.content.userInfo)
    let visible = await MainActor.run { router.visibleSession }
    guard let push, push.session != nil, push.session == visible else {
      return [.banner, .list, .sound]
    }
    return []
  }

  func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
    guard let push = NotificationDelegate.pushData(response.notification.request.content.userInfo) else {
      return
    }
    await MainActor.run {
      router.handle(push)
    }
  }
}
