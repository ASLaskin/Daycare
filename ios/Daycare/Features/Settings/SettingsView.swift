// Connection details, notification kinds, failures, pairing.

import DaycareKit
import SwiftUI

struct SettingsView: View {
  @Environment(AppModel.self) private var model
  @Environment(Connection.self) private var connection
  @Environment(PushRegistrar.self) private var push
  @Environment(Outbox.self) private var outbox
  @State private var confirmingUnpair = false

  var body: some View {
    NavigationStack {
      List {
        Section("Mac") {
          LabeledContent("Host", value: model.pairing?.host ?? "")
          LabeledContent("Port", value: model.pairing.map { String($0.port) } ?? "")
          LabeledContent("Status", value: status)
          if let version = connection.coordinatorVersion {
            LabeledContent("Daycare", value: version)
          }
          LabeledContent("Queued", value: String(outbox.items.count))
        }
        Section {
          ForEach(PushKind.allCases, id: \.self) { kind in
            Toggle(SettingsView.label(kind), isOn: Binding(
              get: { push.kinds.contains(kind) },
              set: { push.setKind(kind, enabled: $0) }
            ))
          }
        } header: {
          Text("Notifications")
        } footer: {
          Text(notificationFooter)
        }
        if !outbox.failures.isEmpty {
          Section("Failed to send") {
            ForEach(outbox.failures) { failure in
              VStack(alignment: .leading) {
                Text(failure.method.capitalized)
                  .font(.subheadline.weight(.semibold))
                Text(failure.message)
                  .font(.footnote)
                  .foregroundStyle(.secondary)
              }
              .swipeActions {
                Button("Dismiss") { outbox.dismiss(failure) }
              }
            }
          }
        }
        Section {
          Button("Pair with a different Mac", role: .destructive) {
            confirmingUnpair = true
          }
        } footer: {
          Text("App \(AppInfo.build), protocol \(WireProtocol.version)")
        }
      }
      .navigationTitle("Settings")
      .confirmationDialog("Unpair this phone?", isPresented: $confirmingUnpair, titleVisibility: .visible) {
        Button("Unpair", role: .destructive) {
          Task {
            await model.unpair()
          }
        }
      } message: {
        Text("Cached transcripts and queued messages are deleted.")
      }
    }
  }

  private var status: String {
    switch connection.phase {
    case .online: "Connected"
    case .connecting, .idle: "Connecting"
    case .retrying: "Offline"
    case .noNetwork: "No network"
    case .replaced: "Replaced"
    case .mismatch: "Update needed"
    case .unauthorized: "Pair again"
    }
  }

  private var notificationFooter: String {
    if let error = model.pushError {
      return error
    }
    return push.authorized ? "Sent by the Mac through Apple Push." : "Notifications are off for Daycare in iOS Settings."
  }

  static func label(_ kind: PushKind) -> String {
    switch kind {
    case .workerDone: "Worker finished"
    case .masterDone: "Master finished"
    case .approval: "Approval needed"
    case .batteryLow: "Mac battery low"
    }
  }
}
