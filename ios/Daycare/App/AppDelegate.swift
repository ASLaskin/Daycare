// UIKit hooks: push registration and the notification delegate.

import AVFoundation
import UIKit
import UserNotifications

final class AppDelegate: NSObject, UIApplicationDelegate {
  let model = AppModel()
  private lazy var notifications = NotificationDelegate(router: model.router)

  func application(
    _ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    UNUserNotificationCenter.current().delegate = notifications
    // Video sound plays with the ring switch off
    try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
    return true
  }

  func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    model.push.didRegister(deviceToken)
  }

  func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
    model.pushError = error.localizedDescription
  }
}
