import UIKit
import WebKit

/// The bundled game, full screen, with nothing browser-like around it: no
/// scrolling or bounce, no page zoom, no swipe back, no link previews, no
/// status bar, and screen-edge swipes go to the game first.
final class GameViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, UIScrollViewDelegate {
    private var webView: WKWebView!
    private var expiryBanner: UIButton?

    /// The game's splash colour (#1c2431), so nothing flashes white.
    private let background = UIColor(named: "LaunchBackground") ?? .black

    /// Styles only the app adds to the game's page:
    /// - long-press callouts and text selection off, except where people type
    ///   (pet name, save code);
    /// - the home base's sheets (menu, Save, Settings…) keep clear of the
    ///   Dynamic Island and rounded corners. In Safari the browser bar does
    ///   that; full screen nothing does. The game's own padding (32px, 20px on
    ///   phones) still applies whenever it is larger than the safe area.
    private static let touchCSS = """
        html { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
        input, textarea, [contenteditable] { -webkit-touch-callout: default; -webkit-user-select: auto; user-select: auto; }
        .homebase-scroll {
          padding-top: max(32px, calc(env(safe-area-inset-top) + 8px));
          padding-left: max(20px, env(safe-area-inset-left));
          padding-right: max(20px, env(safe-area-inset-right));
        }
        @media (max-width: 480px) {
          .homebase-scroll {
            padding-top: max(20px, calc(env(safe-area-inset-top) + 8px));
            padding-left: max(14px, env(safe-area-inset-left));
            padding-right: max(14px, env(safe-area-inset-right));
          }
        }
        """

    override func loadView() {
        let root = Bundle.main.url(forResource: "web", withExtension: nil)!

        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundleSchemeHandler(root: root), forURLScheme: AppScheme.scheme)
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let css = Self.touchCSS.replacingOccurrences(of: "\n", with: " ")
        let script = """
            (function () {
              var style = document.createElement('style');
              style.textContent = \(String(reflecting: css));
              document.head.appendChild(style);
            })();
            """
        config.userContentController.addUserScript(
            WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: true))

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = background
        webView.scrollView.backgroundColor = background
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.delegate = self
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        #if DEBUG
        webView.isInspectable = true // Safari → Develop menu, for debugging only
        #endif
        self.webView = webView

        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        webView.load(URLRequest(url: AppScheme.startURL))
        NotificationCenter.default.addObserver(self, selector: #selector(appBecameActive),
                                               name: UIApplication.didBecomeActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(appWillResignActive),
                                               name: UIApplication.willResignActiveNotification, object: nil)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        showExpiryWarningIfDue()
    }

    // MARK: Expiry warning

    @objc private func appBecameActive() {
        showExpiryWarningIfDue()
    }

    /// Leaving the app hides the banner, so it is shown fresh (for its full
    /// 12 seconds) next time.
    @objc private func appWillResignActive() {
        if let banner = expiryBanner {
            expiryBanner = nil
            banner.removeFromSuperview()
        }
    }

    /// In the app's last day, a friendly banner over the top of the game
    /// (tap to hide; it goes by itself after 12 seconds and comes back each
    /// time the app is opened).
    private func showExpiryWarningIfDue() {
        var expiry = ExpiryWarning.installedExpiry()
        #if DEBUG
        // Preview on the simulator, which has no profile:
        //   xcrun simctl launch booted com.pniessen.WhiskerWalk -PreviewExpiryWarning YES
        if UserDefaults.standard.bool(forKey: "PreviewExpiryWarning") {
            expiry = Date().addingTimeInterval(20 * 60 * 60)
        }
        #endif
        guard expiryBanner == nil, let text = ExpiryWarning.message(expiry: expiry, now: Date()) else { return }

        var config = UIButton.Configuration.filled()
        config.attributedTitle = AttributedString("🐾 " + text, attributes: AttributeContainer([
            .font: UIFont.systemFont(ofSize: 16, weight: .semibold).rounded,
        ]))
        config.baseBackgroundColor = UIColor(red: 1.0, green: 0.84, blue: 0.48, alpha: 0.97)
        config.baseForegroundColor = UIColor(red: 0.11, green: 0.14, blue: 0.19, alpha: 1)
        config.cornerStyle = .capsule
        config.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 20, bottom: 12, trailing: 20)
        config.titleAlignment = .center
        config.titleLineBreakMode = .byWordWrapping
        let banner = UIButton(configuration: config, primaryAction: UIAction { [weak self] _ in
            self?.hideExpiryWarning()
        })
        banner.translatesAutoresizingMaskIntoConstraints = false
        banner.accessibilityHint = "Hides this message"
        banner.layer.shadowColor = UIColor.black.cgColor
        banner.layer.shadowOpacity = 0.3
        banner.layer.shadowRadius = 8
        banner.layer.shadowOffset = CGSize(width: 0, height: 3)
        banner.alpha = 0
        view.addSubview(banner)
        let guide = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            banner.centerXAnchor.constraint(equalTo: guide.centerXAnchor),
            banner.topAnchor.constraint(equalTo: guide.topAnchor, constant: 12),
            banner.widthAnchor.constraint(lessThanOrEqualTo: guide.widthAnchor, constant: -32),
            banner.widthAnchor.constraint(lessThanOrEqualToConstant: 520),
        ])
        expiryBanner = banner
        UIView.animate(withDuration: 0.3) { banner.alpha = 1 }
        Task { @MainActor [weak self, weak banner] in
            try? await Task.sleep(for: .seconds(12))
            if let banner, self?.expiryBanner === banner { self?.hideExpiryWarning() }
        }
    }

    private func hideExpiryWarning() {
        guard let banner = expiryBanner else { return }
        expiryBanner = nil
        UIView.animate(withDuration: 0.3, animations: { banner.alpha = 0 }, completion: { _ in banner.removeFromSuperview() })
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        // WebKit creates its pinch recognizer lazily; keep it off.
        webView.scrollView.pinchGestureRecognizer?.isEnabled = false
    }

    // MARK: Full screen

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }

    // MARK: UIScrollViewDelegate

    func viewForZooming(in scrollView: UIScrollView) -> UIView? { nil }

    // MARK: WKNavigationDelegate

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        switch NavigationRule.decide(url) {
        case .allow:
            decisionHandler(.allow)
        case .openExternally:
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        case .cancel:
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.scrollView.pinchGestureRecognizer?.isEnabled = false
    }

    /// iOS can end the web content process while the app is in the background
    /// (memory pressure on an older iPad). Without this the game comes back as
    /// a blank screen; with it, the game starts again with its save intact.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        switch CrashRecovery.action(currentURL: webView.url) {
        case .reload: webView.reload()
        case .loadStart: webView.load(URLRequest(url: AppScheme.startURL))
        }
    }

    // MARK: WKUIDelegate

    /// target="_blank" links and window.open: never a second web view.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, NavigationRule.decide(url) == .openExternally {
            UIApplication.shared.open(url)
        }
        return nil
    }
}

private extension UIFont {
    /// The same size and weight in SF Rounded, to match the game's friendly type.
    var rounded: UIFont {
        guard let descriptor = fontDescriptor.withDesign(.rounded) else { return self }
        return UIFont(descriptor: descriptor, size: pointSize)
    }
}
