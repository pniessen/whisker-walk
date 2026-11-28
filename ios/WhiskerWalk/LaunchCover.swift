import UIKit
import WebKit

/// What the page says when its own boot splash (the cat on the splash colour,
/// in index.html) has been painted. The native cover below waits for exactly
/// this word and nothing else.
enum LaunchSignal {
    static let handlerName = "launch"
    static let painted = "painted"
    /// If the page never says it (a failed load, an old page), the cover goes
    /// anyway after this long, so it can never trap anyone behind it.
    static let fallbackSeconds: TimeInterval = 20

    static func isPainted(_ body: Any) -> Bool { (body as? String) == painted }
}

/// The page's message handler: calls `onPainted` once, on the main actor.
@MainActor
final class LaunchSignalHandler: NSObject, WKScriptMessageHandler {
    var onPainted: (() -> Void)?

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard LaunchSignal.isPainted(message.body) else { return }
        let done = onPainted
        onPainted = nil
        done?()
    }
}

/// The native loading view: the same cat, the same size and the same colour
/// as the page's own boot splash, drawn by the app the moment it opens, so
/// the first seconds of a cold start (the web content process starting and
/// the game's scripts being read, long on an older iPad) are never a blank
/// colour. It sits over the web view and fades away when the page says its
/// splash has painted, so the hand-over is the same picture under it.
final class LaunchCover: UIView {
    private let cat = UIImageView(image: UIImage(named: "LaunchCat"))
    private let word = UILabel()
    private let spinner = UIActivityIndicatorView(style: .medium)
    private var hiding = false

    init(background: UIColor) {
        super.init(frame: .zero)
        backgroundColor = background
        isUserInteractionEnabled = false
        accessibilityElementsHidden = true // the page's splash is the one that is read aloud

        cat.contentMode = .scaleAspectFit
        cat.translatesAutoresizingMaskIntoConstraints = false
        addSubview(cat)

        word.text = "Whisker Walk 2"
        word.textColor = UIColor(red: 0.945, green: 0.878, blue: 0.761, alpha: 1) // #f1e0c2
        word.font = UIFont(name: "Avenir-Heavy", size: 27) ?? .systemFont(ofSize: 27, weight: .bold)
        word.textAlignment = .center
        word.translatesAutoresizingMaskIntoConstraints = false
        addSubview(word)

        // Only appears if the wait is a long one: a quick start never shows it.
        spinner.color = word.textColor
        spinner.alpha = 0
        spinner.translatesAutoresizingMaskIntoConstraints = false
        addSubview(spinner)

        let width = cat.widthAnchor.constraint(equalTo: widthAnchor, multiplier: 0.52)
        width.priority = .defaultHigh
        NSLayoutConstraint.activate([
            width,
            cat.widthAnchor.constraint(lessThanOrEqualToConstant: Self.catMaxWidth),
            cat.heightAnchor.constraint(equalTo: cat.widthAnchor),
            cat.centerXAnchor.constraint(equalTo: centerXAnchor),
            // The page centres the cat and the title together; the title is
            // about 40 points tall with its gap, so the cat sits that much
            // above the middle by half.
            cat.centerYAnchor.constraint(equalTo: centerYAnchor, constant: -20),
            word.topAnchor.constraint(equalTo: cat.bottomAnchor, constant: 10),
            word.centerXAnchor.constraint(equalTo: centerXAnchor),
            spinner.topAnchor.constraint(equalTo: word.bottomAnchor, constant: 18),
            spinner.centerXAnchor.constraint(equalTo: centerXAnchor),
        ])
        spinner.startAnimating()
        UIView.animate(withDuration: 0.4, delay: Self.spinnerDelay, options: [.allowUserInteraction]) {
            self.spinner.alpha = 1
        }
    }

    @available(*, unavailable) required init?(coder: NSCoder) { fatalError() }

    /// The page's splash: `min(52vw, 220px)`.
    static let catMaxWidth: CGFloat = 220
    static let spinnerDelay: TimeInterval = 2.5

    /// Fades away and leaves the view tree. Safe to call twice.
    func dismiss() {
        guard !hiding else { return }
        hiding = true
        UIView.animate(withDuration: 0.25, animations: { self.alpha = 0 },
                       completion: { _ in self.removeFromSuperview() })
    }
}
