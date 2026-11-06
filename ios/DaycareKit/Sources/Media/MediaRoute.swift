// Gateway media URL and auth headers; the one place media URLs are built.

import Foundation

public enum MediaRoute {
  // mediaUrlPath in src/shared/mobile.ts: /media/<session>?path=<path>
  public static func url(host: String, port: Int, session: SessionId, path: FilePath) -> URL? {
    var components = URLComponents()
    components.scheme = "https"
    components.host = host
    components.port = port
    components.percentEncodedPath = "/media/" + encode(session.rawValue)
    components.percentEncodedQuery = "path=" + encode(path.rawValue)
    return components.url
  }

  public static func headers(token: PairingToken) -> [String: String] {
    ["Authorization": "Bearer \(token.rawValue)"]
  }

  // Matches encodeURIComponent
  static func encode(_ value: String) -> String {
    let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()")
    return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
  }
}
