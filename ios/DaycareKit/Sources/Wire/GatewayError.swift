// Coded gateway failures.

// unavailable: retry later; rejected: the hub refused, do not retry
public enum ErrorCode: String, Codable, Hashable, Sendable {
  case badRequest = "bad_request"
  case unauthorized
  case rejected
  case unavailable
  case tooLarge = "too_large"
  case `internal`
}

public struct GatewayError: Codable, Hashable, Sendable, Error {
  public var code: ErrorCode
  public var message: String

  public init(code: ErrorCode, message: String) {
    self.code = code
    self.message = message
  }
}
