// Transcript merge rules: unique entries, text replaces its deltas, live gating.

import Testing
import DaycareKit

@Suite struct TranscriptTests {
  func delta(_ entry: Entry, _ text: String, block: String = "b") -> HistoryRow {
    HistoryRow(entry: entry, event: .textDelta(TextEvent(block: block, text: text)))
  }

  func text(_ entry: Entry, _ text: String, block: String = "b") -> HistoryRow {
    HistoryRow(entry: entry, event: .text(TextEvent(block: block, text: text)))
  }

  func page(_ rows: [HistoryRow], older: Bool = false, newer: Bool = false) -> HistoryPage {
    HistoryPage(session: "s", rows: rows, hasOlder: older, hasNewer: newer, evicted: false)
  }

  @Test func liveEventsWaitForSync() {
    var t = Transcript()
    let early = t.applyLive(delta(5, "a"))
    #expect(!early)
    t.apply(page([text(4, "x", block: "a")]), direction: .newest)
    #expect(t.synced)
    let live = t.applyLive(delta(5, "a"))
    let repeated = t.applyLive(delta(5, "a"))
    let stale = t.applyLive(delta(3, "old"))
    #expect(live && !repeated && !stale)
    #expect(t.rows.map(\.entry) == [4, 5])
  }

  @Test func finalTextReplacesDeltas() {
    var t = Transcript()
    t.apply(page([]), direction: .newest)
    t.applyLive(delta(1, "He"))
    t.applyLive(delta(2, "llo"))
    t.applyLive(delta(3, "other", block: "c"))
    t.applyLive(text(4, "Hello"))
    #expect(t.rows.map(\.entry) == [3, 4])
  }

  @Test func pagesMergeInOrderWithoutDuplicates() {
    var t = Transcript()
    t.apply(page([text(10, "j"), text(12, "k")], older: true), direction: .newest)
    t.apply(page([text(8, "h"), text(10, "j")], older: false), direction: .older)
    #expect(t.rows.map(\.entry) == [8, 10, 12])
    #expect(!t.hasOlder)
  }

  @Test func newerPagingSyncsAtTheEnd() {
    var t = Transcript(rows: [text(1, "a")], hasOlder: false, evicted: false)
    t.apply(page([text(2, "b")], newer: true), direction: .newer)
    #expect(!t.synced)
    t.apply(page([text(3, "c")]), direction: .newer)
    #expect(t.synced)
    #expect(t.lastEntry == 3)
  }

  @Test func trimKeepsNewest() {
    var t = Transcript(rows: (1...10).map { text($0, "\($0)", block: "\($0)") }, hasOlder: false, evicted: false)
    t.trim(keeping: 3)
    #expect(t.rows.map(\.entry) == [8, 9, 10])
    #expect(t.hasOlder)
  }
}
