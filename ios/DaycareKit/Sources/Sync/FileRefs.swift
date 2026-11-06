// Splits "Attached file: <path>" lines from user text, like fileRefText.

import Foundation

public struct FileRefs: Hashable, Sendable {
  public var files: [FilePath]
  public var text: String

  static let prefix = "Attached file: "

  public static func split(_ text: String) -> FileRefs {
    let lines = text.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
    let files = lines.compactMap(path(of:))
    let rest = lines.filter { path(of: $0) == nil }
    return FileRefs(files: files, text: rest.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines))
  }

  static func path(of line: String) -> FilePath? {
    guard line.hasPrefix(prefix) else {
      return nil
    }
    let rest = String(line.dropFirst(prefix.count))
    return rest.hasPrefix("/") ? FilePath(rest) : nil
  }

  public static func fileName(_ path: FilePath) -> String {
    path.rawValue.split(separator: "/").last.map(String.init) ?? path.rawValue
  }
}
