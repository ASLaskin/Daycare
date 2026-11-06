// Live camera QR scanner using VisionKit.

import SwiftUI
import VisionKit

struct QRScannerView: UIViewControllerRepresentable {
  let onCode: (String) -> Void

  static var isAvailable: Bool {
    DataScannerViewController.isSupported && DataScannerViewController.isAvailable
  }

  func makeUIViewController(context: Context) -> DataScannerViewController {
    let scanner = DataScannerViewController(
      recognizedDataTypes: [.barcode(symbologies: [.qr])],
      qualityLevel: .balanced,
      recognizesMultipleItems: false,
      isHighFrameRateTrackingEnabled: false,
      isHighlightingEnabled: true
    )
    scanner.delegate = context.coordinator
    try? scanner.startScanning()
    return scanner
  }

  func updateUIViewController(_ scanner: DataScannerViewController, context: Context) {}

  static func dismantleUIViewController(_ scanner: DataScannerViewController, coordinator: Coordinator) {
    scanner.stopScanning()
  }

  func makeCoordinator() -> Coordinator {
    Coordinator(onCode: onCode)
  }

  @MainActor
  final class Coordinator: NSObject, DataScannerViewControllerDelegate {
    let onCode: (String) -> Void

    init(onCode: @escaping (String) -> Void) {
      self.onCode = onCode
    }

    func dataScanner(_ scanner: DataScannerViewController, didAdd items: [RecognizedItem], allItems: [RecognizedItem]) {
      let payloads = items.compactMap { item -> String? in
        guard case .barcode(let code) = item else {
          return nil
        }
        return code.payloadStringValue
      }
      payloads.first.map(onCode)
    }
  }
}
