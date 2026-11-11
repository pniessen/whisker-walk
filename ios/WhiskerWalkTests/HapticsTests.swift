import XCTest
@testable import WhiskerWalk

/// The page's haptic words and what each plays: a small fixed vocabulary,
/// anything else ignored, and only an iPhone told it can buzz.
final class HapticsTests: XCTestCase {
    func test_the_five_words_the_game_sends() {
        // The same words as BRIDGE_MESSAGES in src/haptics.js.
        XCTAssertEqual(HapticKind.allCases.map(\.rawValue), ["tap", "double", "success", "hit", "purr"])
        for kind in HapticKind.allCases {
            XCTAssertEqual(HapticKind.from(message: kind.rawValue), kind)
        }
    }

    func test_anything_else_is_ignored() {
        let others: [Any] = ["", "TAP", " tap", "tap ", "purrStart", "buzz", String(repeating: "tap", count: 20),
                             1, true, ["tap"], ["kind": "tap"], NSNull()]
        for body in others {
            XCTAssertNil(HapticKind.from(message: body), "\(body)")
        }
    }

    func test_what_each_plays() {
        XCTAssertEqual(HapticKind.tap.steps, [.impact(.light, intensity: 0.8, after: 0)])
        XCTAssertEqual(HapticKind.double.steps, [.impact(.soft, intensity: 0.8, after: 0), .impact(.soft, intensity: 0.8, after: 0.11)])
        XCTAssertEqual(HapticKind.success.steps, [.success(after: 0)])
        XCTAssertEqual(HapticKind.hit.steps, [.impact(.rigid, intensity: 0.9, after: 0)])
        XCTAssertEqual(HapticKind.purr.steps, [.impact(.soft, intensity: 0.45, after: 0)])
    }

    func test_every_kind_starts_at_once_and_stays_short() {
        for kind in HapticKind.allCases {
            let steps = kind.steps
            XCTAssertFalse(steps.isEmpty)
            XCTAssertEqual(steps.first?.after, 0)
            XCTAssertLessThan(steps.last?.after ?? 1, 0.25)
            for case let .impact(_, intensity, _) in steps {
                XCTAssertGreaterThan(intensity, 0)
                XCTAssertLessThanOrEqual(intensity, 1)
            }
        }
        // The purr is the softest thing it plays.
        guard case let .impact(style, purr, _) = HapticKind.purr.steps[0] else { return XCTFail("purr") }
        XCTAssertEqual(style, .soft)
        for kind in HapticKind.allCases where kind != .purr {
            for case let .impact(_, intensity, _) in kind.steps { XCTAssertLessThan(purr, intensity) }
        }
    }

    func test_only_an_iphone_can_buzz() {
        XCTAssertTrue(HapticKind.deviceSupports(.phone))
        XCTAssertFalse(HapticKind.deviceSupports(.pad))
        XCTAssertFalse(HapticKind.deviceSupports(.mac))
        XCTAssertFalse(HapticKind.deviceSupports(.unspecified))
    }

    @MainActor
    func test_the_player_takes_every_word_without_a_device() {
        // The simulator has no Taptic Engine: this only shows the edge runs.
        let player = HapticPlayer()
        for kind in HapticKind.allCases { player.play(kind) }
        player.prepare()
        XCTAssertEqual(HapticPlayer.handlerName, "haptic")
    }
}
