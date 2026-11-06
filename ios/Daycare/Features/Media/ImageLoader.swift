// Fetches media images over HTTPS, downsampled and cached.

import Foundation
import ImageIO
import UIKit

actor ImageLoader {
  static let shared = ImageLoader()

  private let cache = NSCache<NSString, UIImage>()
  private let session: URLSession = {
    let config = URLSessionConfiguration.default
    config.urlCache = URLCache(memoryCapacity: 32 << 20, diskCapacity: 512 << 20)
    return URLSession(configuration: config)
  }()

  // Version changes when the file's size or mtime does
  func image(_ request: URLRequest, version: String, maxPixels: CGFloat) async throws -> UIImage {
    let key = "\(request.url?.absoluteString ?? "")#\(version)#\(Int(maxPixels))" as NSString
    if let cached = cache.object(forKey: key) {
      return cached
    }
    let (data, response) = try await session.data(for: request)
    guard (response as? HTTPURLResponse)?.statusCode ?? 0 < 300, let image = ImageLoader.downsample(data, maxPixels) else {
      throw URLError(.cannotDecodeContentData)
    }
    cache.setObject(image, forKey: key)
    return image
  }

  // Whole file to a temp URL, for sharing
  func download(_ request: URLRequest, name: String) async throws -> URL {
    let (temp, _) = try await session.download(for: request)
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let target = folder.appendingPathComponent(name)
    try FileManager.default.moveItem(at: temp, to: target)
    return target
  }

  static func downsample(_ data: Data, _ maxPixels: CGFloat) -> UIImage? {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil) else {
      return nil
    }
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceShouldCacheImmediately: true,
      kCGImageSourceThumbnailMaxPixelSize: maxPixels,
    ]
    guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
      return nil
    }
    return UIImage(cgImage: image)
  }
}
