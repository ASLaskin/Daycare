// Gateway protocol constants from src/shared/mobile.ts.

public enum WireProtocol {
  // Bumped on any breaking wire change
  public static let version = 1
  // Largest history page a client may ask for
  public static let maxPage = 200
  // Largest decoded upload in one frame
  public static let maxUploadBytes = 10 * 1024 * 1024
  public static let defaultPort = 7443
}

// WebSocket close codes
public enum CloseCode: Int, Sendable {
  case badHello = 4400
  case unauthorized = 4401
  case stalled = 4408
  case replaced = 4409
  case tooLarge = 4413
  case protocolMismatch = 4426
  case stopping = 4503
}
