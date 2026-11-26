// Pairing QR payload: daycare://pair?v=1&host=&port=&token=

import Foundation

public struct PairingLink: Codable, Hashable, Sendable {
  public var host: String
  public var port: Int
  public var token: PairingToken

  public init(host: String, port: Int, token: PairingToken) {
    self.host = host
    self.port = port
    self.token = token
  }

  public enum ParseError: Error, Equatable {
    case notPairingLink
    case unsupportedVersion(String)
    case missing(String)
  }

  public static let supportedVersion = "1"

  public static func parse(_ text: String) throws(ParseError) -> PairingLink {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let components = URLComponents(string: trimmed), components.scheme == "daycare", components.host == "pair" else {
      throw .notPairingLink
    }
    let query = Dictionary(
      (components.queryItems ?? []).map { ($0.name, $0.value ?? "") },
      uniquingKeysWith: { first, _ in first }
    )
    let version = query["v"] ?? ""
    guard version == supportedVersion else {
      throw .unsupportedVersion(version)
    }
    guard let host = query["host"], !host.isEmpty else {
      throw .missing("host")
    }
    guard let token = query["token"], !token.isEmpty else {
      throw .missing("token")
    }
    let port = query["port"].flatMap(Int.init) ?? WireProtocol.defaultPort
    return PairingLink(host: host, port: port, token: PairingToken(token))
  }

  public var socketURL: URL? {
    URL(string: "wss://\(host):\(port)/ws")
  }
}
