// One pending approval: what is asked, offered choices as buttons, optional note.

import DaycareKit
import SwiftUI

struct ApprovalCard: View {
  let approval: Approval
  let showsSession: Bool

  @Environment(AppModel.self) private var model
  @Environment(SessionStore.self) private var store
  @State private var note = ""
  @State private var addingNote = false
  @State private var showingInput = false
  @State private var answered: String?

  private var permission: PermissionEvent? { approval.permission }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      if showsSession, let session = store.sessions[approval.session] {
        Text(session.name)
          .font(.caption.weight(.semibold))
          .foregroundStyle(.secondary)
      }
      Text(title)
        .font(.headline)
      if let description = permission?.description, !description.isEmpty {
        Text(description)
          .font(.subheadline)
          .foregroundStyle(.secondary)
      }
      summary
      if addingNote {
        TextField("Note for the agent", text: $note, axis: .vertical)
          .textFieldStyle(.roundedBorder)
      }
      choices
      HStack {
        Button(showingInput ? "Hide details" : "Details") {
          showingInput.toggle()
        }
        Button(addingNote ? "No note" : "Add note") {
          addingNote.toggle()
        }
      }
      .font(.caption)
      if showingInput, let input = permission?.input {
        ScrollView(.horizontal) {
          Text(input.pretty())
            .font(.caption.monospaced())
            .textSelection(.enabled)
        }
      }
    }
    .padding(14)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 14))
  }

  private var title: String {
    guard let permission else {
      return "Approval"
    }
    return permission.title.isEmpty ? permission.name : permission.title
  }

  @ViewBuilder
  private var summary: some View {
    if let summaryText {
      Text(summaryText)
        .font(.callout.monospaced())
        .lineLimit(6)
        .textSelection(.enabled)
    }
  }

  // Bash command or file path, the part worth reading first
  private var summaryText: String? {
    let input = permission?.input
    return input?["command"]?.stringValue ?? input?["file_path"]?.stringValue ?? input?["path"]?.stringValue
  }

  private var choices: some View {
    let ordered = ChoiceLabel.ordered(approval.choices)
    return ViewThatFits(in: .horizontal) {
      HStack {
        ForEach(ordered, id: \.self, content: choiceButton)
      }
      VStack(alignment: .leading) {
        ForEach(ordered, id: \.self, content: choiceButton)
      }
    }
  }

  private func choiceButton(_ choice: String) -> some View {
    Button(ChoiceLabel.label(choice)) {
      answer(choice)
    }
    .buttonStyle(.borderedProminent)
    .tint(tint(choice))
    .disabled(answered != nil)
  }

  private func tint(_ choice: String) -> Color {
    switch ChoiceLabel.tone(choice) {
    case .allow: .green
    case .always: .teal
    case .refuse: .red
    case .other: .accentColor
    }
  }

  private func answer(_ choice: String) {
    answered = choice
    let message = note.trimmingCharacters(in: .whitespacesAndNewlines)
    model.send(.answer(Answer(
      session: approval.session,
      request: approval.request,
      choice: choice,
      message: message.isEmpty ? nil : message
    )))
  }
}
