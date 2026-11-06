// What the new session screen offers, mirrored from desktop settings.

public struct Location: Codable, Hashable, Sendable {
  public var label: String
  public var path: DirPath

  public init(label: String, path: DirPath) {
    self.label = label
    self.path = path
  }
}

public struct Account: Codable, Hashable, Sendable, Identifiable {
  public var id: AccountId
  public var label: String

  public init(id: AccountId, label: String) {
    self.id = id
    self.label = label
  }
}

public struct Choice: Codable, Hashable, Sendable, Identifiable {
  public var id: String
  public var label: String

  public init(id: String, label: String) {
    self.id = id
    self.label = label
  }
}

public struct Catalog: Codable, Hashable, Sendable {
  public var locations: [Location]
  // Default first
  public var accounts: [Account]
  public var activeAccount: AccountId
  public var defaultLocation: DirPath?
  public var provider: Provider
  public var model: String
  public var effort: String
  public var permissionMode: PermissionMode
  public var models: [Choice]
  public var efforts: [Choice]

  public init(
    locations: [Location], accounts: [Account], activeAccount: AccountId, defaultLocation: DirPath?,
    provider: Provider, model: String, effort: String, permissionMode: PermissionMode,
    models: [Choice], efforts: [Choice]
  ) {
    self.locations = locations
    self.accounts = accounts
    self.activeAccount = activeAccount
    self.defaultLocation = defaultLocation
    self.provider = provider
    self.model = model
    self.effort = effort
    self.permissionMode = permissionMode
    self.models = models
    self.efforts = efforts
  }
}
