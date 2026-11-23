// Typed command results.

public struct HistoryRow: Codable, Hashable, Sendable, Identifiable {
  public var entry: Entry
  public var event: ChatEvent

  public init(entry: Entry, event: ChatEvent) {
    self.entry = entry
    self.event = event
  }

  public var id: Entry { entry }
}

// Oldest first
public struct HistoryPage: Codable, Hashable, Sendable {
  public var session: SessionId
  public var rows: [HistoryRow]
  // Rows exist before the first returned one
  public var hasOlder: Bool
  // Rows exist after the last returned one
  public var hasNewer: Bool
  // Older rows were discarded by the retention limit
  public var evicted: Bool

  public init(session: SessionId, rows: [HistoryRow], hasOlder: Bool, hasNewer: Bool, evicted: Bool) {
    self.session = session
    self.rows = rows
    self.hasOlder = hasOlder
    self.hasNewer = hasNewer
    self.evicted = evicted
  }
}

public struct CreateResult: Codable, Hashable, Sendable {
  public var session: SessionId
}

// Entry of the recorded user event
public struct SendResult: Codable, Hashable, Sendable {
  public var accepted: String
  public var entry: Entry
}

public struct UploadResult: Codable, Hashable, Sendable {
  public var path: FilePath
}

// Result of commands that return {}
public struct EmptyResult: Codable, Hashable, Sendable {
  public init() {}
}
