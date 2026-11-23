// Authorized media requests and player assets for one paired Mac.

import AVFoundation
import DaycareKit
import Foundation

struct MediaEndpoint: Sendable {
  let link: PairingLink

  init(_ link: PairingLink) {
    self.link = link
  }

  func url(_ session: SessionId, _ path: FilePath) -> URL? {
    MediaRoute.url(host: link.host, port: link.port, session: session, path: path)
  }

  func request(_ session: SessionId, _ path: FilePath) -> URLRequest? {
    guard let url = url(session, path) else {
      return nil
    }
    var request = URLRequest(url: url)
    MediaRoute.headers(token: link.token).forEach { request.setValue($1, forHTTPHeaderField: $0) }
    return request
  }

  // AVPlayer streams with Range requests; headers ride on the asset
  func asset(_ session: SessionId, _ path: FilePath) -> AVURLAsset? {
    guard let url = url(session, path) else {
      return nil
    }
    return AVURLAsset(url: url, options: ["AVURLAssetHTTPHeaderFieldsKey": MediaRoute.headers(token: link.token)])
  }
}
