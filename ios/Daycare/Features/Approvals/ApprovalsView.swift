// Every pending approval across sessions; push taps open one directly.

import DaycareKit
import SwiftUI

struct ApprovalsView: View {
  @Environment(SessionStore.self) private var store
  @Environment(Router.self) private var router

  var body: some View {
    @Bindable var router = router
    NavigationStack {
      ScrollView {
        LazyVStack(spacing: 12) {
          ForEach(store.sortedApprovals) { approval in
            ApprovalCard(approval: approval, showsSession: true)
          }
        }
        .padding()
      }
      .overlay {
        if store.approvals.isEmpty {
          ContentUnavailableView {
            Text("Nothing waiting")
          } description: {
            Text("Permission requests from your sessions show up here.")
          }
        }
      }
      .navigationTitle("Approvals")
      .safeAreaInset(edge: .top) {
        ConnectionBanner()
      }
    }
    .sheet(item: $router.approval) { request in
      ApprovalSheet(request: request)
    }
  }
}

// Opened from an approval push
struct ApprovalSheet: View {
  let request: RequestId
  @Environment(SessionStore.self) private var store
  @Environment(Connection.self) private var connection
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      ScrollView {
        if let approval = store.approvals[request] {
          ApprovalCard(approval: approval, showsSession: true)
            .padding()
        } else {
          Text(connection.isOnline ? "Already answered." : "Connecting to the Mac")
            .foregroundStyle(.secondary)
            .padding(.top, 40)
        }
      }
      .navigationTitle("Approval")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Done") { dismiss() }
        }
      }
    }
    .presentationDetents([.medium, .large])
    .onChange(of: store.approvals[request] == nil) { _, gone in
      guard gone, connection.isOnline else {
        return
      }
      dismiss()
    }
  }
}
