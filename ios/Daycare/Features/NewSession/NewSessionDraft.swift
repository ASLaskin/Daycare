// Form state for a new session, defaulted from the catalog.

import DaycareKit
import Foundation

struct NewSessionDraft {
  var prompt = ""
  var name = ""
  var cwd: DirPath?
  var provider: Provider = .claude
  var model = ""
  var effort = ""
  var permissionMode: PermissionMode = .default
  var accountId: AccountId = "default"

  var canStart: Bool {
    cwd != nil && !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  mutating func adopt(_ catalog: Catalog, sessions: [MobileSession]) {
    cwd = catalog.defaultLocation ?? locations(catalog, sessions: sessions).first?.path
    provider = catalog.provider
    model = catalog.model
    effort = catalog.effort
    permissionMode = catalog.permissionMode
    accountId = catalog.activeAccount
  }

  // Catalog locations, then other session folders
  func locations(_ catalog: Catalog, sessions: [MobileSession]) -> [Location] {
    let known = Set(catalog.locations.map(\.path))
    let extra = Set(sessions.map(\.cwd)).subtracting(known)
      .sorted { $0.rawValue < $1.rawValue }
      .map { Location(label: $0.rawValue.split(separator: "/").last.map(String.init) ?? $0.rawValue, path: $0) }
    return catalog.locations + extra
  }

  func command(catalog: Catalog?) -> CreateSession? {
    guard let cwd else {
      return nil
    }
    let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
    return CreateSession(
      provider: provider,
      cwd: cwd,
      prompt: prompt.trimmingCharacters(in: .whitespacesAndNewlines),
      name: trimmedName.isEmpty ? nil : trimmedName,
      model: model.isEmpty ? nil : model,
      effort: effort.isEmpty ? nil : effort,
      permissionMode: permissionMode,
      accountId: accountId == catalog?.activeAccount ? nil : accountId,
      files: []
    )
  }

  static func label(_ mode: PermissionMode) -> String {
    switch mode {
    case .default: "Ask"
    case .acceptEdits: "Accept edits"
    case .bypassPermissions: "Bypass"
    case .plan: "Plan"
    }
  }
}
