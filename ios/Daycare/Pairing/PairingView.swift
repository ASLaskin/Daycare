// First run: scan the QR from desktop Settings, or paste the link.

import DaycareKit
import SwiftUI

struct PairingView: View {
  @Environment(AppModel.self) private var model
  @State private var pasted = ""
  @State private var error: String?

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 20) {
          Text("On the Mac, open Daycare Settings, Phone, then scan the pairing code. Tailscale must be on for both devices.")
            .foregroundStyle(.secondary)
          scanner
          VStack(alignment: .leading, spacing: 8) {
            Text("Or paste the pairing link")
              .font(.headline)
            TextField("daycare://pair?…", text: $pasted, axis: .vertical)
              .textInputAutocapitalization(.never)
              .autocorrectionDisabled()
              .font(.callout.monospaced())
              .textFieldStyle(.roundedBorder)
            Button("Pair") {
              accept(pasted)
            }
            .buttonStyle(.borderedProminent)
            .disabled(pasted.isEmpty)
          }
          if let error {
            Text(error)
              .foregroundStyle(.red)
          }
        }
        .padding()
      }
      .navigationTitle("Pair with your Mac")
    }
  }

  @ViewBuilder
  private var scanner: some View {
    if QRScannerView.isAvailable {
      QRScannerView(onCode: accept)
        .aspectRatio(1, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    } else {
      Text("The camera scanner is not available on this device.")
        .frame(maxWidth: .infinity, minHeight: 120)
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 16))
    }
  }

  private func accept(_ text: String) {
    do throws(PairingLink.ParseError) {
      model.pair(try PairingLink.parse(text))
    } catch {
      self.error = message(for: error)
    }
  }

  private func message(for failure: PairingLink.ParseError) -> String {
    switch failure {
    case .notPairingLink:
      return "That is not a Daycare pairing code."
    case .unsupportedVersion(let version):
      return "This pairing code is version \(version). Update the phone app."
    case .missing(let field):
      return "The pairing code has no \(field)."
    }
  }
}
