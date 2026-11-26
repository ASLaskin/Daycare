// Worker, Master, or Chat label for a session.

extension MobileSession {
  public var kindLabel: String {
    guard role == .master else {
      return "Worker"
    }
    return masterMode ? "Master" : "Chat"
  }
}
