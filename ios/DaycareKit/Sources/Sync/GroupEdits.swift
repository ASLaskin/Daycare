// Pure edits to sidebar groups; mirrors src/shared/groups.ts.

import Foundation

// Id and color tie breaker for a group about to be formed
public struct NewGroup: Sendable {
  public var id: GroupId
  public var pick: @Sendable (Int) -> Int

  public init(id: GroupId, pick: @escaping @Sendable (Int) -> Int) {
    self.id = id
    self.pick = pick
  }

  public static func random() -> NewGroup {
    NewGroup(id: GroupId(UUID().uuidString.lowercased()), pick: { Int.random(in: 0..<max($0, 1)) })
  }
}

extension GroupColor {
  public var next: GroupColor {
    let all = GroupColor.allCases
    let index = all.firstIndex(of: self) ?? 0
    return all[(index + 1) % all.count]
  }
}

public enum GroupEdits {
  public static func group(of id: SessionId, in groups: [SessionGroup]) -> SessionGroup? {
    groups.first { $0.members.contains(id) }
  }

  // Drops dragged onto target, joining target's group or forming one
  public static func dropOnSession(_ groups: [SessionGroup], dragged: SessionId, target: SessionId, fresh: NewGroup) -> [SessionGroup] {
    guard dragged != target else {
      return groups
    }
    if let existing = group(of: target, in: groups) {
      return dropOnGroup(groups, dragged: dragged, group: existing.id)
    }
    let rest = withoutMember(withoutMember(groups, dragged), target)
    let formed = SessionGroup(
      id: fresh.id,
      name: nextName(rest),
      color: freshColor(rest, pick: fresh.pick),
      collapsed: false,
      members: [target, dragged]
    )
    return rest + [formed]
  }

  public static func dropOnGroup(_ groups: [SessionGroup], dragged: SessionId, group id: GroupId) -> [SessionGroup] {
    guard group(of: dragged, in: groups)?.id != id, groups.contains(where: { $0.id == id }) else {
      return groups
    }
    return groups
      .map { group in
        var moved = group
        moved.members = group.id == id ? group.members + [dragged] : group.members.filter { $0 != dragged }
        return moved
      }
      .filter { $0.members.count > 1 }
  }

  public static func ungroupSession(_ groups: [SessionGroup], _ id: SessionId) -> [SessionGroup] {
    withoutMember(groups, id)
  }

  public static func dissolveGroup(_ groups: [SessionGroup], _ id: GroupId) -> [SessionGroup] {
    groups.filter { $0.id != id }
  }

  public static func editGroup(_ groups: [SessionGroup], _ id: GroupId, _ change: (inout SessionGroup) -> Void) -> [SessionGroup] {
    groups.map { group in
      guard group.id == id else {
        return group
      }
      var edited = group
      change(&edited)
      return edited
    }
  }

  // Groups need two members; smaller ones dissolve
  private static func withoutMember(_ groups: [SessionGroup], _ id: SessionId) -> [SessionGroup] {
    groups
      .map { group in
        var trimmed = group
        trimmed.members = group.members.filter { $0 != id }
        return trimmed
      }
      .filter { $0.members.count > 1 }
  }

  // Lowest Group n name not taken
  private static func nextName(_ groups: [SessionGroup]) -> String {
    let taken = Set(groups.map(\.name))
    let n = (1...(groups.count + 1)).first { !taken.contains("Group \($0)") } ?? groups.count + 1
    return "Group \(n)"
  }

  // Color least used so far, ties broken by pick
  private static func freshColor(_ groups: [SessionGroup], pick: (Int) -> Int) -> GroupColor {
    let uses = Dictionary(grouping: groups, by: \.color).mapValues(\.count)
    let fewest = GroupColor.allCases.map { uses[$0] ?? 0 }.min() ?? 0
    let options = GroupColor.allCases.filter { (uses[$0] ?? 0) == fewest }
    let index = pick(options.count)
    return options.indices.contains(index) ? options[index] : .blue
  }
}
