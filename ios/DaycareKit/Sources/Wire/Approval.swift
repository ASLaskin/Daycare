// Pending permission prompt with its offered answers.

public struct Approval: Codable, Hashable, Sendable, Identifiable {
  public var session: SessionId
  public var request: RequestId
  public var choices: [String]
  public var event: ChatEvent

  public init(session: SessionId, request: RequestId, choices: [String], event: ChatEvent) {
    self.session = session
    self.request = request
    self.choices = choices
    self.event = event
  }

  public var id: RequestId { request }

  public var permission: PermissionEvent? {
    guard case .permission(let p) = event else {
      return nil
    }
    return p
  }
}
