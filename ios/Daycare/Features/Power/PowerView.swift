// Mac battery and keep awake toggle.

import DaycareKit
import SwiftUI

struct PowerView: View {
  @Environment(SessionStore.self) private var store
  @Environment(AppModel.self) private var model

  var body: some View {
    NavigationStack {
      List {
        if let power = store.power {
          battery(power.battery)
          keepAwake(power)
          if let lid = power.lidClosed, lid.enabled {
            Section("Lid closed") {
              Text(lid.active ? "Sleep is disabled with the lid closed" : "Set on the Mac, not active now")
            }
          }
          if let error = power.error {
            Section {
              Text(error)
                .foregroundStyle(.red)
            }
          }
        } else {
          Text("Waiting for the Mac")
            .foregroundStyle(.secondary)
        }
      }
      .navigationTitle("Power")
      .safeAreaInset(edge: .top) {
        ConnectionBanner()
      }
    }
  }

  @ViewBuilder
  private func battery(_ battery: Battery?) -> some View {
    Section("Battery") {
      if let battery {
        VStack(alignment: .leading, spacing: 6) {
          Text("\(battery.percent)%")
            .font(.system(size: 56, weight: .semibold, design: .rounded))
            .foregroundStyle(battery.percent <= 20 && !battery.pluggedIn ? .red : .primary)
          ProgressView(value: Double(battery.percent), total: 100)
            .tint(battery.charging ? .green : .accentColor)
          Text(PowerText.state(battery))
            .font(.headline)
          Text("Read \(Date(timeIntervalSince1970: battery.readAt / 1000), style: .relative) ago")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 6)
      } else {
        Text("This Mac has no battery")
      }
    }
  }

  private func keepAwake(_ power: PowerState) -> some View {
    Section {
      Picker("Mode", selection: modeBinding(power)) {
        Text("Keep awake").tag(Optional(PhoneKeepAwake.always))
        Text("Allow sleep").tag(Optional(PhoneKeepAwake.off))
      }
      .pickerStyle(.segmented)
      if power.mode == .whileRunning {
        Text("Set to keep awake while sessions run, from the Mac")
          .font(.footnote)
          .foregroundStyle(.secondary)
      }
      Text(power.holding ? "The Mac is being kept awake now" : "The Mac may sleep when idle")
      Text("\(Formatting.count(power.busyCount, "session")) running")
        .foregroundStyle(.secondary)
    } header: {
      Text("Sleep")
    } footer: {
      Text("Keep awake blocks idle sleep only. The display can still sleep, and closing the lid still sleeps the Mac.")
    }
  }

  private func modeBinding(_ power: PowerState) -> Binding<PhoneKeepAwake?> {
    Binding(
      get: { PowerText.phoneMode(power.mode) },
      set: { mode in
        guard let mode else {
          return
        }
        model.send(.power(SetPower(mode: mode)))
      }
    )
  }
}

enum PowerText {
  static func state(_ battery: Battery) -> String {
    let remaining = battery.minutesRemaining.map(Formatting.minutes)
    guard battery.pluggedIn else {
      return remaining.map { "On battery, \($0) left" } ?? "On battery, estimating"
    }
    guard battery.charging else {
      return "Plugged in, not charging"
    }
    return remaining.map { "Charging, \($0) to full" } ?? "Charging"
  }

  static func phoneMode(_ mode: KeepAwake) -> PhoneKeepAwake? {
    switch mode {
    case .always: .always
    case .off: .off
    case .whileRunning: nil
    }
  }
}
