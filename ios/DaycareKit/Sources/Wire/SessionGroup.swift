// Sidebar group of top-level sessions; mirrors SessionGroup.

public enum GroupColor: String, Codable, Hashable, Sendable, CaseIterable {
  case blue
  case green
  case amber
  case rose
  case violet
  case teal
}

public struct SessionGroup: Codable, Hashable, Sendable, Identifiable {
  public var id: GroupId
  public var name: String
  public var color: GroupColor
  public var collapsed: Bool
  // Masters and chats in display order; always two or more
  public var members: [SessionId]

  public init(id: GroupId, name: String, color: GroupColor, collapsed: Bool, members: [SessionId]) {
    self.id = id
    self.name = name
    self.color = color
    self.collapsed = collapsed
    self.members = members
  }
}
