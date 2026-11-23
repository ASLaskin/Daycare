// Pairing first, then the tabs; blocking states cover everything.

import DaycareKit
import SwiftUI

struct RootView: View {
  @Environment(AppModel.self) private var model
  @Environment(Connection.self) private var connection

  var body: some View {
    Group {
      if model.pairing == nil {
        PairingView()
      } else {
        blockingOrTabs
      }
    }
  }

  @ViewBuilder
  private var blockingOrTabs: some View {
    switch connection.phase {
    case .mismatch(let mismatch):
      UpdateRequiredView(mismatch: mismatch)
    case .unauthorized:
      RepairView()
    case .idle, .connecting, .online, .retrying, .noNetwork, .replaced:
      MainTabs()
    }
  }
}

struct MainTabs: View {
  @Environment(Router.self) private var router
  @Environment(SessionStore.self) private var store

  var body: some View {
    @Bindable var router = router
    TabView(selection: $router.tab) {
      Tab("Sessions", systemImage: "square.stack", value: AppTab.sessions) {
        SessionsTab()
      }
      Tab("Approvals", systemImage: "checkmark.shield", value: AppTab.approvals) {
        ApprovalsView()
      }
      .badge(store.approvals.count)
      Tab("Power", systemImage: "battery.75percent", value: AppTab.power) {
        PowerView()
      }
      Tab("Settings", systemImage: "gearshape", value: AppTab.settings) {
        SettingsView()
      }
    }
  }
}

// Protocol mismatch: stops retrying until relaunch
struct UpdateRequiredView: View {
  let mismatch: ProtocolMismatch

  private var macIsOlder: Bool { mismatch.client > mismatch.server && mismatch.server > 0 }

  var body: some View {
    ContentUnavailableView {
      Text(macIsOlder ? "Update Daycare on the Mac" : "Update the Daycare phone app")
    } description: {
      Text(
        macIsOlder
          ? "The Mac speaks protocol \(mismatch.server), this app speaks \(mismatch.client)."
          : "This app speaks protocol \(mismatch.client), the Mac needs \(mismatch.server). Rebuild it from Xcode."
      )
    }
  }
}

// Token rejected: the pairing code was rotated
struct RepairView: View {
  @Environment(AppModel.self) private var model

  var body: some View {
    VStack(spacing: 24) {
      ContentUnavailableView {
        Text("Pair again")
      } description: {
        Text("The Mac no longer accepts this phone. Open Daycare Settings on the Mac, Phone, and scan the new code.")
      }
      Button("Scan new code") {
        model.forgetToken()
      }
      .buttonStyle(.borderedProminent)
    }
    .padding()
  }
}
