// Assistant prose with inline markdown and fenced code blocks.

import DaycareKit
import SwiftUI

struct AssistantText: View {
  let text: String
  let streaming: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      ForEach(Array(MarkdownBlocks.split(text).enumerated()), id: \.offset) { _, block in
        switch block {
        case .prose(let prose):
          Text(AssistantText.markdown(prose))
            .textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .leading)
        case .code(_, let body):
          ScrollView(.horizontal) {
            Text(body)
              .font(.footnote.monospaced())
              .textSelection(.enabled)
              .padding(10)
          }
          .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 8))
        }
      }
    }
    .opacity(streaming ? 0.85 : 1)
  }

  static func markdown(_ text: String) -> AttributedString {
    let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
    return (try? AttributedString(markdown: text, options: options)) ?? AttributedString(text)
  }
}
