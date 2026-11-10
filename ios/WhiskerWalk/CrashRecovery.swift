import Foundation

/// What to do after iOS ends the web content process (memory pressure on an
/// older iPad, usually while the app is in the background).
enum CrashRecovery: Equatable {
    /// Reload the game page the web view was showing.
    case reload
    /// Load the game from the start: the process died before the game page
    /// had loaded, so a reload would leave a blank screen.
    case loadStart

    static func action(currentURL: URL?) -> CrashRecovery {
        currentURL?.scheme == AppScheme.scheme ? .reload : .loadStart
    }
}
