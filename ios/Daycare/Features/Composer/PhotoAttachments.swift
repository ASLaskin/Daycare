// Photos picked for the next message, already downscaled.

import PhotosUI
import SwiftUI

struct PickedPhoto: Identifiable {
  let id = UUID()
  let data: Data
  let preview: UIImage?
}

@MainActor
@Observable
final class PhotoAttachments {
  var photos: [PickedPhoto] = []
  var selection: [PhotosPickerItem] = [] {
    didSet { importSelection() }
  }
  private(set) var importing = false
  var error: String?

  static let limit = 8

  var outgoing: [OutgoingPhoto] {
    photos.enumerated().map { index, photo in
      OutgoingPhoto(name: "photo-\(index + 1).jpg", data: photo.data)
    }
  }

  func add(_ raw: Data) {
    guard let jpeg = ImagePrep.jpeg(raw) else {
      error = "Could not read that photo"
      return
    }
    guard photos.count < PhotoAttachments.limit else {
      error = "Up to \(PhotoAttachments.limit) photos per message"
      return
    }
    photos.append(PickedPhoto(data: jpeg, preview: UIImage(data: jpeg)))
  }

  func remove(_ photo: PickedPhoto) {
    photos.removeAll { $0.id == photo.id }
  }

  func clear() {
    photos = []
    error = nil
  }

  private func importSelection() {
    let items = selection
    guard !items.isEmpty else {
      return
    }
    selection = []
    importing = true
    Task {
      for item in items {
        guard let data = try? await item.loadTransferable(type: Data.self) else {
          error = "Could not load a photo"
          continue
        }
        add(data)
      }
      importing = false
    }
  }
}

struct PhotoTray: View {
  let attachments: PhotoAttachments

  var body: some View {
    if !attachments.photos.isEmpty {
      ScrollView(.horizontal) {
        HStack(spacing: 8) {
          ForEach(attachments.photos) { photo in
            VStack(spacing: 2) {
              if let preview = photo.preview {
                Image(uiImage: preview)
                  .resizable()
                  .scaledToFill()
                  .frame(width: 64, height: 64)
                  .clipShape(RoundedRectangle(cornerRadius: 8))
              }
              Button("Remove") {
                attachments.remove(photo)
              }
              .font(.caption2)
            }
          }
        }
        .padding(.horizontal)
      }
    }
  }
}
