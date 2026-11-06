// Navigation state driven by taps on notifications and links.

import DaycareKit
import Observation
import SwiftUI

enum AppTab: Hashable {
  case sessions
  case approvals
  case power
  case settings
}

@MainActor
@Observable
final class Router {
  var tab: AppTab = .sessions
  var sessionPath: [SessionId] = []
  var approval: RequestId?
  // Session on screen, for suppressing its banners
  var visibleSession: SessionId?

  func open(_ session: SessionId) {
    tab = .sessions
    sessionPath = [session]
  }

  func handle(_ push: PushData) {
    switch push.kind {
    case .approval:
      tab = .approvals
      approval = push.request
    case .workerDone, .masterDone:
      guard let session = push.session else {
        tab = .sessions
        return
      }
      open(session)
    case .batteryLow:
      tab = .power
    }
  }
}
