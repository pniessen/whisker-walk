import Foundation

/// The app's own URL scheme. The bundled game is served from
/// `whiskerwalk://app/`, which gives it one stable origin: its localStorage
/// save lives under that origin and survives launches and reinstalls.
enum AppScheme {
    static let scheme = "whiskerwalk"
    static let host = "app"
    static let startURL = URL(string: "\(scheme)://\(host)/index.html")!
}
