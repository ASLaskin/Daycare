// Masters with their workers, newest first.

public struct SessionGroup: Hashable, Sendable, Identifiable {
  public var master: MobileSession
  public var workers: [MobileSession]
  public var archivedWorkers: [MobileSession]

  public var id: SessionId { master.id }
}

public enum SessionTree {
  public static func groups(_ sessions: [MobileSession]) -> [SessionGroup] {
    let byParent = Dictionary(grouping: sessions.filter { $0.role == .worker }, by: \.parentId)
    let newest: (MobileSession, MobileSession) -> Bool = { $0.createdAt > $1.createdAt }
    return sessions
      .filter { $0.role == .master }
      .sorted(by: newest)
      .map { master in
        let workers = (byParent[master.id] ?? []).sorted(by: newest)
        return SessionGroup(
          master: master,
          workers: workers.filter { !$0.archived },
          archivedWorkers: workers.filter(\.archived)
        )
      }
  }

  // Workers whose master is gone
  public static func orphans(_ sessions: [MobileSession]) -> [MobileSession] {
    let masters = Set(sessions.filter { $0.role == .master }.map(\.id))
    return sessions
      .filter { $0.role == .worker && !($0.parentId.map(masters.contains) ?? false) }
      .sorted { $0.createdAt > $1.createdAt }
  }
}
