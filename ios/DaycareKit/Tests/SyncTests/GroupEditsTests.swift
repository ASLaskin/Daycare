// Group edits match src/shared/groups.ts.

import Testing
import DaycareKit

@Suite struct GroupEditsTests {
  private let first = NewGroup(id: "g-new", pick: { _ in 0 })

  private func group(_ id: GroupId, _ members: [SessionId], name: String = "G", color: GroupColor = .blue) -> SessionGroup {
    SessionGroup(id: id, name: name, color: color, collapsed: false, members: members)
  }

  @Test func dropOnUngroupedFormsGroup() {
    let groups = GroupEdits.dropOnSession([], dragged: "a", target: "b", fresh: first)
    #expect(groups == [SessionGroup(id: "g-new", name: "Group 1", color: .blue, collapsed: false, members: ["b", "a"])])
  }

  @Test func dropOnSelfDoesNothing() {
    let groups = [group("g", ["a", "b"])]
    #expect(GroupEdits.dropOnSession(groups, dragged: "a", target: "a", fresh: first) == groups)
  }

  @Test func dropOnGroupedJoinsTheirGroup() {
    let groups = GroupEdits.dropOnSession([group("g", ["a", "b"])], dragged: "c", target: "b", fresh: first)
    #expect(groups == [group("g", ["a", "b", "c"])])
  }

  @Test func movingOutDissolvesGroupUnderTwo() {
    let groups = [group("g1", ["a", "b"]), group("g2", ["c", "d"])]
    #expect(GroupEdits.dropOnGroup(groups, dragged: "a", group: "g2") == [group("g2", ["c", "d", "a"])])
  }

  @Test func dropOnUnknownOrOwnGroupDoesNothing() {
    let groups = [group("g", ["a", "b"])]
    #expect(GroupEdits.dropOnGroup(groups, dragged: "a", group: "g") == groups)
    #expect(GroupEdits.dropOnGroup(groups, dragged: "c", group: "nope") == groups)
  }

  @Test func newGroupTakesLowestFreeNameAndLeastUsedColor() {
    let groups = [group("g1", ["a", "b"], name: "Group 2", color: .blue), group("g2", ["c", "d"], name: "Group 3", color: .green)]
    let formed = GroupEdits.dropOnSession(groups, dragged: "e", target: "f", fresh: first).last
    #expect(formed?.name == "Group 1")
    #expect(formed?.color == .amber)
  }

  @Test func colorTiesUsePick() {
    let last = NewGroup(id: "g-new", pick: { $0 - 1 })
    #expect(GroupEdits.dropOnSession([], dragged: "a", target: "b", fresh: last).last?.color == .teal)
  }

  @Test func ungroupAndDissolve() {
    let groups = [group("g1", ["a", "b", "c"]), group("g2", ["d", "e"])]
    #expect(GroupEdits.ungroupSession(groups, "a") == [group("g1", ["b", "c"]), group("g2", ["d", "e"])])
    #expect(GroupEdits.ungroupSession(groups, "d") == [group("g1", ["a", "b", "c"])])
    #expect(GroupEdits.dissolveGroup(groups, "g1") == [group("g2", ["d", "e"])])
  }

  @Test func editChangesOnlyThatGroup() {
    let groups = [group("g1", ["a", "b"]), group("g2", ["c", "d"])]
    let edited = GroupEdits.editGroup(groups, "g2") { $0.collapsed = true }
    #expect(edited.map(\.collapsed) == [false, true])
  }

  @Test func nextColorWraps() {
    #expect(GroupColor.blue.next == .green)
    #expect(GroupColor.teal.next == .blue)
  }
}
