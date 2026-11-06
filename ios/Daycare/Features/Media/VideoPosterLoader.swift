// First frame and duration of a streamed video, cached.

import AVFoundation
import UIKit

struct VideoPoster: Sendable {
  var image: UIImage?
  var duration: Double?
}

actor VideoPosterLoader {
  static let shared = VideoPosterLoader()
  private var cache: [String: VideoPoster] = [:]

  func poster(_ asset: AVURLAsset, version: String) async -> VideoPoster {
    let key = "\(asset.url.absoluteString)#\(version)"
    if let cached = cache[key] {
      return cached
    }
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.maximumSize = CGSize(width: 800, height: 800)
    let frame = try? await generator.image(at: CMTime(seconds: 0.1, preferredTimescale: 600)).image
    let duration = try? await asset.load(.duration).seconds
    let poster = VideoPoster(image: frame.map { UIImage(cgImage: $0) }, duration: duration)
    cache[key] = poster
    return poster
  }
}
