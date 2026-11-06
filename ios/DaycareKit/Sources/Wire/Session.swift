// Session row as the gateway sends it; mirrors MobileSession.

public enum Provider: String, Codable, Hashable, Sendable, CaseIterable {
  case claude
  case codex
}

public enum SessionRole: String, Codable, Hashable, Sendable {
  case master
  case worker
}

public enum PermissionMode: String, Codable, Hashable, Sendable, CaseIterable {
  case `default`
  case acceptEdits
  case bypassPermissions
  case plan
}

public enum SessionState: String, Codable, Hashable, Sendable {
  case creating
  case incomplete
  case idle
  case running
  case interrupted
}

public struct MobileSession: Codable, Hashable, Sendable, Identifiable {
  public var id: SessionId
  public var provider: Provider
  public var nativeId: NativeId?
  public var role: SessionRole
  public var parentId: SessionId?
  public var name: String
  public var icon: String?
  public var cwd: DirPath
  public var model: String?
  public var effort: String?
  public var permissionMode: PermissionMode
  public var state: SessionState
  public var closed: Bool
  // Worker set aside; stays closed until unarchived
  public var archived: Bool
  public var error: String?
  public var createdAt: Double
  // Provider launch count; scopes streamed partials
  public var run: Double
  public var accountId: AccountId
  // Claude config dir; null is ~/.claude
  public var configDir: DirPath?
  // Provider running now
  public var live: Bool
  // Newest history entry, null when empty
  public var lastEntry: Entry?
  // Epoch ms of the newest history entry
  public var lastEventAt: Double?
  // Start of the newest assistant text
  public var preview: String?

  public init(
    id: SessionId, provider: Provider, nativeId: NativeId?, role: SessionRole, parentId: SessionId?, name: String,
    icon: String?, cwd: DirPath, model: String?, effort: String?, permissionMode: PermissionMode, state: SessionState,
    closed: Bool, archived: Bool, error: String?, createdAt: Double, run: Double, accountId: AccountId,
    configDir: DirPath?, live: Bool, lastEntry: Entry?, lastEventAt: Double?, preview: String?
  ) {
    self.id = id
    self.provider = provider
    self.nativeId = nativeId
    self.role = role
    self.parentId = parentId
    self.name = name
    self.icon = icon
    self.cwd = cwd
    self.model = model
    self.effort = effort
    self.permissionMode = permissionMode
    self.state = state
    self.closed = closed
    self.archived = archived
    self.error = error
    self.createdAt = createdAt
    self.run = run
    self.accountId = accountId
    self.configDir = configDir
    self.live = live
    self.lastEntry = lastEntry
    self.lastEventAt = lastEventAt
    self.preview = preview
  }
}
