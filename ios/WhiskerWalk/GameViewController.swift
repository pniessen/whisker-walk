import UIKit
import WebKit

/// The bundled game, full screen, with nothing browser-like around it: no
/// scrolling or bounce, no page zoom, no swipe back, no link previews, no
/// status bar, and screen-edge swipes go to the game first.
final class GameViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, UIScrollViewDelegate {
    private var webView: WKWebView!

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
        input, textarea, [contenteditable] { -webkit-user-select: auto; user-select: auto; }
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
        webView.reload()
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
