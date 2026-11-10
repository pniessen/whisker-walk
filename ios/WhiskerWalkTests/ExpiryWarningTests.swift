import XCTest
@testable import WhiskerWalk

/// In the app's last day a banner asks the children to get a grown-up to
/// refresh it, so the family hears about a missed refresh before the app
/// stops opening, even if the Mac's nightly run failed. Not earlier: the
/// nightly run renews on the last night, and a banner that shows every week
/// while all is well would teach everyone to ignore it.
final class ExpiryWarningTests: XCTestCase {
    private let day: TimeInterval = 24 * 60 * 60
    private let now = ISO8601DateFormatter().date(from: "2026-11-15T19:00:00Z")!
    private var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "America/New_York")!
        return c
    }

    /// A provisioning profile is a plist wrapped in a signature: bytes either side.
    private func profile(expiry: String) -> Data {
        var data = Data([0x30, 0x82, 0x4e, 0x1f, 0x06, 0x09])
        data.append("""
            <?xml version="1.0" encoding="UTF-8"?>
            <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
            <plist version="1.0"><dict>
            <key>AppIDName</key><string>WhiskerWalk</string>
            <key>ExpirationDate</key><date>\(expiry)</date>
            </dict></plist>
            """.data(using: .utf8)!)
        data.append(Data([0xa0, 0x82, 0x0d, 0x00]))
        return data
    }

    func test_reads_the_expiry_from_a_signed_profile() {
        XCTAssertEqual(ExpiryWarning.expiry(fromProfile: profile(expiry: "2026-11-17T06:07:10Z")),
                       ISO8601DateFormatter().date(from: "2026-11-17T06:07:10Z"))
    }

    func test_no_expiry_from_bytes_that_are_not_a_profile() {
        XCTAssertNil(ExpiryWarning.expiry(fromProfile: Data([0x00, 0x01, 0x02])))
    }

    func test_silent_with_more_than_a_day_left() {
        XCTAssertNil(ExpiryWarning.message(expiry: now.addingTimeInterval(1.1 * day), now: now, calendar: calendar))
    }

    func test_warns_in_the_last_day_when_it_stops_tomorrow() {
        // Monday 7 am in New York; the app stops opening at 1:07 am Tuesday.
        let monday = ISO8601DateFormatter().date(from: "2026-11-16T12:00:00Z")!
        let message = ExpiryWarning.message(expiry: ISO8601DateFormatter().date(from: "2026-11-17T06:07:10Z"),
                                            now: monday, calendar: calendar)
        XCTAssertEqual(message, "This game needs a refresh soon — ask a grown-up! It stops opening tomorrow.")
    }

    func test_says_today_on_the_day_it_stops() {
        // 12:30 am Tuesday in New York.
        let tuesday = ISO8601DateFormatter().date(from: "2026-11-17T05:30:00Z")!
        let message = ExpiryWarning.message(expiry: ISO8601DateFormatter().date(from: "2026-11-17T06:07:10Z"),
                                            now: tuesday, calendar: calendar)
        XCTAssertEqual(message, "This game needs a refresh soon — ask a grown-up! It stops opening today.")
    }

    func test_silent_without_a_profile() {
        // The simulator and Xcode debug runs have no embedded profile.
        XCTAssertNil(ExpiryWarning.message(expiry: nil, now: now, calendar: calendar))
    }
}
