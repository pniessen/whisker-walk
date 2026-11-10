import Foundation

/// The free signing this app uses runs out after 7 days, and then the app
/// stops opening. In its last day the app says so, so a missed refresh is
/// noticed in time. Not earlier: the Mac's nightly refresh renews on the
/// last night, so an earlier banner would show every week while all is well.
enum ExpiryWarning {
    /// Warn with this much time left.
    static let warnWithin: TimeInterval = 24 * 60 * 60

    /// The expiry in a provisioning profile: a plist inside a signature.
    static func expiry(fromProfile data: Data) -> Date? {
        guard let start = data.range(of: Data("<?xml".utf8)),
              let end = data.range(of: Data("</plist>".utf8), in: start.lowerBound..<data.endIndex)
        else { return nil }
        let plist = data.subdata(in: start.lowerBound..<end.upperBound)
        let dict = try? PropertyListSerialization.propertyList(from: plist, format: nil) as? [String: Any]
        return dict?["ExpirationDate"] as? Date
    }

    /// This install's expiry, or nil where there is no profile (the simulator).
    static func installedExpiry(bundle: Bundle = .main) -> Date? {
        guard let url = bundle.url(forResource: "embedded", withExtension: "mobileprovision"),
              let data = try? Data(contentsOf: url)
        else { return nil }
        return expiry(fromProfile: data)
    }

    /// The banner text, or nil while more than a day is left.
    static func message(expiry: Date?, now: Date, calendar: Calendar = .current) -> String? {
        guard let expiry, expiry.timeIntervalSince(now) <= warnWithin else { return nil }
        let when = calendar.isDate(expiry, inSameDayAs: now) ? "today" : "tomorrow"
        return "This game needs a refresh soon — ask a grown-up! It stops opening \(when)."
    }
}
