// Open transcripts: cache, watch set, history paging and live events.

import DaycareKit
import Foundation
import Observation

@MainActor
@Observable
final class TranscriptStore {
  // A cache further behind than this is dropped for the newest page
  static let maxGap = 600
  static let pageSize = 100

  private(set) var transcripts: [SessionId: Transcript] = [:]
  private(set) var syncing: Set<SessionId> = []
  private(set) var loadingOlder: Set<SessionId> = []
  private(set) var failures: [SessionId: String] = [:]

  @ObservationIgnored private var openCounts: [SessionId: Int] = [:]
  @ObservationIgnored private let cache = TranscriptCache()
  @ObservationIgnored private let connection: Connection
  @ObservationIgnored private let lastEntry: (SessionId) -> Entry?

  init(connection: Connection, lastEntry: @escaping (SessionId) -> Entry?) {
    self.connection = connection
    self.lastEntry = lastEntry
  }

  var watched: [SessionId] { openCounts.keys.sorted { $0.rawValue < $1.rawValue } }

  func items(_ session: SessionId) -> [TranscriptItem] {
    TranscriptItems.build(transcripts[session]?.rows ?? [])
  }

  func open(_ session: SessionId) {
    openCounts[session, default: 0] += 1
    guard openCounts[session] == 1 else {
      return
    }
    if transcripts[session] == nil {
      transcripts[session] = cache.load(session) ?? Transcript()
    }
    sendWatch()
    Task {
      await sync(session)
    }
  }

  func close(_ session: SessionId) {
    guard let count = openCounts[session] else {
      return
    }
    guard count <= 1 else {
      openCounts[session] = count - 1
      return
    }
    openCounts.removeValue(forKey: session)
    if let transcript = transcripts[session] {
      cache.save(transcript, for: session)
    }
    transcripts[session]?.synced = false
    sendWatch()
  }

  func applyLive(_ chat: SessionChatEvent) {
    guard openCounts[chat.session] != nil else {
      return
    }
    transcripts[chat.session]?.applyLive(HistoryRow(entry: chat.entry, event: chat.event))
  }

  // After a fresh snapshot or a new welcome
  func resyncOpen() {
    watched.forEach { session in
      transcripts[session]?.synced = false
      Task {
        await sync(session)
      }
    }
  }

  func sync(_ session: SessionId) async {
    guard connection.isOnline, !syncing.contains(session), var transcript = transcripts[session] else {
      return
    }
    syncing.insert(session)
    defer { syncing.remove(session) }
    failures.removeValue(forKey: session)
    transcript.synced = false
    transcripts[session] = transcript
    do {
      guard let from = transcript.lastEntry, !isTooFarBehind(session, from) else {
        let page = try await page(HistoryQuery(session: session, limit: TranscriptStore.pageSize))
        transcript.apply(page, direction: .newest)
        transcripts[session] = transcript
        return
      }
      var cursor = from
      while !transcript.synced {
        let page = try await page(HistoryQuery(session: session, after: cursor, limit: WireProtocol.maxPage))
        transcript.apply(page, direction: .newer)
        transcripts[session] = transcript
        guard let last = page.rows.last?.entry else {
          transcript.synced = true
          transcripts[session] = transcript
          return
        }
        cursor = last
      }
    } catch {
      failures[session] = "Could not load history"
    }
  }

  func loadOlder(_ session: SessionId) async {
    guard connection.isOnline, !loadingOlder.contains(session), let transcript = transcripts[session],
      transcript.hasOlder, let first = transcript.firstEntry
    else {
      return
    }
    loadingOlder.insert(session)
    defer { loadingOlder.remove(session) }
    do {
      let page = try await page(HistoryQuery(session: session, before: first, limit: TranscriptStore.pageSize))
      transcripts[session]?.apply(page, direction: .older)
    } catch {
      failures[session] = "Could not load earlier messages"
    }
  }

  func removed(_ session: SessionId) {
    transcripts.removeValue(forKey: session)
    cache.remove(session)
  }

  func saveAll() {
    transcripts.forEach { session, transcript in
      cache.save(transcript, for: session)
    }
  }

  func reset() {
    transcripts = [:]
    openCounts = [:]
    cache.removeAll()
  }

  func sendWatch() {
    guard connection.isOnline else {
      return
    }
    let watch = Watch(sessions: watched, deltas: true)
    Task {
      _ = try? await connection.request(.watch(watch))
    }
  }

  private func isTooFarBehind(_ session: SessionId, _ from: Entry) -> Bool {
    guard let newest = lastEntry(session) else {
      return false
    }
    return newest - from > TranscriptStore.maxGap
  }

  private func page(_ query: HistoryQuery) async throws -> HistoryPage {
    try await connection.request(.history(query), as: HistoryPage.self)
  }
}
