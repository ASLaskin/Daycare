// Button labels for approval choices, mapped like view.ts pick.

public enum ChoiceLabel {
  public enum Tone: Sendable {
    case allow
    case always
    case refuse
    case other
  }

  private static let labels: [String: (String, Tone)] = [
    "allow": ("Allow", .allow),
    "accept": ("Accept", .allow),
    "always": ("Always allow", .always),
    "acceptForSession": ("Allow for session", .always),
    "deny": ("Deny", .refuse),
    "decline": ("Decline", .refuse),
    "cancel": ("Cancel", .refuse),
  ]

  public static func label(_ choice: String) -> String {
    labels[choice]?.0 ?? choice
  }

  public static func tone(_ choice: String) -> Tone {
    labels[choice]?.1 ?? .other
  }

  // Allow first, refuse last, others in offered order
  public static func ordered(_ choices: [String]) -> [String] {
    let rank: (String) -> Int = { choice in
      switch tone(choice) {
      case .allow: 0
      case .always: 1
      case .other: 2
      case .refuse: 3
      }
    }
    return choices.enumerated()
      .sorted { (rank($0.element), $0.offset) < (rank($1.element), $1.offset) }
      .map(\.element)
  }
}
