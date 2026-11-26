// Display items: streamed text joined, tools paired, approvals resolved.

import Testing
import DaycareKit

@Suite struct TranscriptItemsTests {
  @Test func deltasJoinIntoOneStreamingItem() {
    let items = TranscriptItems.build([
      HistoryRow(entry: 1, event: .textDelta(TextEvent(block: "b", text: "He"))),
      HistoryRow(entry: 2, event: .textDelta(TextEvent(block: "b", text: "llo"))),
    ])
    #expect(items.count == 1)
    #expect(items[0].content == .assistant(text: "Hello", streaming: true))
    #expect(items[0].entries == [1, 2])
  }

  @Test func toolStartAndEndPair() {
    let start = ToolStartEvent(toolUseId: "t", name: "Bash", title: "ls", input: .null, parentToolUseId: nil)
    let end = ToolEndEvent(toolUseId: "t", isError: false, content: "ok", structured: nil)
    let items = TranscriptItems.build([
      HistoryRow(entry: 1, event: .toolStart(start)),
      HistoryRow(entry: 2, event: .state(StateEvent(state: .running))),
      HistoryRow(entry: 3, event: .toolEnd(end)),
    ])
    #expect(items.count == 1)
    #expect(items[0].content == .tool(ToolCall(start: start, end: end)))
  }

  @Test func userFileRefsAreSplit() {
    let user = UserEvent(text: "Attached file: /tmp/a.png\nLook", images: [], omittedImages: 0, files: [])
    let items = TranscriptItems.build([HistoryRow(entry: 1, event: .user(user))])
    guard case .user(_, let refs) = items[0].content else {
      Issue.record("Expected user item")
      return
    }
    #expect(refs.files == ["/tmp/a.png"])
    #expect(refs.text == "Look")
  }
}

@Suite struct MarkdownBlocksTests {
  @Test func splitsFencedCode() {
    let blocks = MarkdownBlocks.split("Run this:\n```bash\nnpm test\n```\nDone")
    #expect(blocks == [.prose("Run this:"), .code(language: "bash", body: "npm test"), .prose("Done")])
  }

  @Test func unclosedFenceStaysCode() {
    #expect(MarkdownBlocks.split("```\nstreaming") == [.code(language: "", body: "streaming")])
  }
}
