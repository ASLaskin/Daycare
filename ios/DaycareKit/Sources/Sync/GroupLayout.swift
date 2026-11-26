// Session list rows with groups placed where their newest member sits.

public enum SessionListEntry: Hashable, Sendable, Identifiable {
  case single(SessionFamily)
  case group(SessionGroup, [SessionFamily])

  public var id: String {
    switch self {
    case .single(let family): "session:\(family.id.rawValue)"
    case .group(let group, _): "group:\(group.id.rawValue)"
    }
  }
}

public enum GroupLayout {
  // Families come newest first; members keep the group's order
  public static func entries(_ families: [SessionFamily], groups: [SessionGroup]) -> [SessionListEntry] {
    let byId = Dictionary(families.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    let groupOf = Dictionary(
      groups.flatMap { group in group.members.map { ($0, group) } },
      uniquingKeysWith: { first, _ in first }
    )
    var placed = Set<GroupId>()
    return families.compactMap { family in
      guard let group = groupOf[family.id] else {
        return .single(family)
      }
      guard placed.insert(group.id).inserted else {
        return nil
      }
      return .group(group, group.members.compactMap { byId[$0] })
    }
  }

  // Counts by kind, like 1 master, 2 chats
  public static func kindSummary(_ members: [MobileSession]) -> String {
    let masters = members.filter(\.masterMode).count
    let chats = members.count - masters
    return [(masters, "master"), (chats, "chat")]
      .filter { $0.0 > 0 }
      .map { "\($0.0) \($0.1)\($0.0 == 1 ? "" : "s")" }
      .joined(separator: ", ")
  }
}
