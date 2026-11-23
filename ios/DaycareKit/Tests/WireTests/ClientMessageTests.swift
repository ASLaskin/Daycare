// Client frames decode, and re-encode to the same JSON the TS schema accepted.

import Foundation
import Testing
import DaycareKit

@Suite struct ClientMessageTests {
  @Test(arguments: Fixture.names(in: "client"))
  func encodesLikeFixture(name: String) throws {
    let data = try Fixture.data(name)
    let message = try JSONDecoder().decode(ClientMessage.self, from: data)
    let encoded = try WireCodec.encoder().encode(message)
    #expect(try Fixture.object(encoded) == Fixture.object(data))
  }

  @Test func fixturesCoverEveryMethod() throws {
    let methods = try Fixture.names(in: "client").compactMap { name -> String? in
      guard case .request(let request) = try Fixture.decode(ClientMessage.self, name) else {
        return nil
      }
      return request.command.method
    }
    let expected: Set<String> = [
      "watch", "history", "create", "send", "upload", "interrupt", "answer", "close", "reopen", "archive", "unarchive",
      "rename", "remove", "move", "model", "effort", "configure", "power", "media", "register", "unregister", "activity",
      "activity-ended",
    ]
    #expect(Set(methods) == expected)
  }

  @Test func nullableFieldsAreExplicit() throws {
    let create = MobileCommand.create(
      CreateSession(provider: .claude, cwd: "/x", prompt: "p", name: nil, model: nil, effort: nil, permissionMode: .default, accountId: nil, files: [])
    )
    let json = String(decoding: try WireCodec.encoder().encode(create), as: UTF8.self)
    #expect(json.contains(#""model":null"#))
    #expect(json.contains(#""effort":null"#))
    #expect(!json.contains("accountId"))
    #expect(!json.contains(#""name""#))
  }
}
