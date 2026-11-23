// Human readable durations and sizes, never zero padded.

import Foundation

public enum Formatting {
  // 95 -> "1 h 35 min", 7 -> "7 min"
  public static func minutes(_ total: Int) -> String {
    let hours = total / 60
    let minutes = total % 60
    if hours == 0 {
      return "\(minutes) min"
    }
    return minutes == 0 ? "\(hours) h" : "\(hours) h \(minutes) min"
  }

  public static func bytes(_ count: Int) -> String {
    ByteCountFormatter.string(fromByteCount: Int64(count), countStyle: .file)
  }

  // 65 -> "1 min 5 s", 3725 -> "1 h 2 min", 40 -> "40 s"
  public static func duration(_ seconds: Double) -> String {
    guard seconds.isFinite, seconds >= 0 else {
      return ""
    }
    let total = Int(seconds.rounded())
    guard total >= 60 else {
      return "\(total) s"
    }
    guard total >= 3600 else {
      let s = total % 60
      return s == 0 ? "\(total / 60) min" : "\(total / 60) min \(s) s"
    }
    return minutes(total / 60)
  }

  // 1 -> "1 photo", 3 -> "3 photos"
  public static func count(_ n: Int, _ noun: String) -> String {
    n == 1 ? "1 \(noun)" : "\(n) \(noun)s"
  }

  public static func cost(_ usd: Double) -> String {
    String(format: "$%.2f", usd)
  }
}
