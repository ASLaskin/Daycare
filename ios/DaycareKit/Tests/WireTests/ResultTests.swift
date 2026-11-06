// Command results and push payloads decode.

import Foundation
import Testing
import DaycareKit

@Suite struct ResultTests {
  @Test func historyPage() throws {
    let page = try Fixture.decode(HistoryPage.self, "result/history-page")
    #expect(page.rows.map(\.entry) == [1, 3])
    #expect(page.hasOlder && !page.hasNewer && page.evicted)
  }

  @Test func simpleResults() throws {
    #expect(try Fixture.decode(CreateResult.self, "result/create-result").session == "s-new")
    #expect(try Fixture.decode(SendResult.self, "result/send-result").entry == 43)
    #expect(try Fixture.decode(UploadResult.self, "result/upload-result").path.rawValue.hasSuffix("photo.jpg"))
  }

  @Test func mediaList() throws {
    let list = try Fixture.decode(MediaList.self, "result/media-list")
    #expect(list.items.map(\.kind) == [.video, .image, .audio])
    #expect(list.items[0].size == 4812000)
    #expect(list.items[2].entry == nil)
  }

  @Test func pushData() throws {
    let data = try Fixture.decode(PushData.self, "result/push-data")
    #expect(data == PushData(kind: .approval, session: "s-master", request: "req-1"))
  }

  @Test func activityState() throws {
    let state = try Fixture.decode(ActivityState.self, "result/activity-state")
    #expect(state.running.first?.master == "Ada")
    #expect(state.updatedAt == 1762300060.5)
  }
}
