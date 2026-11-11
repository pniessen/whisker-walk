import XCTest
@testable import WhiskerWalk

/// The page the app opens. The testing switches (`-rung N`, `-perf YES` at
/// launch) only ever add a query the game already understands.
final class AppSchemeTests: XCTestCase {
    func test_with_no_switches_it_is_the_plain_start_page() {
        XCTAssertEqual(AppScheme.startURL(rung: nil, perf: false), AppScheme.startURL)
        XCTAssertEqual(AppScheme.startURL.absoluteString, "whiskerwalk://app/index.html")
    }

    func test_a_rung_becomes_the_rung_query() {
        XCTAssertEqual(AppScheme.startURL(rung: "4", perf: false).absoluteString,
                       "whiskerwalk://app/index.html?rung=4")
        XCTAssertEqual(AppScheme.startURL(rung: "0", perf: false).absoluteString,
                       "whiskerwalk://app/index.html?rung=0")
    }

    func test_perf_turns_the_readout_on_with_or_without_a_rung() {
        XCTAssertEqual(AppScheme.startURL(rung: nil, perf: true).absoluteString,
                       "whiskerwalk://app/index.html?perf")
        XCTAssertEqual(AppScheme.startURL(rung: "5", perf: true).absoluteString,
                       "whiskerwalk://app/index.html?rung=5&perf")
    }

    func test_a_rung_that_is_not_a_small_whole_number_is_ignored() {
        for bad in ["", "low", "-1", "1.5", "123", "4&x=1", "٤"] {
            XCTAssertEqual(AppScheme.startURL(rung: bad, perf: false), AppScheme.startURL, bad)
        }
    }

    func test_the_switched_page_is_still_the_game() {
        let url = AppScheme.startURL(rung: "4", perf: true)
        XCTAssertEqual(NavigationRule.decide(url), .allow)
        XCTAssertEqual(CrashRecovery.action(currentURL: url), .reload)
    }
}
