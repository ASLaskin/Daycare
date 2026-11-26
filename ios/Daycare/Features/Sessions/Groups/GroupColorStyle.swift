// Desktop group colors and their names.

import DaycareKit
import SwiftUI

extension GroupColor {
  var color: Color {
    switch self {
    case .blue: Color(red: 0x7A / 255, green: 0xA2 / 255, blue: 0xFF / 255)
    case .green: Color(red: 0x5F / 255, green: 0xD3 / 255, blue: 0x9A / 255)
    case .amber: Color(red: 0xF2 / 255, green: 0xB8 / 255, blue: 0x4B / 255)
    case .rose: Color(red: 0xF0 / 255, green: 0x7A / 255, blue: 0x9A / 255)
    case .violet: Color(red: 0xB4 / 255, green: 0x8C / 255, blue: 0xFF / 255)
    case .teal: Color(red: 0x4F / 255, green: 0xC8 / 255, blue: 0xD0 / 255)
    }
  }

  var label: String { rawValue.capitalized }
}
