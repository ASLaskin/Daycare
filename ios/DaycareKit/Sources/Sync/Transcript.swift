// One session's history rows, ordered and unique by entry.

public struct Transcript: Codable, Hashable, Sendable {
  public private(set) var rows: [HistoryRow] = []
  public var hasOlder = false
  public var evicted = false
  // Caught up with the coordinator; live events apply only then
  public var synced = false

  public init() {}

  public init(rows: [HistoryRow], hasOlder: Bool, evicted: Bool) {
    self.rows = Transcript.normalized(rows)
    self.hasOlder = hasOlder
    self.evicted = evicted
  }

  public var firstEntry: Entry? { rows.first?.entry }
  public var lastEntry: Entry? { rows.last?.entry }

  public enum Direction: Sendable {
    // No cursor: replaces everything
    case newest
    case older
    case newer
  }

  public mutating func apply(_ page: HistoryPage, direction: Direction) {
    switch direction {
    case .newest:
      rows = Transcript.normalized(page.rows)
      hasOlder = page.hasOlder
      evicted = page.evicted
      synced = !page.hasNewer
    case .older:
      rows = Transcript.normalized(page.rows + rows)
      hasOlder = page.hasOlder
      evicted = page.evicted
    case .newer:
      rows = Transcript.normalized(rows + page.rows)
      synced = !page.hasNewer
    }
  }

  // Live chat event; false when dropped
  @discardableResult
  public mutating func applyLive(_ row: HistoryRow) -> Bool {
    guard synced, row.entry > (lastEntry ?? Int.min) else {
      return false
    }
    if case .text(let text) = row.event {
      rows.removeAll { Transcript.isDelta($0.event, of: text.block) }
    }
    rows.append(row)
    return true
  }

  // Drops all but the newest rows to bound the cache
  public mutating func trim(keeping count: Int) {
    guard rows.count > count else {
      return
    }
    rows.removeFirst(rows.count - count)
    hasOlder = true
  }

  static func normalized(_ rows: [HistoryRow]) -> [HistoryRow] {
    let unique = Dictionary(rows.map { ($0.entry, $0) }, uniquingKeysWith: { _, newer in newer })
    let sorted = unique.values.sorted { $0.entry < $1.entry }
    let finalText = sorted.reduce(into: [String: Entry]()) { latest, row in
      if case .text(let text) = row.event {
        latest[text.block] = row.entry
      }
    }
    return sorted.filter { row in
      guard case .textDelta(let delta) = row.event, let replaced = finalText[delta.block] else {
        return true
      }
      return row.entry > replaced
    }
  }

  static func isDelta(_ event: ChatEvent, of block: String) -> Bool {
    guard case .textDelta(let delta) = event else {
      return false
    }
    return delta.block == block
  }
}
