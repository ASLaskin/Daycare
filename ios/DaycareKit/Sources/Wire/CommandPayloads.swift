// Field sets of each MobileCommand method.

// Chat events for these sessions only; replaces the previous set
public struct Watch: Codable, Hashable, Sendable {
  public var sessions: [SessionId]
  // False drops text-delta; the final text event still arrives
  public var deltas: Bool

  public init(sessions: [SessionId], deltas: Bool) {
    self.sessions = sessions
    self.deltas = deltas
  }
}

// Newest page without cursors; before and after are exclusive
public struct HistoryQuery: Codable, Hashable, Sendable {
  public var session: SessionId
  public var before: Entry?
  public var after: Entry?
  public var limit: Int?

  public init(session: SessionId, before: Entry? = nil, after: Entry? = nil, limit: Int? = nil) {
    self.session = session
    self.before = before
    self.after = after
    self.limit = limit
  }
}

public struct CreateSession: Codable, Hashable, Sendable {
  public var provider: Provider
  public var cwd: DirPath
  public var prompt: String
  public var name: String?
  public var model: String?
  public var effort: String?
  public var permissionMode: PermissionMode
  // Catalog's active account when absent
  public var accountId: AccountId?
  // Paths from upload, sent as file references
  public var files: [FilePath]

  public init(
    provider: Provider, cwd: DirPath, prompt: String, name: String?, model: String?, effort: String?,
    permissionMode: PermissionMode, accountId: AccountId?, files: [FilePath]
  ) {
    self.provider = provider
    self.cwd = cwd
    self.prompt = prompt
    self.name = name
    self.model = model
    self.effort = effort
    self.permissionMode = permissionMode
    self.accountId = accountId
    self.files = files
  }

  private enum CodingKeys: String, CodingKey {
    case provider, cwd, prompt, name, model, effort, permissionMode, accountId, files
  }

  // Nullable model and effort are sent as explicit nulls
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(provider, forKey: .provider)
    try container.encode(cwd, forKey: .cwd)
    try container.encode(prompt, forKey: .prompt)
    try container.encodeIfPresent(name, forKey: .name)
    try container.encode(model, forKey: .model)
    try container.encode(effort, forKey: .effort)
    try container.encode(permissionMode, forKey: .permissionMode)
    try container.encodeIfPresent(accountId, forKey: .accountId)
    try container.encode(files, forKey: .files)
  }
}

public struct SendMessage: Codable, Hashable, Sendable {
  public var session: SessionId
  public var text: String
  public var files: [FilePath]

  public init(session: SessionId, text: String, files: [FilePath]) {
    self.session = session
    self.text = text
    self.files = files
  }
}

// Saves a file under the coordinator's attachments folder
public struct Upload: Codable, Hashable, Sendable {
  public var name: String
  public var data: Base64

  public init(name: String, data: Base64) {
    self.name = name
    self.data = data
  }
}

public struct SessionTarget: Codable, Hashable, Sendable {
  public var session: SessionId

  public init(session: SessionId) {
    self.session = session
  }
}

public struct Answer: Codable, Hashable, Sendable {
  public var session: SessionId
  public var request: RequestId
  public var choice: String
  public var message: String?
  public var updatedInput: JSONValue?

  public init(session: SessionId, request: RequestId, choice: String, message: String? = nil, updatedInput: JSONValue? = nil) {
    self.session = session
    self.request = request
    self.choice = choice
    self.message = message
    self.updatedInput = updatedInput
  }
}

public struct Rename: Codable, Hashable, Sendable {
  public var session: SessionId
  public var name: String

  public init(session: SessionId, name: String) {
    self.session = session
    self.name = name
  }
}

// Config dir comes from the catalog
public struct Move: Codable, Hashable, Sendable {
  public var session: SessionId
  public var accountId: AccountId

  public init(session: SessionId, accountId: AccountId) {
    self.session = session
    self.accountId = accountId
  }
}

public struct SetModel: Codable, Hashable, Sendable {
  public var session: SessionId
  public var model: String

  public init(session: SessionId, model: String) {
    self.session = session
    self.model = model
  }
}

public struct SetEffort: Codable, Hashable, Sendable {
  public var session: SessionId
  public var effort: String

  public init(session: SessionId, effort: String) {
    self.session = session
    self.effort = effort
  }
}

public struct WorkerModels: Codable, Hashable, Sendable {
  public var workerModel: String
  public var autoWorkerModel: Bool

  public init(workerModel: String, autoWorkerModel: Bool) {
    self.workerModel = workerModel
    self.autoWorkerModel = autoWorkerModel
  }
}

public struct WorkerEfforts: Codable, Hashable, Sendable {
  public var workerEffort: String
  public var autoWorkerEffort: Bool

  public init(workerEffort: String, autoWorkerEffort: Bool) {
    self.workerEffort = workerEffort
    self.autoWorkerEffort = autoWorkerEffort
  }
}

public struct Configure: Codable, Hashable, Sendable {
  public var workerModels: WorkerModels
  public var workerEfforts: WorkerEfforts

  public init(workerModels: WorkerModels, workerEfforts: WorkerEfforts) {
    self.workerModels = workerModels
    self.workerEfforts = workerEfforts
  }
}

public struct SetPower: Codable, Hashable, Sendable {
  public var mode: PhoneKeepAwake

  public init(mode: PhoneKeepAwake) {
    self.mode = mode
  }
}

// Upserts this hello's device; sent after every welcome
public struct Register: Codable, Hashable, Sendable {
  public var apnsToken: ApnsToken
  public var environment: ApnsEnvironment
  // Live Activity push to start token
  public var pushToStart: ApnsToken?
  public var kinds: [PushKind]

  public init(apnsToken: ApnsToken, environment: ApnsEnvironment, pushToStart: ApnsToken?, kinds: [PushKind]) {
    self.apnsToken = apnsToken
    self.environment = environment
    self.pushToStart = pushToStart
    self.kinds = kinds
  }

  private enum CodingKeys: String, CodingKey {
    case apnsToken, environment, pushToStart, kinds
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(apnsToken, forKey: .apnsToken)
    try container.encode(environment, forKey: .environment)
    try container.encode(pushToStart, forKey: .pushToStart)
    try container.encode(kinds, forKey: .kinds)
  }
}

// Update token of a running Live Activity
public struct ActivityToken: Codable, Hashable, Sendable {
  public var activity: ActivityId
  public var token: ApnsToken

  public init(activity: ActivityId, token: ApnsToken) {
    self.activity = activity
    self.token = token
  }
}

public struct ActivityEnded: Codable, Hashable, Sendable {
  public var activity: ActivityId

  public init(activity: ActivityId) {
    self.activity = activity
  }
}
