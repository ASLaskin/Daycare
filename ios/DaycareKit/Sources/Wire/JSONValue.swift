// Arbitrary JSON, for Schema.Json fields.

import Foundation

public enum JSONValue: Codable, Hashable, Sendable {
  case null
  case bool(Bool)
  case number(Double)
  case string(String)
  case array([JSONValue])
  case object([String: JSONValue])

  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if container.decodeNil() {
      self = .null
      return
    }
    if let value = try? container.decode(Bool.self) {
      self = .bool(value)
      return
    }
    if let value = try? container.decode(Double.self) {
      self = .number(value)
      return
    }
    if let value = try? container.decode(String.self) {
      self = .string(value)
      return
    }
    if let value = try? container.decode([JSONValue].self) {
      self = .array(value)
      return
    }
    self = .object(try container.decode([String: JSONValue].self))
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .null:
      try container.encodeNil()
    case .bool(let value):
      try container.encode(value)
    case .number(let value):
      try container.encode(value)
    case .string(let value):
      try container.encode(value)
    case .array(let value):
      try container.encode(value)
    case .object(let value):
      try container.encode(value)
    }
  }

  public subscript(key: String) -> JSONValue? {
    guard case .object(let fields) = self else {
      return nil
    }
    return fields[key]
  }

  public var stringValue: String? {
    guard case .string(let value) = self else {
      return nil
    }
    return value
  }

  // Every string anywhere inside, depth first
  public var allStrings: [String] {
    switch self {
    case .string(let value):
      return [value]
    case .array(let values):
      return values.flatMap(\.allStrings)
    case .object(let fields):
      return fields.keys.sorted().flatMap { fields[$0]?.allStrings ?? [] }
    case .null, .bool, .number:
      return []
    }
  }

  // Re-decodes this value as a concrete type
  public func decode<T: Decodable>(_ type: T.Type) throws -> T {
    let data = try JSONEncoder().encode(self)
    return try JSONDecoder().decode(type, from: data)
  }

  public func pretty() -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    guard let data = try? encoder.encode(self) else {
      return ""
    }
    return String(decoding: data, as: UTF8.self)
  }
}
