import XCTest
@testable import WhiskerWalk

/// Nearby one-tap joining: what counts as a room, what the page may ask for,
/// what that comes to in the foreground and the background, and the event the
/// page hears. None of it touches the network: the bridge is driven with a
/// stand-in radio.
final class NearbyTests: XCTestCase {
    // MARK: A room, in and out of the discovery info

    func test_a_room_is_a_typed_code_and_a_pet_name() {
        let room = NearbyRoom(code: "AB12", name: "Mittens")
        XCTAssertEqual(room?.code, "AB12")
        XCTAssertEqual(room?.name, "Mittens")
        XCTAssertNotNil(NearbyRoom(code: "0000", name: "Al"))
        XCTAssertNil(NearbyRoom(code: "ZZZZ", name: "Tiger-Lily Rose Bo")) // 18 characters
        XCTAssertNotNil(NearbyRoom(code: "ZZZZ", name: "Tiger-Lily Rose"))
        XCTAssertNotNil(NearbyRoom(code: "ZZZZ", name: "Abcdefghijklmnop")) // 16
        XCTAssertNil(NearbyRoom(code: "ZZZZ", name: "Abcdefghijklmnopq")) // 17
    }

    func test_codes_that_are_not_codes() {
        let bad: [Any?] = ["abcd", "ABC", "ABCDE", "AB D", "AB-D", "", " ABCD", "ABCD ", "ABCD\n", "ＡＢＣＤ", "АВСD",
                           "P0123456789abcdef", "AB\u{0}D", 1234, nil, ["ABCD"], NSNull()]
        for code in bad {
            XCTAssertNil(NearbyRoom(code: code, name: "Mittens"), "\(String(describing: code))")
        }
    }

    func test_names_that_are_not_names() {
        let bad: [Any?] = ["", "A", " Mittens", "-Mittens", "9Lives", "Mittens!", "Mit_tens", "Mittens\n",
                           "<img src=x onerror=alert(1)>", "<b>Mo</b>", "\"Mo\"", "Mo'); alert(1); ('", "Mo\\", "Mo</script>",
                           "Zoë", "Мурка", "Mo\u{2028}Mo", "Mo\u{0}Mo", "Mo\u{200B}Mo", "😺😺", "Mo\tMo",
                           String(repeating: "a", count: 17), String(repeating: "a", count: 5000),
                           42, nil, ["Mittens"], NSNull()]
        for name in bad {
            XCTAssertNil(NearbyRoom(code: "ABCD", name: name), "\(String(describing: name))")
        }
    }

    func test_discovery_info_carries_the_code_and_the_name_and_nothing_else() {
        let room = NearbyRoom(code: "ABCD", name: "Mittens")!
        XCTAssertEqual(room.discoveryInfo, ["c": "ABCD", "n": "Mittens"])
        XCTAssertEqual(NearbyRoom(discoveryInfo: room.discoveryInfo), room)
        // Small enough for a Bonjour TXT record, whatever the name.
        let longest = NearbyRoom(code: "ABCD", name: "Abcdefghijklmnop")!
        let bytes = longest.discoveryInfo.reduce(0) { $0 + $1.key.utf8.count + $1.value.utf8.count + 2 }
        XCTAssertLessThan(bytes, 64)
    }

    func test_hostile_discovery_info_is_not_a_room() {
        XCTAssertNil(NearbyRoom(discoveryInfo: nil))
        XCTAssertNil(NearbyRoom(discoveryInfo: [:]))
        XCTAssertNil(NearbyRoom(discoveryInfo: ["c": "ABCD"]))
        XCTAssertNil(NearbyRoom(discoveryInfo: ["n": "Mittens"]))
        XCTAssertNil(NearbyRoom(discoveryInfo: ["code": "ABCD", "name": "Mittens"]))
        XCTAssertNil(NearbyRoom(discoveryInfo: ["c": "abcd", "n": "Mittens"]))
        XCTAssertNil(NearbyRoom(discoveryInfo: ["c": "ABCD", "n": "<script>alert(1)</script>"]))
        XCTAssertNil(NearbyRoom(discoveryInfo: ["c": "ABCD", "n": "Mo\"}]}));alert(1);//"]))
        XCTAssertNil(NearbyRoom(discoveryInfo: ["c": "ABCD", "n": String(repeating: "A", count: 250)]))
        // A crowd of keys is refused outright.
        var crowded = ["c": "ABCD", "n": "Mittens"]
        for i in 0..<20 { crowded["k\(i)"] = "v" }
        XCTAssertNil(NearbyRoom(discoveryInfo: crowded))
        // A few extra keys are ignored, and are not carried along.
        let extra = NearbyRoom(discoveryInfo: ["c": "ABCD", "n": "Mittens", "id": "player-1", "device": "Kid B's iPad"])
        XCTAssertEqual(extra?.discoveryInfo, ["c": "ABCD", "n": "Mittens"])
    }

    // MARK: The message vocabulary

    @MainActor
    func test_the_four_messages_the_page_sends() {
        // The same four as src/game/nearby.js.
        XCTAssertEqual(NearbyCommand.from(message: ["op": "advertise", "code": "ABCD", "name": "Mittens"]),
                       .advertise(NearbyRoom(code: "ABCD", name: "Mittens")!))
        XCTAssertEqual(NearbyCommand.from(message: ["op": "stopAdvertising"]), .stopAdvertising)
        XCTAssertEqual(NearbyCommand.from(message: ["op": "browse"]), .browse)
        XCTAssertEqual(NearbyCommand.from(message: ["op": "stopBrowsing"]), .stopBrowsing)
        XCTAssertEqual(NearbyBridge.handlerName, "nearby")
        // As WebKit hands a page's object over: an NSDictionary.
        let bridged: NSDictionary = ["op": "advertise", "code": "ABCD", "name": "Mittens"]
        XCTAssertEqual(NearbyCommand.from(message: bridged), .advertise(NearbyRoom(code: "ABCD", name: "Mittens")!))
    }

    func test_anything_else_is_ignored() {
        let others: [Any] = ["browse", "", 1, true, NSNull(), ["browse"], [:] as [String: Any],
                             ["op": "BROWSE"], ["op": "browse "], ["op": "stop"], ["op": "connect"], ["op": 1], ["op": ["browse"]],
                             ["OP": "browse"],
                             ["op": "advertise"], ["op": "advertise", "code": "ABCD"], ["op": "advertise", "name": "Mittens"],
                             ["op": "advertise", "code": "abcd", "name": "Mittens"],
                             ["op": "advertise", "code": "ABCD", "name": "<b>"],
                             ["op": "advertise", "code": 1234, "name": "Mittens"],
                             ["op": "advertise", "code": "ABCD", "name": ["Mittens"]]]
        for body in others {
            XCTAssertNil(NearbyCommand.from(message: body), "\(body)")
        }
        var crowded: [String: Any] = ["op": "browse"]
        for i in 0..<20 { crowded["k\(i)"] = i }
        XCTAssertNil(NearbyCommand.from(message: crowded))
    }

    // MARK: The plan

    func test_nothing_runs_until_asked() {
        let plan = NearbyPlan()
        XCTAssertNil(plan.advertising)
        XCTAssertFalse(plan.browsing)
    }

    func test_the_plan_follows_the_page() {
        var plan = NearbyPlan()
        plan.apply(.browse)
        XCTAssertTrue(plan.browsing)
        plan.apply(.stopBrowsing)
        XCTAssertFalse(plan.browsing)
        let room = NearbyRoom(code: "ABCD", name: "Mittens")!
        plan.apply(.advertise(room))
        XCTAssertEqual(plan.advertising, room)
        let renamed = NearbyRoom(code: "ABCD", name: "Robin")!
        plan.apply(.advertise(renamed))
        XCTAssertEqual(plan.advertising, renamed)
        plan.apply(.stopAdvertising)
        XCTAssertNil(plan.advertising)
    }

    func test_never_findable_and_looking_at_once() {
        var plan = NearbyPlan()
        plan.apply(.browse)
        plan.apply(.advertise(NearbyRoom(code: "ABCD", name: "Mittens")!))
        XCTAssertNotNil(plan.advertising)
        XCTAssertFalse(plan.browsing)
        plan.apply(.stopAdvertising)
        XCTAssertTrue(plan.browsing)
    }

    func test_the_background_stops_everything_and_the_foreground_brings_it_back() {
        var plan = NearbyPlan()
        plan.apply(.browse)
        plan.setForeground(false)
        XCTAssertFalse(plan.browsing)
        plan.setForeground(true)
        XCTAssertTrue(plan.browsing)

        plan.apply(.stopBrowsing)
        let room = NearbyRoom(code: "ABCD", name: "Mittens")!
        plan.apply(.advertise(room))
        plan.setForeground(false)
        XCTAssertNil(plan.advertising)
        // Asked for in the background: still nothing until it is in front.
        plan.apply(.browse)
        XCTAssertFalse(plan.browsing)
        plan.setForeground(true)
        XCTAssertEqual(plan.advertising, room)
    }

    func test_reset_forgets_what_a_lost_page_asked_for() {
        var plan = NearbyPlan()
        plan.apply(.browse)
        plan.apply(.advertise(NearbyRoom(code: "ABCD", name: "Mittens")!))
        plan.reset()
        XCTAssertNil(plan.advertising)
        XCTAssertFalse(plan.browsing)
        XCTAssertEqual(plan, NearbyPlan())
    }

    // MARK: The event

    func test_the_event_json() {
        XCTAssertEqual(NearbyNews.eventName, "whisker-nearby")
        XCTAssertEqual(NearbyNews.json([]), #"{"rooms":[]}"#)
        let rooms = [NearbyRoom(code: "ABCD", name: "Mittens")!, NearbyRoom(code: "WX9Z", name: "Tiger-Lily Rose")!]
        XCTAssertEqual(NearbyNews.json(rooms),
                       #"{"rooms":[{"code":"ABCD","name":"Mittens"},{"code":"WX9Z","name":"Tiger-Lily Rose"}]}"#)
        XCTAssertEqual(NearbyNews.eventScript([rooms[0]]),
                       #"window.dispatchEvent(new CustomEvent('whisker-nearby', { detail: {"rooms":[{"code":"ABCD","name":"Mittens"}]} }));"#)
    }

    func test_the_event_json_is_json_and_holds_only_plain_characters() throws {
        let rooms = [NearbyRoom(code: "ABCD", name: "Mittens")!, NearbyRoom(code: "WX9Z", name: "Tiger-Lily Rose")!]
        let json = NearbyNews.json(rooms)
        let parsed = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: [[String: String]]])
        XCTAssertEqual(parsed, ["rooms": [["code": "ABCD", "name": "Mittens"], ["code": "WX9Z", "name": "Tiger-Lily Rose"]]])
        // Nothing that could end a string, a script or a line.
        let allowed = Set(#"{}[]":, -"# + "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
        XCTAssertTrue(json.allSatisfy { allowed.contains($0) }, json)
    }

    func test_a_hostile_advertiser_never_reaches_the_script() {
        // Everything found goes through NearbyRoom(discoveryInfo:) first, so
        // the only way into the list is to be a well-formed room.
        let hostile: [[String: String]] = [
            ["c": "ABCD", "n": "x'}));alert(1);//"],
            ["c": "ABCD", "n": "</script><script>alert(1)</script>"],
            ["c": "AB\"D", "n": "Mittens"],
            ["c": "ABCD", "n": "Mo\u{2028}alert(1)"],
            ["c": "ABCD", "n": "Mo\\"],
        ]
        let rooms = hostile.compactMap { NearbyRoom(discoveryInfo: $0) }
        XCTAssertEqual(rooms, [])
        XCTAssertEqual(NearbyNews.eventScript(NearbyNews.list(rooms)),
                       #"window.dispatchEvent(new CustomEvent('whisker-nearby', { detail: {"rooms":[]} }));"#)
    }

    func test_the_list_is_one_per_code_in_a_fixed_order_and_short() {
        let a = NearbyRoom(code: "BBBB", name: "Robin")!
        let b = NearbyRoom(code: "AAAA", name: "Mittens")!
        let twin = NearbyRoom(code: "BBBB", name: "Alfie")!
        XCTAssertEqual(NearbyNews.list([a, b]), [b, a])
        XCTAssertEqual(NearbyNews.list([b, a]), [b, a])
        // Two advertisers with one code: one row, the same one whatever the order.
        XCTAssertEqual(NearbyNews.list([a, twin, b]), [b, twin])
        XCTAssertEqual(NearbyNews.list([twin, b, a]), [b, twin])
        let many = (0..<40).map { NearbyRoom(code: "A0\($0 + 10)", name: "Mittens")! }
        XCTAssertEqual(NearbyNews.maxRooms, 6)
        XCTAssertEqual(NearbyNews.list(many.shuffled()), Array(many.prefix(6)))
        XCTAssertEqual(NearbyNews.list([]), [])
    }

    // MARK: The bridge, with a stand-in radio

    @MainActor
    private final class FakeRadio: NearbyRadio {
        var onFound: (([NearbyRoom]) -> Void)?
        var log: [String] = []
        var advertised: NearbyRoom?
        var browsing = false
        func advertise(_ room: NearbyRoom?) {
            guard room != advertised else { return }
            advertised = room
            log.append(room.map { "advertise \($0.code) \($0.name)" } ?? "stopAdvertising")
        }
        func browse(_ on: Bool) {
            guard on != browsing else { return }
            browsing = on
            log.append(on ? "browse" : "stopBrowsing")
        }
        func appBecameActive() { log.append("active") }
    }

    @MainActor
    private func makeBridge() -> (NearbyBridge, FakeRadio, () -> [String]) {
        let radio = FakeRadio()
        let bridge = NearbyBridge(radio: radio)
        var scripts: [String] = []
        bridge.send = { scripts.append($0) }
        return (bridge, radio, { scripts })
    }

    @MainActor
    func test_the_bridge_does_nothing_until_the_page_asks() {
        let (_, radio, scripts) = makeBridge()
        XCTAssertEqual(radio.log, [])
        XCTAssertEqual(scripts(), [])
    }

    @MainActor
    func test_the_bridge_passes_the_pages_wishes_to_the_radio() {
        let (bridge, radio, _) = makeBridge()
        bridge.handle(.browse)
        bridge.handle(.browse)
        bridge.handle(.stopBrowsing)
        bridge.handle(.advertise(NearbyRoom(code: "ABCD", name: "Mittens")!))
        bridge.handle(.stopAdvertising)
        bridge.handle(.stopAdvertising)
        XCTAssertEqual(radio.log, ["browse", "stopBrowsing", "advertise ABCD Mittens", "stopAdvertising"])
    }

    @MainActor
    func test_the_bridge_tells_the_page_on_every_change_and_only_then() {
        let (bridge, radio, scripts) = makeBridge()
        bridge.handle(.browse)
        let mittens = NearbyRoom(code: "ABCD", name: "Mittens")!
        let robin = NearbyRoom(code: "WXYZ", name: "Robin")!
        radio.onFound?([mittens])
        radio.onFound?([mittens])
        radio.onFound?([robin, mittens])
        radio.onFound?([mittens, robin])
        radio.onFound?([robin])
        radio.onFound?([])
        XCTAssertEqual(scripts(), [
            NearbyNews.eventScript([mittens]),
            NearbyNews.eventScript([mittens, robin]),
            NearbyNews.eventScript([robin]),
            NearbyNews.eventScript([]),
        ])
    }

    @MainActor
    func test_stopping_the_search_empties_the_pages_list() {
        let (bridge, radio, scripts) = makeBridge()
        bridge.handle(.browse)
        radio.onFound?([NearbyRoom(code: "ABCD", name: "Mittens")!])
        bridge.handle(.stopBrowsing)
        XCTAssertEqual(scripts().last, NearbyNews.eventScript([]))
        // Late news from a search that was stopped is not passed on.
        let count = scripts().count
        radio.onFound?([NearbyRoom(code: "WXYZ", name: "Robin")!])
        XCTAssertEqual(scripts().count, count)
    }

    @MainActor
    func test_the_background_stops_the_radio_and_the_foreground_starts_it_again() {
        let (bridge, radio, scripts) = makeBridge()
        bridge.handle(.browse)
        radio.onFound?([NearbyRoom(code: "ABCD", name: "Mittens")!])
        bridge.appMoved(toForeground: false)
        XCTAssertEqual(radio.log, ["browse", "stopBrowsing"])
        XCTAssertEqual(scripts().last, NearbyNews.eventScript([]))
        bridge.appMoved(toForeground: true)
        XCTAssertEqual(radio.log, ["browse", "stopBrowsing", "browse"])

        bridge.handle(.stopBrowsing)
        bridge.handle(.advertise(NearbyRoom(code: "ABCD", name: "Mittens")!))
        bridge.appMoved(toForeground: false)
        XCTAssertNil(radio.advertised)
        bridge.appMoved(toForeground: true)
        XCTAssertEqual(radio.advertised, NearbyRoom(code: "ABCD", name: "Mittens")!)
    }

    @MainActor
    func test_the_apps_own_notifications_reach_the_bridge() {
        let (bridge, radio, _) = makeBridge()
        bridge.handle(.browse)
        NotificationCenter.default.post(name: UIApplication.didEnterBackgroundNotification, object: nil)
        XCTAssertFalse(radio.browsing)
        NotificationCenter.default.post(name: UIApplication.willEnterForegroundNotification, object: nil)
        XCTAssertTrue(radio.browsing)
        NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
        XCTAssertEqual(radio.log.last, "active")
        // Merely resigning active (iOS's own question does that) stops nothing.
        NotificationCenter.default.post(name: UIApplication.willResignActiveNotification, object: nil)
        XCTAssertTrue(radio.browsing)
    }

    @MainActor
    func test_reset_stops_everything_a_lost_page_had_running() {
        let (bridge, radio, scripts) = makeBridge()
        bridge.handle(.browse)
        radio.onFound?([NearbyRoom(code: "ABCD", name: "Mittens")!])
        bridge.reset()
        XCTAssertFalse(radio.browsing)
        XCTAssertEqual(scripts().last, NearbyNews.eventScript([]))
        bridge.handle(.advertise(NearbyRoom(code: "ABCD", name: "Mittens")!))
        bridge.reset()
        XCTAssertNil(radio.advertised)
        XCTAssertEqual(bridge.plan, NearbyPlan())
    }

    // MARK: The real radio's fixed values, and Info.plist

    @MainActor
    func test_the_peer_name_is_fixed_and_is_not_the_devices() {
        XCTAssertEqual(MultipeerRadio.peerName, "Whisker Walk")
        XCTAssertNotEqual(MultipeerRadio.peerName, UIDevice.current.name)
        // Within what MCPeerID accepts: not empty, at most 63 bytes.
        XCTAssertTrue((1...63).contains(MultipeerRadio.peerName.utf8.count))
    }

    @MainActor
    func test_the_service_type_is_one_multipeer_accepts() {
        // 1 to 15 of lowercase letters, digits and hyphens; a letter in it;
        // no hyphen first, last or doubled. Anything else throws at run time.
        let type = MultipeerRadio.serviceType
        XCTAssertEqual(type, "whisker-walk")
        XCTAssertTrue((1...15).contains(type.utf8.count))
        XCTAssertTrue(type.utf8.allSatisfy { (0x61...0x7A).contains($0) || (0x30...0x39).contains($0) || $0 == 0x2D })
        XCTAssertTrue(type.utf8.contains { (0x61...0x7A).contains($0) })
        XCTAssertFalse(type.hasPrefix("-") || type.hasSuffix("-") || type.contains("--"))
    }

    @MainActor
    func test_info_plist_declares_the_service_and_says_why() throws {
        // The tests run inside the app, so this is the app's own Info.plist.
        let services = try XCTUnwrap(Bundle.main.object(forInfoDictionaryKey: "NSBonjourServices") as? [String])
        XCTAssertEqual(Set(services), ["_\(MultipeerRadio.serviceType)._tcp", "_\(MultipeerRadio.serviceType)._udp"])
        let why = try XCTUnwrap(Bundle.main.object(forInfoDictionaryKey: "NSLocalNetworkUsageDescription") as? String)
        XCTAssertTrue(why.contains("local network"))
        XCTAssertTrue(why.contains("family"))
    }

    @MainActor
    func test_the_real_radio_is_idle_until_started() {
        // Made, and told to stop things it never started: no peer, no
        // advertiser and no browser come into being, so nothing is asked of
        // the network (and this test brings up no permission question).
        let radio = MultipeerRadio()
        radio.advertise(nil)
        radio.browse(false)
        radio.appBecameActive()
        XCTAssertNil(radio.onFound)
    }
}
