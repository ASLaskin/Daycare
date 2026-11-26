// List entries, kind labels and group summaries.

import Testing
import DaycareKit

@Suite struct GroupLayoutTests {
  private func session(_ id: SessionId, at: Double, master: Bool = true, role: SessionRole = .master) -> MobileSession {
    MobileSession(
      id: id, provider: .claude, nativeId: nil, role: role, masterMode: master, parentId: nil, name: id.rawValue, icon: nil,
      cwd: "/x", model: nil, effort: nil, permissionMode: .default, state: .idle, closed: false, archived: false, error: nil,
      createdAt: at, run: 1, accountId: "default", configDir: nil, live: false, lastEntry: nil, lastEventAt: nil, preview: nil
    )
  }

  @Test func groupSitsAtNewestMemberInGroupOrder() {
    let families = SessionTree.families([session("a", at: 1), session("b", at: 2), session("c", at: 3), session("d", at: 4)])
    let group = SessionGroup(id: "g", name: "G", color: .rose, collapsed: false, members: ["a", "c"])
    let entries = GroupLayout.entries(families, groups: [group])
    #expect(entries.map(\.id) == ["session:d", "group:g", "session:b"])
    guard case .group(_, let members) = entries[1] else {
      Issue.record("Expected group")
      return
    }
    #expect(members.map(\.id) == ["a", "c"])
  }

  @Test func hiddenMembersAreSkipped() {
    let families = SessionTree.families([session("a", at: 1)])
    let group = SessionGroup(id: "g", name: "G", color: .rose, collapsed: false, members: ["a", "gone"])
    #expect(GroupLayout.entries(families, groups: [group]).map(\.id) == ["group:g"])
  }

  @Test func kindLabels() {
    #expect(session("a", at: 1).kindLabel == "Master")
    #expect(session("a", at: 1, master: false).kindLabel == "Chat")
    #expect(session("a", at: 1, master: false, role: .worker).kindLabel == "Worker")
  }

  @Test func kindSummary() {
    let members = [session("a", at: 1), session("b", at: 2, master: false), session("c", at: 3, master: false)]
    #expect(GroupLayout.kindSummary(members) == "1 master, 2 chats")
    #expect(GroupLayout.kindSummary(Array(members.prefix(1))) == "1 master")
  }
}
