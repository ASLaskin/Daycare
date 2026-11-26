// Pinch to zoom, drag to pan, double tap to toggle zoom.

import SwiftUI

struct ZoomableImage: View {
  let image: UIImage

  @State private var scale: CGFloat = 1
  @State private var settledScale: CGFloat = 1
  @State private var offset: CGSize = .zero
  @State private var settledOffset: CGSize = .zero

  var body: some View {
    Image(uiImage: image)
      .resizable()
      .scaledToFit()
      .scaleEffect(scale)
      .offset(offset)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .contentShape(Rectangle())
      .gesture(magnify.simultaneously(with: pan))
      .onTapGesture(count: 2) {
        withAnimation(.spring(duration: 0.25)) {
          scale = scale > 1 ? 1 : 2.5
          settledScale = scale
          offset = .zero
          settledOffset = .zero
        }
      }
  }

  private var magnify: some Gesture {
    MagnifyGesture()
      .onChanged { value in
        scale = max(1, min(8, settledScale * value.magnification))
      }
      .onEnded { _ in
        settledScale = scale
        guard scale == 1 else {
          return
        }
        withAnimation {
          offset = .zero
          settledOffset = .zero
        }
      }
  }

  private var pan: some Gesture {
    DragGesture()
      .onChanged { value in
        guard scale > 1 else {
          return
        }
        offset = CGSize(
          width: settledOffset.width + value.translation.width,
          height: settledOffset.height + value.translation.height
        )
      }
      .onEnded { _ in
        settledOffset = offset
      }
  }
}
