// Pairing link and device id kept in the Keychain.

import DaycareKit
import Foundation

enum Credentials {
  private static let pairingAccount = "pairing"
  private static let deviceAccount = "device"

  static func loadPairing() -> PairingLink? {
    Keychain.read(pairingAccount).flatMap { try? JSONDecoder().decode(PairingLink.self, from: $0) }
  }

  static func savePairing(_ link: PairingLink) {
    guard let data = try? JSONEncoder().encode(link) else {
      return
    }
    Keychain.write(data, account: pairingAccount)
  }

  static func clearPairing() {
    Keychain.delete(pairingAccount)
  }

  // Minted once per install
  static func device() -> DeviceId {
    if let data = Keychain.read(deviceAccount), let id = String(data: data, encoding: .utf8) {
      return DeviceId(id)
    }
    let id = UUID().uuidString
    Keychain.write(Data(id.utf8), account: deviceAccount)
    return DeviceId(id)
  }
}
