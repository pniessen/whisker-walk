import Foundation
import WebKit

/// Serves the bundled game to the web view for `whiskerwalk://app/...`.
/// Every answer comes from `root` (the app's `web` folder); anything else is
/// a 404. Files are small and local, so they are read synchronously.
@MainActor
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    private let root: URL

    init(root: URL) {
        self.root = root
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: any WKURLSchemeTask) {
        guard let requestURL = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }
        guard let fileURL = WebRoot.fileURL(for: requestURL, root: root),
              let data = try? Data(contentsOf: fileURL) else {
            respond(urlSchemeTask, url: requestURL, status: 404, type: "text/plain", data: Data("Not found".utf8))
            return
        }
        respond(urlSchemeTask, url: requestURL, status: 200,
                type: WebRoot.mimeType(forExtension: fileURL.pathExtension), data: data)
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: any WKURLSchemeTask) {
        // Nothing to cancel: start(_:) answers synchronously.
    }

    private func respond(_ task: any WKURLSchemeTask, url: URL, status: Int, type: String, data: Data) {
        let headers = [
            "Content-Type": type,
            "Content-Length": String(data.count),
            "Cache-Control": "no-cache",
        ]
        guard let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1",
                                             headerFields: headers) else {
            task.didFailWithError(URLError(.cannotParseResponse))
            return
        }
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }
}
