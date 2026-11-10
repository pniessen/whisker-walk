import XCTest
@testable import WhiskerWalk

/// After iOS ends the web content process, the game must come back, never a
/// blank screen, even when the process died before the first page loaded.
final class CrashRecoveryTests: XCTestCase {
    func test_reloads_the_game_page_it_was_on() {
        XCTAssertEqual(CrashRecovery.action(currentURL: URL(string: "whiskerwalk://app/index.html?perf")!), .reload)
    }

    func test_loads_the_game_when_nothing_had_loaded_yet() {
        XCTAssertEqual(CrashRecovery.action(currentURL: nil), .loadStart)
    }

    func test_loads_the_game_when_the_page_was_not_the_game() {
        XCTAssertEqual(CrashRecovery.action(currentURL: URL(string: "about:blank")!), .loadStart)
    }
}
