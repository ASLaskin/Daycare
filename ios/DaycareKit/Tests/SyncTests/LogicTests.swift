// Pairing links, retry rules, media URLs, formatting.

import Foundation
import Testing
import DaycareKit

@Suite struct LogicTests {
  @Test func parsesPairingLink() throws {
    let link = try PairingLink.parse("daycare://pair?v=1&host=mac.tail1234.ts.net&port=7443&token=abc_-1")
    #expect(link == PairingLink(host: "mac.tail1234.ts.net", port: 7443, token: "abc_-1"))
    #expect(link.socketURL?.absoluteString == "wss://mac.tail1234.ts.net:7443/ws")
  }

  @Test func rejectsBadPairingLinks() {
    #expect(throws: PairingLink.ParseError.notPairingLink) { try PairingLink.parse("https://x") }
    #expect(throws: PairingLink.ParseError.unsupportedVersion("2")) { try PairingLink.parse("daycare://pair?v=2&host=h&token=t") }
    #expect(throws: PairingLink.ParseError.missing("token")) { try PairingLink.parse("daycare://pair?v=1&host=h") }
  }

  @Test func retryFollowsErrorTable() {
    #expect(RetryPolicy.action(for: .rejected, attempts: 0) == .drop)
    #expect(RetryPolicy.action(for: .unauthorized, attempts: 0) == .repair)
    #expect(RetryPolicy.action(for: .unavailable, attempts: 9) == .retry)
    #expect(RetryPolicy.action(for: .internal, attempts: 2) == .retry)
    #expect(RetryPolicy.action(for: .internal, attempts: 3) == .drop)
  }

  @Test func backoffDoublesToCap() {
    var backoff = Backoff()
    let delays = (0..<7).map { _ in backoff.next() }
    #expect(delays == [1, 2, 4, 8, 16, 30, 30])
    backoff.reset()
    #expect(backoff.next() == 1)
  }

  @Test func mediaURLMatchesEncodeURIComponent() {
    let url = MediaRoute.url(host: "mac.ts.net", port: 7443, session: "s 1", path: "/Users/me/a b+c.mp4")
    #expect(url?.absoluteString == "https://mac.ts.net:7443/media/s%201?path=%2FUsers%2Fme%2Fa%20b%2Bc.mp4")
  }

  @Test func durationsHaveNoLeadingZeros() {
    #expect(Formatting.minutes(7) == "7 min")
    #expect(Formatting.minutes(60) == "1 h")
    #expect(Formatting.minutes(95) == "1 h 35 min")
    #expect(Formatting.duration(40) == "40 s")
    #expect(Formatting.duration(65) == "1 min 5 s")
    #expect(Formatting.duration(120) == "2 min")
    #expect(Formatting.duration(3725) == "1 h 2 min")
  }

  @Test func choicesOrderAllowFirst() {
    #expect(ChoiceLabel.ordered(["deny", "always", "allow"]) == ["allow", "always", "deny"])
    #expect(ChoiceLabel.label("acceptForSession") == "Allow for session")
    #expect(ChoiceLabel.label("Yes, proceed") == "Yes, proceed")
  }
}
