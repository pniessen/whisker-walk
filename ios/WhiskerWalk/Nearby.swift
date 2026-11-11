import MultipeerConnectivity
import UIKit
import WebKit

/// Nearby one-tap joining: finding a room that is being hosted in the same
/// room of the house, so the second child taps Join instead of typing a code.
///
/// The walk itself is still an ordinary online room; the only thing that
/// travels locally is the room's code and the host's cat name. This uses
/// MultipeerConnectivity for discovery and nothing else: the hosting device
/// advertises those two strings, the other device browses for them, and no
/// session is ever opened and no data is ever sent between the devices (an
/// invitation, should one arrive, is declined).
///
/// The page drives it (`src/game/nearby.js`). It posts one of four messages
/// to `window.webkit.messageHandlers.nearby`:
///
///     { op: "advertise", code: "ABCD", name: "Mittens" }
///     { op: "stopAdvertising" }
///     { op: "browse" }
///     { op: "stopBrowsing" }
///
/// and hears back a `whisker-nearby` `CustomEvent` on `window` whenever the
/// list of rooms found changes, including when one goes away:
///
///     detail: { rooms: [{ code: "ABCD", name: "Mittens" }] }
///
/// The page sends nothing until a child has opened Play together or tapped
/// Host once, so iOS's "find devices on your local network" question is never
/// asked of a child who only plays alone. If the answer was "Don't Allow",
/// starting simply finds nothing: no error reaches the page, and the typed
/// code works as it always has.
///
/// What is put on the air is the code and the cat's name only. The peer's
/// display name is a fixed string, never the device's name (which is often
/// "Charlie's iPad"), and nothing identifies the player or the save.
///
/// Everything another device says is untrusted: it is checked here
/// (`NearbyRoom`) before it reaches the page, and the page checks it again.
///
/// The values, the message vocabulary, the plan and the event's JSON are pure
/// and unit-tested without a radio (`NearbyTests.swift`). Only
/// `MultipeerRadio`, at the bottom, touches MultipeerConnectivity.
struct NearbyRoom: Hashable, Sendable {
    /// Four characters, A–Z and 0–9: exactly what a typed room code is
    /// (`TYPED_CODE` in `src/game/rooms.js`).
    let code: String
    /// The host's cat name: a letter, then letters, spaces or hyphens, 2 to
    /// 16 in all (the shape `validPetName` in `src/net.js` allows). The
    /// page's word list is applied there, not here.
    let name: String

    /// The keys in the advertiser's discovery info. Short, because the whole
    /// dictionary travels in a Bonjour TXT record.
    static let codeKey = "c"
    static let nameKey = "n"

    /// Nil unless both are strings of exactly the right shape. Nothing is
    /// trimmed or repaired: a value that is not already right is refused.
    init?(code: Any?, name: Any?) {
        guard let code = code as? String, let name = name as? String,
              Self.isCode(code), Self.isName(name) else { return nil }
        self.code = code
        self.name = name
    }

    /// What another device advertised, or nil for anything that is not a
    /// well-formed room. Extra keys are ignored and never passed on.
    init?(discoveryInfo: [String: String]?) {
        guard let info = discoveryInfo, info.count <= 8 else { return nil }
        self.init(code: info[Self.codeKey], name: info[Self.nameKey])
    }

    /// What this device advertises: the two strings, nothing else.
    var discoveryInfo: [String: String] {
        [Self.codeKey: code, Self.nameKey: name]
    }

    /// Checked byte by byte, in ASCII: Swift's own `isLetter` would let
    /// through every alphabet there is, and look-alikes with it.
    static func isCode(_ text: String) -> Bool {
        let bytes = Array(text.utf8)
        return bytes.count == 4 && bytes.allSatisfy { isUpper($0) || isDigit($0) }
    }

    static func isName(_ text: String) -> Bool {
        let bytes = Array(text.utf8)
        guard (2...16).contains(bytes.count), let first = bytes.first, isLetter(first) else { return false }
        return bytes.allSatisfy { isLetter($0) || $0 == 0x20 || $0 == 0x2D }
    }

    private static func isUpper(_ byte: UInt8) -> Bool { (0x41...0x5A).contains(byte) }
    private static func isDigit(_ byte: UInt8) -> Bool { (0x30...0x39).contains(byte) }
    private static func isLetter(_ byte: UInt8) -> Bool { isUpper(byte) || (0x61...0x7A).contains(byte) }
}

/// The four things the page can ask for.
enum NearbyCommand: Equatable, Sendable {
    case advertise(NearbyRoom)
    case stopAdvertising
    case browse
    case stopBrowsing

    /// The page's message as a command, or nil for anything else, which is
    /// ignored. An `advertise` without a well-formed code and name is nothing.
    static func from(message body: Any) -> NearbyCommand? {
        guard let message = body as? [String: Any], message.count <= 8,
              let op = message["op"] as? String else { return nil }
        switch op {
        case "advertise":
            guard let room = NearbyRoom(code: message["code"], name: message["name"]) else { return nil }
            return .advertise(room)
        case "stopAdvertising": return .stopAdvertising
        case "browse": return .browse
        case "stopBrowsing": return .stopBrowsing
        default: return nil
        }
    }
}

/// What the page last asked for, and what that comes to right now.
///
/// The page's wishes are kept while the app is in the background and nothing
/// runs; when the app comes back they apply again without the page having to
/// ask twice. A device is never findable and looking at the same moment: a
/// host has no use for other rooms.
struct NearbyPlan: Equatable, Sendable {
    private(set) var room: NearbyRoom?
    private(set) var wantsBrowsing = false
    private(set) var foreground = true

    mutating func apply(_ command: NearbyCommand) {
        switch command {
        case .advertise(let room): self.room = room
        case .stopAdvertising: room = nil
        case .browse: wantsBrowsing = true
        case .stopBrowsing: wantsBrowsing = false
        }
    }

    mutating func setForeground(_ foreground: Bool) {
        self.foreground = foreground
    }

    /// A page that has gone (the web content process ended and the game was
    /// loaded again) asked for nothing.
    mutating func reset() {
        room = nil
        wantsBrowsing = false
    }

    /// The room to advertise now, or nil for none.
    var advertising: NearbyRoom? { foreground ? room : nil }
    /// Whether to look for rooms now.
    var browsing: Bool { foreground && wantsBrowsing && room == nil }
}

/// The news for the page: the rooms found, as a `whisker-nearby` event.
enum NearbyNews {
    static let eventName = "whisker-nearby"
    /// At most this many rooms are ever reported (`MAX_NEARBY` in
    /// `src/game/nearby.js`). A living room has one or two.
    static let maxRooms = 6

    /// The list as the page gets it: one entry per code, in a fixed order
    /// (so the same rooms always read the same, whatever order they were
    /// found in), and never more than `maxRooms`.
    static func list(_ found: some Sequence<NearbyRoom>) -> [NearbyRoom] {
        var byCode: [String: NearbyRoom] = [:]
        for room in found {
            if let kept = byCode[room.code], kept.name <= room.name { continue }
            byCode[room.code] = room
        }
        return Array(byCode.values.sorted { $0.code < $1.code }.prefix(maxRooms))
    }

    /// `{"rooms":[{"code":"ABCD","name":"Mittens"}]}`. Made by
    /// JSONSerialization, which escapes whatever it is given; and by the time
    /// a room is a `NearbyRoom` its two strings are plain letters, digits,
    /// spaces and hyphens, so there is nothing in them to escape. Either
    /// alone keeps a hostile advertiser's name from becoming script.
    static func json(_ rooms: [NearbyRoom]) -> String {
        let payload: [String: Any] = ["rooms": rooms.map { ["code": $0.code, "name": $0.name] }]
        guard let data = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]),
              let text = String(data: data, encoding: .utf8) else { return #"{"rooms":[]}"# }
        return text
    }

    static func eventScript(_ rooms: [NearbyRoom]) -> String {
        "window.dispatchEvent(new CustomEvent('\(eventName)', { detail: \(json(rooms)) }));"
    }
}

/// The thing that actually advertises and browses. A protocol so the bridge
/// can be tested with a stand-in: the tests never touch the network, and so
/// never bring up the local-network question on whoever runs them.
@MainActor
protocol NearbyRadio: AnyObject {
    /// Called with every room currently found, on each change.
    var onFound: (([NearbyRoom]) -> Void)? { get set }
    /// Be findable as this room; nil for not at all.
    func advertise(_ room: NearbyRoom?)
    func browse(_ on: Bool)
    /// The app is in front again after something covered it.
    func appBecameActive()
}

/// The `nearby` message handler. A separate object from the view controller,
/// like the haptics: the content controller holds it strongly and it holds
/// the web view only weakly, so there is no retain cycle.
@MainActor
final class NearbyBridge: NSObject, WKScriptMessageHandler {
    static let handlerName = "nearby"

    private(set) var plan = NearbyPlan()
    private let radio: NearbyRadio
    /// The page that asked, kept weakly, to send its news back to.
    private weak var page: WKWebView?
    /// Where the event's script goes. The web view, except in tests.
    var send: ((String) -> Void)?
    private var reported: [NearbyRoom] = []

    init(radio: NearbyRadio = MultipeerRadio()) {
        self.radio = radio
        super.init()
        radio.onFound = { [weak self] rooms in self?.report(rooms) }
        // In the background nothing is advertised and nothing is looked for.
        // (Entering the background, not merely resigning active: iOS's own
        // local-network question makes the app resign active, and stopping
        // then would stop the very thing it is asking about.)
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(enteredBackground),
                           name: UIApplication.didEnterBackgroundNotification, object: nil)
        center.addObserver(self, selector: #selector(enteringForeground),
                           name: UIApplication.willEnterForegroundNotification, object: nil)
        center.addObserver(self, selector: #selector(becameActive),
                           name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, let command = NearbyCommand.from(message: message.body) else { return }
        page = message.webView
        handle(command)
    }

    func handle(_ command: NearbyCommand) {
        plan.apply(command)
        sync()
    }

    func appMoved(toForeground foreground: Bool) {
        plan.setForeground(foreground)
        sync()
    }

    /// The page was lost and loaded again: whatever the old one asked for is
    /// dropped. The new one asks afresh.
    func reset() {
        plan.reset()
        sync()
    }

    @objc private func enteredBackground() { appMoved(toForeground: false) }
    @objc private func enteringForeground() { appMoved(toForeground: true) }
    @objc private func becameActive() { radio.appBecameActive() }

    private func sync() {
        radio.advertise(plan.advertising)
        radio.browse(plan.browsing)
        // Not looking means nothing is known: the page is told the list is
        // empty rather than left holding a room that may be long gone.
        if !plan.browsing { report([]) }
    }

    private func report(_ rooms: [NearbyRoom]) {
        let list = plan.browsing ? NearbyNews.list(rooms) : []
        guard list != reported else { return }
        reported = list
        let script = NearbyNews.eventScript(list)
        if let send {
            send(script)
        } else {
            page?.evaluateJavaScript(script, completionHandler: nil)
        }
    }
}

// MARK: The thin edge

/// MultipeerConnectivity, for discovery only.
///
/// Nothing here is made until it is first needed, so a child who only plays
/// alone never has a peer, an advertiser or a browser at all.
@MainActor
final class MultipeerRadio: NSObject, NearbyRadio {
    /// The Bonjour service is `_whisker-walk._tcp` (and `._udp`); both are
    /// listed under `NSBonjourServices` in Info.plist, as iOS requires.
    static let serviceType = "whisker-walk"
    /// What other devices see as this peer's name: the same fixed words on
    /// every device. Never `UIDevice.current.name`.
    static let peerName = "Whisker Walk"
    /// More peers than this are not kept track of, so a crowd of advertisers
    /// cannot grow the list without limit.
    static let maxPeers = 32

    var onFound: (([NearbyRoom]) -> Void)?

    private lazy var peer = MCPeerID(displayName: Self.peerName)
    private var advertiser: MCNearbyServiceAdvertiser?
    private var advertised: NearbyRoom?
    private var browser: MCNearbyServiceBrowser?
    private var browsingSince = Date.distantPast
    private var found: [MCPeerID: NearbyRoom] = [:]

    func advertise(_ room: NearbyRoom?) {
        guard room != advertised else { return }
        advertiser?.stopAdvertisingPeer()
        advertiser?.delegate = nil
        advertiser = nil
        advertised = room
        guard let room else { return }
        let next = MCNearbyServiceAdvertiser(peer: peer, discoveryInfo: room.discoveryInfo,
                                             serviceType: Self.serviceType)
        next.delegate = self
        next.startAdvertisingPeer()
        advertiser = next
    }

    func browse(_ on: Bool) {
        guard on != (browser != nil) else { return }
        if on { startBrowsing() } else { stopBrowsing() }
    }

    /// The first time the local network is used, iOS covers the app with its
    /// question. A browser started before the answer does not always begin
    /// finding things once the answer is yes, so if it has found nothing by
    /// the time the app is in front again it is started afresh. With rooms
    /// already found it is left alone, so nothing on screen flickers.
    func appBecameActive() {
        guard browser != nil, found.isEmpty, Date().timeIntervalSince(browsingSince) > 1 else { return }
        stopBrowsing()
        startBrowsing()
    }

    private func startBrowsing() {
        let next = MCNearbyServiceBrowser(peer: peer, serviceType: Self.serviceType)
        next.delegate = self
        next.startBrowsingForPeers()
        browser = next
        browsingSince = Date()
    }

    private func stopBrowsing() {
        browser?.stopBrowsingForPeers()
        browser?.delegate = nil
        browser = nil
        found.removeAll()
    }

    /// A peer appeared (with a room, or with something that is not one) or
    /// went away (`room` nil). News from a browser that has since been
    /// stopped is dropped.
    private func heard(_ peerID: MCPeerID, room: NearbyRoom?, from source: ObjectIdentifier) {
        guard let browser, ObjectIdentifier(browser) == source, peerID != peer else { return }
        if let room {
            guard found[peerID] != nil || found.count < Self.maxPeers else { return }
            found[peerID] = room
        } else {
            guard found.removeValue(forKey: peerID) != nil else { return }
        }
        onFound?(Array(found.values))
    }
}

/// MultipeerConnectivity calls its delegates on a thread of its own. Each of
/// these checks what it was given where it stands, then hops to the main
/// actor with plain values.
extension MultipeerRadio: MCNearbyServiceBrowserDelegate {
    nonisolated func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID,
                             withDiscoveryInfo info: [String: String]?) {
        // Checked here: what crosses to the main actor is a room or nothing.
        let room = NearbyRoom(discoveryInfo: info)
        let who = PeerBox(peerID)
        let source = ObjectIdentifier(browser)
        Task { @MainActor [weak self] in self?.heard(who.peer, room: room, from: source) }
    }

    nonisolated func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
        let who = PeerBox(peerID)
        let source = ObjectIdentifier(browser)
        Task { @MainActor [weak self] in self?.heard(who.peer, room: nil, from: source) }
    }

    /// The local network was refused in Settings, or there is none: nothing
    /// is found, nothing is said, and the typed code is how rooms are joined.
    nonisolated func browser(_ browser: MCNearbyServiceBrowser, didNotStartBrowsingForPeers error: Error) {}
}

extension MultipeerRadio: MCNearbyServiceAdvertiserDelegate {
    /// Nobody is ever let in: this is for being found, not for connecting.
    nonisolated func advertiser(_ advertiser: MCNearbyServiceAdvertiser,
                                didReceiveInvitationFromPeer peerID: MCPeerID, withContext context: Data?,
                                invitationHandler: @escaping (Bool, MCSession?) -> Void) {
        invitationHandler(false, nil)
    }

    /// As for browsing: refused or no network means not findable, silently.
    nonisolated func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didNotStartAdvertisingPeer error: Error) {}
}

/// Carries a peer's id from MultipeerConnectivity's thread to the main actor.
/// `MCPeerID` is immutable once made, which is what makes this safe; the
/// framework predates `Sendable` and does not say so itself.
private struct PeerBox: @unchecked Sendable {
    let peer: MCPeerID
    init(_ peer: MCPeerID) { self.peer = peer }
}
