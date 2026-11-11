import Foundation

/// The app's own URL scheme. The bundled game is served from
/// `whiskerwalk://app/`, which gives it one stable origin: its localStorage
/// save lives under that origin and survives launches and reinstalls.
enum AppScheme {
    static let scheme = "whiskerwalk"
    static let host = "app"
    static let startURL = URL(string: "\(scheme)://\(host)/index.html")!

    /// The start page with the game's testing switches on it, for looking at
    /// one graphics rung on a device too fast to reach it by itself:
    ///
    ///     xcrun devicectl device process launch --device <name> \
    ///         com.pniessen.WhiskerWalk -rung 4 -perf YES
    ///     xcrun simctl launch booted com.pniessen.WhiskerWalk -rung 5 -perf YES
    ///
    /// `rung` becomes `?rung=N` (graphics held on rung N for this launch,
    /// nothing remembered) and `perf` becomes `?perf` (the readout). Anything
    /// that is not a small whole number is ignored, so the page never sees
    /// text it did not expect. With neither, this is `startURL` exactly.
    static func startURL(rung: String?, perf: Bool) -> URL {
        var query: [String] = []
        if let rung, (1...2).contains(rung.count), rung.allSatisfy({ $0.isASCII && $0.isNumber }) {
            query.append("rung=\(rung)")
        }
        if perf { query.append("perf") }
        guard !query.isEmpty else { return startURL }
        return URL(string: "\(startURL.absoluteString)?\(query.joined(separator: "&"))")!
    }

    /// What this launch loads: `startURL`, plus any switches given as launch
    /// arguments (they are read through UserDefaults' argument domain).
    static let launchURL = startURL(rung: UserDefaults.standard.string(forKey: "rung"),
                                    perf: UserDefaults.standard.bool(forKey: "perf"))
}
