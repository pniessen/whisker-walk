import UIKit
import WebKit

/// The game's few small vibrations, played with Apple's feedback generators.
///
/// iOS's web view has no `navigator.vibrate`, so the page posts one short
/// word to `window.webkit.messageHandlers.haptic` and this plays it. The
/// game's side is `src/haptics.js`: it chooses the moments, keeps them sparse,
/// rate-limits them, and owns the purr's rhythm (it sends one `purr` per
/// beat), so a purr can never be left running here once the page stops
/// asking. An iPad has no Taptic Engine: the device profile says
/// `haptics: false` there and the page sends nothing.
///
/// The words and what each plays are pure values, unit-tested without a
/// device (`HapticsTests.swift`). Only `HapticPlayer`, at the bottom, touches
/// the generators.
enum HapticKind: String, CaseIterable, Sendable {
    /// A pounce landing, picking up a treasure, tipping something over.
    case tap
    /// A nose touch or a greeting with another cat.
    case double
    /// A goal completed, a rank up, a golden mouse.
    case success
    /// A blow landed or taken in a clan fight.
    case hit
    /// One beat of a purr (head scratches, a nap).
    case purr

    /// The page's message as a kind, or nil for anything else, which is
    /// ignored: only these five exact words ever play.
    static func from(message body: Any) -> HapticKind? {
        guard let word = body as? String, word.utf8.count <= 16 else { return nil }
        return HapticKind(rawValue: word)
    }

    /// What it plays, in order. The first step is at once; `after` is seconds
    /// from the first.
    var steps: [HapticStep] {
        switch self {
        case .tap: return [.impact(.light, intensity: 0.8, after: 0)]
        case .double: return [.impact(.soft, intensity: 0.8, after: 0), .impact(.soft, intensity: 0.8, after: 0.11)]
        case .success: return [.success(after: 0)]
        case .hit: return [.impact(.rigid, intensity: 0.9, after: 0)]
        // Soft and well under full strength: a purr is felt, not knocked.
        case .purr: return [.impact(.soft, intensity: 0.45, after: 0)]
        }
    }

    /// Whether this kind of device can play any of it. An iPhone has a
    /// Taptic Engine; an iPad has none (and its feedback generators do
    /// nothing), so the page is told not to send.
    static func deviceSupports(_ idiom: UIUserInterfaceIdiom) -> Bool {
        idiom == .phone
    }
}

/// One feedback, as plain values.
enum HapticStep: Equatable, Sendable {
    case impact(HapticImpact, intensity: Double, after: Double)
    case success(after: Double)

    var after: Double {
        switch self {
        case .impact(_, _, let after), .success(let after): return after
        }
    }
}

enum HapticImpact: Equatable, Sendable {
    case light, soft, rigid
}

// MARK: The thin edge

/// The `haptic` message handler. A separate object from the view controller
/// on purpose: the web view's content controller holds its handlers strongly,
/// and this holds nothing back (no view controller, no web view), so there is
/// no retain cycle.
///
/// The generators are made once and kept prepared, so the first tap after a
/// quiet spell is on time rather than late.
@MainActor
final class HapticPlayer: NSObject, WKScriptMessageHandler {
    static let handlerName = "haptic"

    private let light = UIImpactFeedbackGenerator(style: .light)
    private let soft = UIImpactFeedbackGenerator(style: .soft)
    private let rigid = UIImpactFeedbackGenerator(style: .rigid)
    private let notification = UINotificationFeedbackGenerator()

    override init() {
        super.init()
        prepare()
    }

    /// iOS lets a prepared generator go idle after a few seconds; this is
    /// called again when the app comes back to the front.
    func prepare() {
        light.prepare()
        soft.prepare()
        rigid.prepare()
        notification.prepare()
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, let kind = HapticKind.from(message: message.body) else { return }
        play(kind)
    }

    func play(_ kind: HapticKind) {
        for step in kind.steps {
            if step.after <= 0 {
                perform(step)
            } else {
                Task { @MainActor [weak self] in
                    try? await Task.sleep(for: .seconds(step.after))
                    self?.perform(step)
                }
            }
        }
    }

    private func perform(_ step: HapticStep) {
        switch step {
        case .impact(let impact, let intensity, _):
            let generator = generator(for: impact)
            generator.impactOccurred(intensity: CGFloat(intensity))
            generator.prepare()
        case .success:
            notification.notificationOccurred(.success)
            notification.prepare()
        }
    }

    private func generator(for impact: HapticImpact) -> UIImpactFeedbackGenerator {
        switch impact {
        case .light: return light
        case .soft: return soft
        case .rigid: return rigid
        }
    }
}
