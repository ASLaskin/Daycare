// Every ChatEvent kind decodes and round trips.

import Foundation
import Testing
import DaycareKit

@Suite struct ChatEventTests {
  @Test(arguments: Fixture.names(in: "chat"))
  func decodesAndRoundTrips(name: String) throws {
    let data = try Fixture.data(name)
    let event = try JSONDecoder().decode(ChatEvent.self, from: data)
    #expect(event.kind != "")
    if case .unknown(let kind) = event {
      Issue.record("Unknown kind \(kind)")
    }
    let again = try JSONDecoder().decode(ChatEvent.self, from: JSONEncoder().encode(event))
    #expect(again == event)
  }

  @Test func fixturesCoverEveryKind() {
    let kinds = Set(Fixture.names(in: "chat").map { $0.replacingOccurrences(of: "chat/", with: "") })
    let expected: Set<String> = [
      "ready", "state", "text-delta", "text", "thinking", "tool-start", "tool-end", "task", "turn-end", "permission",
      "permission-resolved", "user", "rate-limit", "error", "interrupted", "notice", "exit", "history-evicted", "oversized",
    ]
    #expect(expected.isSubset(of: kinds))
  }

  @Test func userFilesDefaultToEmpty() throws {
    let event = try Fixture.decode(ChatEvent.self, "chat/user-legacy")
    guard case .user(let user) = event else {
      Issue.record("Expected user event")
      return
    }
    #expect(user.files == [])
    #expect(user.omittedImages == 1)
  }

  @Test func permissionCarriesChoices() throws {
    let event = try Fixture.decode(ChatEvent.self, "chat/permission")
    guard case .permission(let permission) = event else {
      Issue.record("Expected permission event")
      return
    }
    #expect(permission.choices == ["allow", "always", "deny"])
    #expect(permission.input["command"]?.stringValue == "npm test")
  }

  @Test func unknownKindIsKept() throws {
    let event = try JSONDecoder().decode(ChatEvent.self, from: Data(#"{"kind":"future","x":1}"#.utf8))
    #expect(event == .unknown("future"))
  }
}
