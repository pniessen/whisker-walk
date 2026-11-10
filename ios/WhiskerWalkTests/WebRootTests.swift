import XCTest
@testable import WhiskerWalk

/// What the app's URL scheme may serve, and as what. A wrong answer here is a
/// blank screen (a module served with the wrong type) or a file from outside
/// the bundled game reaching the page.
final class WebRootTests: XCTestCase {
    private var root: URL!

    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory
            .appendingPathComponent("webroot-\(UUID().uuidString)", isDirectory: true)
        let fm = FileManager.default
        try fm.createDirectory(at: root.appendingPathComponent("assets"), withIntermediateDirectories: true)
        try fm.createDirectory(at: root.appendingPathComponent("places"), withIntermediateDirectories: true)
        for name in ["index.html", "assets/app-1.js", "places/park.jpg", "my file.json"] {
            try Data("x".utf8).write(to: root.appendingPathComponent(name))
        }
        // A real file just outside the root: the traversal tests must not reach it.
        try Data("secret".utf8).write(to: root.deletingLastPathComponent().appendingPathComponent("Info.plist"))
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: root)
    }

    private func f(_ string: String) -> URL? {
        WebRoot.fileURL(for: URL(string: string)!, root: root)?.standardizedFileURL
    }

    private func file(_ relative: String) -> URL {
        root.appendingPathComponent(relative).standardizedFileURL
    }

    func test_root_and_slash_serve_index() {
        XCTAssertEqual(f("whiskerwalk://app/"), file("index.html"))
        XCTAssertEqual(f("whiskerwalk://app"), file("index.html"))
    }

    func test_query_and_fragment_ignored() {
        XCTAssertEqual(f("whiskerwalk://app/index.html?perf#x"), file("index.html"))
        XCTAssertEqual(f("whiskerwalk://app/?perf"), file("index.html"))
    }

    func test_nested_asset() {
        XCTAssertEqual(f("whiskerwalk://app/assets/app-1.js"), file("assets/app-1.js"))
        XCTAssertEqual(f("whiskerwalk://app/places/park.jpg"), file("places/park.jpg"))
    }

    func test_percent_encoded_name() {
        XCTAssertEqual(f("whiskerwalk://app/my%20file.json"), file("my file.json"))
    }

    func test_dotdot_never_escapes_root() {
        XCTAssertNil(f("whiskerwalk://app/../Info.plist"))
        XCTAssertNil(f("whiskerwalk://app/assets/%2E%2E/%2E%2E/Info.plist"))
        XCTAssertNil(f("whiskerwalk://app/assets/..%2F..%2FInfo.plist"))
    }

    func test_directory_is_not_a_file() {
        XCTAssertNil(f("whiskerwalk://app/assets"))
        XCTAssertNil(f("whiskerwalk://app/assets/"))
    }

    func test_missing_file_is_nil() {
        XCTAssertNil(f("whiskerwalk://app/nope.js"))
    }

    func test_wrong_scheme_or_host_is_nil() {
        XCTAssertNil(f("https://app/index.html"))
        XCTAssertNil(f("whiskerwalk://evil/index.html"))
    }

    func test_mime_types() {
        XCTAssertEqual(WebRoot.mimeType(forExtension: "js"), "text/javascript")
        XCTAssertEqual(WebRoot.mimeType(forExtension: "mjs"), "text/javascript")
        XCTAssertEqual(WebRoot.mimeType(forExtension: "html"), "text/html")
        XCTAssertEqual(WebRoot.mimeType(forExtension: "css"), "text/css")
        XCTAssertEqual(WebRoot.mimeType(forExtension: "json"), "application/json")
        XCTAssertEqual(WebRoot.mimeType(forExtension: "webmanifest"), "application/manifest+json")
        XCTAssertEqual(WebRoot.mimeType(forExtension: "svg"), "image/svg+xml")
        XCTAssertEqual(WebRoot.mimeType(forExtension: "JPG"), "image/jpeg")
        XCTAssertEqual(WebRoot.mimeType(forExtension: "wasm"), "application/wasm")
        XCTAssertEqual(WebRoot.mimeType(forExtension: "zzz"), "application/octet-stream")
    }

    func test_start_url() {
        XCTAssertEqual(AppScheme.startURL.absoluteString, "whiskerwalk://app/index.html")
        XCTAssertEqual(AppScheme.scheme, "whiskerwalk")
        XCTAssertEqual(AppScheme.host, "app")
    }
}
