// Sample sessions and groups for screenshots, launched with -DaycareSeed.

#if DEBUG
import DaycareKit
import Foundation

enum DebugSeed {
  static var requested: Bool { ProcessInfo.processInfo.arguments.contains("-DaycareSeed") }

  static let pairing = PairingLink(host: "preview.local", port: 7443, token: "preview")

  static var snapshot: Snapshot {
    let now = Date().timeIntervalSince1970 * 1000
    let minutes = { (n: Double) in now - n * 60_000 }
    let sessions = [
      session("s1", "Checkout refactor", master: true, at: minutes(5), state: .running, preview: "Splitting the cart reducer into two files"),
      session("s2", "Release notes", master: false, at: minutes(20), preview: "Drafted the changelog for 1.4"),
      session("s3", "Flaky e2e", master: true, at: minutes(30), preview: "The retry wraps the wrong promise"),
      session("w1", "Fix cart tests", master: false, at: minutes(4), state: .running, parent: "s1"),
      session("s4", "Docs site", master: true, at: minutes(60), preview: "Deployed preview"),
      session("s5", "Ask about SQL", master: false, at: minutes(90), preview: "Use a window function"),
      session("s6", "Icon ideas", master: false, at: minutes(120), preview: "Three directions"),
    ]
    let groups = [
      SessionGroup(id: "g1", name: "Payments", color: .teal, collapsed: false, members: ["s1", "s2", "s3"]),
      SessionGroup(id: "g2", name: "Side quests", color: .violet, collapsed: true, members: ["s4", "s5", "s6"]),
    ]
    let power = PowerState(mode: .whileRunning, holding: true, busyCount: 1, battery: nil, lidClosed: nil, error: nil)
    return Snapshot(epoch: "seed", seq: 0, sessions: sessions, approvals: [], power: power, catalog: nil, unavailable: [], groups: groups)
  }

  private static func session(
    _ id: SessionId, _ name: String, master: Bool, at: Double, state: SessionState = .idle, parent: SessionId? = nil,
    preview: String? = nil
  ) -> MobileSession {
    MobileSession(
      id: id, provider: .claude, nativeId: nil, role: parent == nil ? .master : .worker, masterMode: master, parentId: parent,
      name: name, icon: nil, cwd: "/Users/me/code/shop", model: "opus", effort: "high", permissionMode: .default, state: state,
      closed: false, archived: false, error: nil, createdAt: at, run: 1, accountId: "default", configDir: nil,
      live: state == .running, lastEntry: nil, lastEventAt: at, preview: preview
    )
  }
}
#endif
