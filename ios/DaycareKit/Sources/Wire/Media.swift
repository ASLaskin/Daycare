// Media files the coordinator found in a session's events.

public enum MediaKind: String, Codable, Hashable, Sendable {
  case image
  case video
  case audio
}

public struct MediaItem: Codable, Hashable, Sendable, Identifiable {
  // Real path, symlinks resolved
  public var path: FilePath
  public var name: String
  public var mimeType: String
  public var kind: MediaKind
  public var size: Int
  // Epoch ms
  public var modifiedAt: Double
  // Newest mentioning entry; null when only under cwd
  public var entry: Entry?

  public init(path: FilePath, name: String, mimeType: String, kind: MediaKind, size: Int, modifiedAt: Double, entry: Entry?) {
    self.path = path
    self.name = name
    self.mimeType = mimeType
    self.kind = kind
    self.size = size
    self.modifiedAt = modifiedAt
    self.entry = entry
  }

  public var id: FilePath { path }

  // Cache key part; changes with the file on disk
  public var version: String { "\(Int(modifiedAt))-\(size)" }
}

public struct MediaList: Codable, Hashable, Sendable {
  public var session: SessionId
  public var items: [MediaItem]

  public init(session: SessionId, items: [MediaItem]) {
    self.session = session
    self.items = items
  }
}
