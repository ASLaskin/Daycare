// Every server frame decodes into the expected case.

import Foundation
import Testing
import DaycareKit

@Suite struct ServerMessageTests {
  @Test(arguments: Fixture.names(in: "server"))
  func decodesAndRoundTrips(name: String) throws {
    let message = try WireCodec.decodeServer(try Fixture.data(name))
    let again = try WireCodec.decodeServer(try JSONEncoder().encode(message))
    #expect(again == message)
  }

  @Test func welcome() throws {
    guard case .welcome(let welcome) = try WireCodec.decodeServer(Fixture.data("server/welcome")) else {
      Issue.record("Expected welcome")
      return
    }
    #expect(welcome.protocol == 1)
    #expect(welcome.epoch == "ep-1")
    #expect(welcome.resumed == false)
  }

  @Test func snapshot() throws {
    guard case .snapshot(let snapshot) = try WireCodec.decodeServer(Fixture.data("server/snapshot")) else {
      Issue.record("Expected snapshot")
      return
    }
    #expect(snapshot.seq == 4182)
    #expect(snapshot.sessions.map(\.id) == ["s-master", "s-worker"])
    #expect(snapshot.sessions[1].parentId == "s-master")
    #expect(snapshot.sessions[1].configDir == "/Users/me/.claude-work")
    #expect(snapshot.approvals.first?.permission?.title == "Run npm test")
    #expect(snapshot.power.battery?.minutesRemaining == 185)
    #expect(snapshot.power.lidClosed == LidClosed(enabled: false, active: false))
    #expect(snapshot.catalog?.models.map(\.id) == ["opus", "sonnet"])
    #expect(snapshot.unavailable == ["codex"])
  }

  @Test func emptySnapshotHasNulls() throws {
    guard case .snapshot(let snapshot) = try WireCodec.decodeServer(Fixture.data("server/snapshot-empty")) else {
      Issue.record("Expected snapshot")
      return
    }
    #expect(snapshot.catalog == nil)
    #expect(snapshot.power.battery == nil)
    #expect(snapshot.power.lidClosed == nil)
  }

  private func event(_ name: String) throws -> MobileEvent {
    guard case .event(let frame) = try WireCodec.decodeServer(Fixture.data("server/event-\(name)")) else {
      throw CocoaError(.coderInvalidValue)
    }
    return frame.event
  }

  @Test func sessionAndRemovedEvents() throws {
    guard case .session(let session) = try event("session") else {
      throw CocoaError(.coderInvalidValue)
    }
    #expect(session.preview == "Looking at the tests now")
    guard case .removed(let removed) = try event("removed") else {
      throw CocoaError(.coderInvalidValue)
    }
    #expect(removed.parentId == "s-master")
  }

  @Test func approvalEvents() throws {
    guard case .approval(let approval) = try event("approval") else {
      throw CocoaError(.coderInvalidValue)
    }
    #expect(approval.choices.count == 3)
    guard case .approvalResolved(let resolved) = try event("approval-resolved") else {
      throw CocoaError(.coderInvalidValue)
    }
    #expect(resolved.allowed)
  }

  @Test func chatPowerCatalogMediaEvents() throws {
    guard case .chat(let chat) = try event("chat") else {
      throw CocoaError(.coderInvalidValue)
    }
    #expect(chat.entry == 42)
    guard case .power(let power) = try event("power") else {
      throw CocoaError(.coderInvalidValue)
    }
    #expect(power.mode == .whileRunning)
    guard case .catalog(let catalog) = try event("catalog") else {
      throw CocoaError(.coderInvalidValue)
    }
    #expect(catalog.permissionMode == .acceptEdits)
    guard case .media(let media) = try event("media") else {
      throw CocoaError(.coderInvalidValue)
    }
    #expect(media.items.first?.kind == .video)
  }

  @Test func responses() throws {
    guard case .response(let ok) = try WireCodec.decodeServer(Fixture.data("server/response-ok")) else {
      Issue.record("Expected response")
      return
    }
    guard case .success(let result, let replayed) = ok.outcome else {
      Issue.record("Expected success")
      return
    }
    #expect(replayed)
    #expect(try result.decode(SendResult.self).entry == 43)

    guard case .response(let failed) = try WireCodec.decodeServer(Fixture.data("server/response-error")) else {
      Issue.record("Expected response")
      return
    }
    #expect(failed.outcome == .failure(GatewayError(code: .rejected, message: "Session closed")))
  }

  @Test func mismatchAndError() throws {
    #expect(try WireCodec.decodeServer(Fixture.data("server/protocol-mismatch")) == .protocolMismatch(ProtocolMismatch(server: 2, client: 1)))
    guard case .error(let error) = try WireCodec.decodeServer(Fixture.data("server/error")) else {
      Issue.record("Expected error")
      return
    }
    #expect(error.error.code == .unauthorized)
  }
}
