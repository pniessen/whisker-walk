import Foundation
import UniformTypeIdentifiers

/// Maps a `whiskerwalk://app/...` request to a file inside the bundled game
/// (the `web` folder), and names its content type.
enum WebRoot {
    /// The file a request should be answered with, or nil (answer 404).
    ///
    /// Only `whiskerwalk://app/` requests are served. The query and fragment
    /// are ignored (`?perf` still loads index.html), percent-encoding is
    /// decoded, `/` means index.html, and nothing outside `root` is ever
    /// returned, however the path is spelled.
    static func fileURL(for requestURL: URL, root: URL) -> URL? {
        guard requestURL.scheme == AppScheme.scheme, requestURL.host == AppScheme.host else { return nil }

        // URL.path is already percent-decoded and carries no query/fragment.
        var relative = requestURL.path
        while relative.hasPrefix("/") { relative.removeFirst() }
        if relative.isEmpty { relative = "index.html" }

        let base = root.standardizedFileURL
        let candidate = base.appendingPathComponent(relative).standardizedFileURL
        let basePath = base.path.hasSuffix("/") ? base.path : base.path + "/"
        guard candidate.path.hasPrefix(basePath) else { return nil }

        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: candidate.path, isDirectory: &isDirectory),
              !isDirectory.boolValue else { return nil }
        return candidate
    }

    /// The Content-Type for a file extension. JavaScript must be
    /// text/javascript or the browser refuses to run the game's modules.
    static func mimeType(forExtension ext: String) -> String {
        let lower = ext.lowercased()
        if let known = known[lower] { return known }
        return UTType(filenameExtension: lower)?.preferredMIMEType ?? "application/octet-stream"
    }

    private static let known: [String: String] = [
        "html": "text/html",
        "js": "text/javascript",
        "mjs": "text/javascript",
        "css": "text/css",
        "json": "application/json",
        "webmanifest": "application/manifest+json",
        "svg": "image/svg+xml",
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "webp": "image/webp",
        "wasm": "application/wasm",
        "mp3": "audio/mpeg",
        "ogg": "audio/ogg",
        "wav": "audio/wav",
        "m4a": "audio/mp4",
        "woff2": "font/woff2",
    ]
}
