// App entry: scene phase drives the connection; links pair.

import DaycareKit
import SwiftUI

@main
struct DaycareApp: App {
  @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
  @Environment(\.scenePhase) private var scenePhase

  var body: some Scene {
    WindowGroup {
      RootView()
        .environment(delegate.model)
        .environment(delegate.model.router)
        .environment(delegate.model.store)
        .environment(delegate.model.transcripts)
        .environment(delegate.model.media)
        .environment(delegate.model.outbox)
        .environment(delegate.model.connection)
        .environment(delegate.model.push)
        .environment(\.mediaEndpoint, delegate.model.mediaEndpoint)
        .onOpenURL { url in
          guard let link = try? PairingLink.parse(url.absoluteString) else {
            return
          }
          delegate.model.pair(link)
        }
    }
    .onChange(of: scenePhase) { _, phase in
      switch phase {
      case .active:
        delegate.model.foreground()
      case .background:
        delegate.model.background()
      case .inactive:
        return
      @unknown default:
        return
      }
    }
  }
}
