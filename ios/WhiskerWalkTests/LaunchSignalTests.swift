import XCTest
@testable import WhiskerWalk

/// The one word the page sends to take the native loading view away. Anything
/// else leaves the view up (the 20 second fallback covers a page that never
/// says it).
final class LaunchSignalTests: XCTestCase {
    func test_only_the_painted_word_counts() {
        XCTAssertTrue(LaunchSignal.isPainted("painted"))
        let others: [Any] = ["", "Painted", " painted", "painted ", "done", 1, true, ["painted"], NSNull()]
        for body in others {
            XCTAssertFalse(LaunchSignal.isPainted(body), "\(body)")
        }
    }

    func test_the_handler_name_and_the_fallback_are_what_the_page_and_app_expect() {
        XCTAssertEqual(LaunchSignal.handlerName, "launch")
        XCTAssertEqual(LaunchSignal.fallbackSeconds, 20)
    }
}
