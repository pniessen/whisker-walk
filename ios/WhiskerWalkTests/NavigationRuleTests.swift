import XCTest
@testable import WhiskerWalk

/// Where a page navigation may go. The game stays inside the app; real web
/// links leave for Safari; anything else is refused.
final class NavigationRuleTests: XCTestCase {
    private func decide(_ string: String) -> NavigationRule {
        NavigationRule.decide(URL(string: string)!)
    }

    func test_the_bundled_game_stays_in_the_app() {
        XCTAssertEqual(decide("whiskerwalk://app/index.html"), .allow)
        XCTAssertEqual(decide("about:blank"), .allow)
    }

    func test_web_links_open_in_safari() {
        XCTAssertEqual(decide("https://pniessen.github.io/whisker-walk/"), .openExternally)
        XCTAssertEqual(decide("http://example.com"), .openExternally)
        XCTAssertEqual(decide("mailto:a@b.c"), .openExternally)
        XCTAssertEqual(decide("tel:5551234"), .openExternally)
    }

    func test_anything_else_is_refused() {
        XCTAssertEqual(decide("javascript:alert(1)"), .cancel)
        XCTAssertEqual(decide("file:///etc/hosts"), .cancel)
        XCTAssertEqual(decide("data:text/html,hi"), .cancel)
    }
}
