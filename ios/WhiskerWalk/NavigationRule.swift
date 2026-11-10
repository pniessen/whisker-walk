import Foundation

/// What to do with a page navigation (a link, a redirect, window.open).
/// Network requests the game makes itself, such as walking together, are not
/// navigations and never pass through here.
enum NavigationRule: Equatable {
    /// Load it in the game's web view.
    case allow
    /// Hand it to iOS: web links open in Safari, mailto/tel in their apps.
    case openExternally
    /// Refuse it.
    case cancel

    static func decide(_ url: URL) -> NavigationRule {
        switch url.scheme?.lowercased() {
        case AppScheme.scheme, "about": return .allow
        case "http", "https", "mailto", "tel": return .openExternally
        default: return .cancel
        }
    }
}
