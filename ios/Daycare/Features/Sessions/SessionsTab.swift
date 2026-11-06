// Sessions navigation stack: list, detail, new session sheet.

import DaycareKit
import SwiftUI

struct SessionsTab: View {
  @Environment(Router.self) private var router
  @State private var creating = false

  var body: some View {
    @Bindable var router = router
    NavigationStack(path: $router.sessionPath) {
      SessionListView()
        .navigationTitle("Sessions")
        .navigationDestination(for: SessionId.self) { id in
          SessionDetailView(id: id)
        }
        .toolbar {
          ToolbarItem(placement: .topBarTrailing) {
            Button("New") {
              creating = true
            }
          }
        }
        .safeAreaInset(edge: .top) {
          ConnectionBanner()
        }
    }
    .sheet(isPresented: $creating) {
      NewSessionView()
    }
  }
}
