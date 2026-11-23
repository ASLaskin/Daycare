// Discriminator key helpers for tagged unions.

struct DiscriminatorKey: CodingKey {
  let stringValue: String
  let intValue: Int? = nil

  init(stringValue: String) {
    self.stringValue = stringValue
  }

  init?(intValue: Int) {
    return nil
  }

  static let kind = DiscriminatorKey(stringValue: "kind")
  static let method = DiscriminatorKey(stringValue: "method")
  static let type = DiscriminatorKey(stringValue: "type")
}

extension Decoder {
  func discriminator(_ key: DiscriminatorKey) throws -> String {
    try container(keyedBy: DiscriminatorKey.self).decode(String.self, forKey: key)
  }

  func hasKey(_ name: String) throws -> Bool {
    try container(keyedBy: DiscriminatorKey.self).contains(DiscriminatorKey(stringValue: name))
  }
}

extension Encoder {
  func encode(discriminator key: DiscriminatorKey, _ value: String, payload: (any Encodable)?) throws {
    try payload?.encode(to: self)
    var container = container(keyedBy: DiscriminatorKey.self)
    try container.encode(value, forKey: key)
  }
}
