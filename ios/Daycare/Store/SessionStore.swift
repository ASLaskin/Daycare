// Sessions, approvals, power and catalog from the snapshot and events.

import DaycareKit
import Foundation
import Observation

@MainActor
@Observable
final class SessionStore {
  private(set) var sessions: [SessionId: MobileSession] = [:]
  private(set) var approvals: [RequestId: Approval] = [:]
  private(set) var power: PowerState?
  private(set) var catalog: Catalog?
  private(set) var unavailable: [String] = []
  // Snapshot received in this process; resume is only valid then
  private(set) var loaded = false
  private(set) var epoch: Epoch?
  private(set) var seq = 0
  // Epoch seconds each session was first seen running
  private(set) var runningSince: [SessionId: Double] = [:]

  var resume: Resume? {
    guard loaded, let epoch else {
      return nil
    }
    return Resume(epoch: epoch, seq: seq)
  }

  var groups: [SessionGroup] { SessionTree.groups(Array(sessions.values)) }
  var orphans: [MobileSession] { SessionTree.orphans(Array(sessions.values)) }

  var sortedApprovals: [Approval] {
    approvals.values.sorted { $0.request.rawValue < $1.request.rawValue }
  }

  func approvals(for session: SessionId) -> [Approval] {
    sortedApprovals.filter { $0.session == session }
  }

  func status(of session: MobileSession) -> SessionStatus {
    SessionStatus(session, pendingApprovals: approvals.values.filter { $0.session == session.id }.count)
  }

  func workers(of master: SessionId) -> [MobileSession] {
    sessions.values.filter { $0.parentId == master }.sorted { $0.createdAt > $1.createdAt }
  }

  func welcome(_ welcome: Welcome) {
    if epoch != welcome.epoch {
      seq = 0
    }
    epoch = welcome.epoch
  }

  func apply(_ snapshot: Snapshot) {
    sessions = Dictionary(snapshot.sessions.map { ($0.id, $0) }, uniquingKeysWith: { _, newer in newer })
    approvals = Dictionary(snapshot.approvals.map { ($0.request, $0) }, uniquingKeysWith: { _, newer in newer })
    power = snapshot.power
    catalog = snapshot.catalog
    unavailable = snapshot.unavailable
    epoch = snapshot.epoch
    seq = snapshot.seq
    loaded = true
    trackRunning()
  }

  func apply(_ frame: EventFrame) {
    seq = max(seq, frame.seq)
    switch frame.event {
    case .session(let session):
      sessions[session.id] = session
      trackRunning()
    case .removed(let removed):
      sessions.removeValue(forKey: removed.session)
      approvals = approvals.filter { $0.value.session != removed.session }
    case .approval(let approval):
      approvals[approval.request] = approval
    case .approvalResolved(let resolved):
      approvals.removeValue(forKey: resolved.request)
    case .power(let power):
      self.power = power
    case .catalog(let catalog):
      self.catalog = catalog
    case .chat, .media, .unknown:
      return
    }
  }

  func reset() {
    sessions = [:]
    approvals = [:]
    power = nil
    catalog = nil
    unavailable = []
    loaded = false
    epoch = nil
    seq = 0
    runningSince = [:]
  }

  private func trackRunning() {
    let now = Date().timeIntervalSince1970
    let running = sessions.values.filter { $0.state == .running }.map(\.id)
    runningSince = Dictionary(running.map { ($0, runningSince[$0] ?? now) }, uniquingKeysWith: { first, _ in first })
  }
}
