// Live Activity content built from the phone's own state.

public enum ActivityStateBuilder {
  public static func build(
    sessions: [MobileSession], approvals: Int, power: PowerState?, runningSince: [SessionId: Double], now: Double
  ) -> ActivityState {
    let byId = Dictionary(sessions.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    let running = sessions
      .filter { $0.state == .running && !$0.closed }
      .map { s in
        ActivityWorker(
          id: s.id,
          name: s.name,
          master: s.parentId.flatMap { byId[$0]?.name },
          since: runningSince[s.id] ?? (s.lastEventAt.map { $0 / 1000 } ?? now)
        )
      }
      .sorted { $0.since > $1.since }
    return ActivityState(
      running: Array(running.prefix(ActivityState.maxRunning)),
      runningCount: running.count,
      approvals: approvals,
      batteryPercent: power?.battery?.percent,
      charging: power?.battery?.charging ?? false,
      keepAwake: power?.holding ?? false,
      updatedAt: now
    )
  }
}
