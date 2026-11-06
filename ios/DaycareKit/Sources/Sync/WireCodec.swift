// Shared JSON coders for gateway frames.

import Foundation

public enum WireCodec {
  public static func encoder() -> JSONEncoder {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.withoutEscapingSlashes]
    return encoder
  }

  public static func decoder() -> JSONDecoder {
    JSONDecoder()
  }

  public static func encode(_ message: ClientMessage) throws -> String {
    String(decoding: try encoder().encode(message), as: UTF8.self)
  }

  public static func decodeServer(_ data: Data) throws -> ServerMessage {
    try decoder().decode(ServerMessage.self, from: data)
  }
}
