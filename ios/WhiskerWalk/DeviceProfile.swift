import UIKit

/// What the game is told about the device it is running on, so it can choose
/// its graphics for the hardware instead of finding out by stuttering.
///
/// A web page cannot see any of this: Safari does not say which iPad it is
/// on, how much memory it has, whether it is running hot, or whether Low
/// Power Mode has halved the display's refresh. The app can, so it hands the
/// page one small object before the game boots (`bootScript`) and an event
/// whenever something changes (`eventScript`). The game's side is
/// `src/render/deviceprofile.js`; in Safari and on desktop the object is
/// simply absent and the game behaves as it always has.
///
/// Everything here is a pure function of plain values, so it is unit-tested
/// without a web view. Reading the real device is `current()`, at the bottom.
struct DeviceProfile: Equatable, Sendable {
    /// The hardware model identifier, for example `iPad7,11` (an iPad 7th
    /// generation) or `iPhone18,1`. Not the marketing name: the identifier is
    /// what says which chip is inside.
    var model: String
    /// Physical memory in GB, to one decimal (a "3 GB" iPad reports 2.9).
    var memoryGB: Double
    /// `nominal`, `fair`, `serious` or `critical`.
    var thermal: String
    /// Low Power Mode. It holds the display at 30 frames a second, which the
    /// game would otherwise have to guess from its frame times.
    var lowPower: Bool
    /// Whether the device can play the game's haptics (Haptics.swift): true
    /// on an iPhone, false on an iPad, which has no Taptic Engine. The page
    /// sends nothing, and offers no Vibration switch, where it is false.
    var haptics: Bool

    /// The name of the object the page reads, and of the event it listens for.
    static let globalName = "__whiskerDevice"
    static let eventName = "whisker-device"

    init(model: String, memoryBytes: UInt64, thermal: ProcessInfo.ThermalState, lowPower: Bool, haptics: Bool = false) {
        self.model = Self.cleanModel(model)
        self.memoryGB = Self.memoryGB(bytes: memoryBytes)
        self.thermal = Self.thermalName(thermal)
        self.lowPower = lowPower
        self.haptics = haptics
    }

    /// A model identifier is letters, digits and a comma. Anything else is
    /// dropped (and the length capped), so whatever the system returns, the
    /// page only ever sees a short plain word.
    static func cleanModel(_ raw: String) -> String {
        String(raw.filter { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "," || $0 == "-" || $0 == "_") }.prefix(32))
    }

    static func memoryGB(bytes: UInt64) -> Double {
        (Double(bytes) / 1_073_741_824 * 10).rounded() / 10
    }

    static func thermalName(_ state: ProcessInfo.ThermalState) -> String {
        switch state {
        case .nominal: return "nominal"
        case .fair: return "fair"
        case .serious: return "serious"
        case .critical: return "critical"
        @unknown default: return "nominal"
        }
    }

    /// The profile as JSON, keys in a fixed order. `memoryWarning` is added
    /// only to the event iOS's memory warning sends.
    ///
    /// Written out by hand rather than through JSONSerialization, which
    /// prints 2.9 as 2.8999999999999999. That is safe because nothing here
    /// needs escaping: the model is cleaned to letters, digits and a comma
    /// (`cleanModel`), the thermal state is one of four fixed words, and the
    /// rest are a number and booleans.
    func json(memoryWarning: Bool = false) -> String {
        let warning = memoryWarning ? #""memoryWarning":true,"# : ""
        let memory = String(format: "%.1f", memoryGB)
        return #"{"haptics":\#(haptics),"lowPower":\#(lowPower),"memoryGB":\#(memory),\#(warning)"model":"\#(model)","thermal":"\#(thermal)"}"#
    }

    /// Runs at document start, before any of the game's own code: sets the
    /// one frozen object the game reads when it boots.
    func bootScript() -> String {
        "window.\(Self.globalName) = Object.freeze(\(json()));"
    }

    /// Runs whenever something changes while the game is open: replaces the
    /// object (so a later read is current) and tells the page with a
    /// `whisker-device` event carrying the new values.
    func eventScript(memoryWarning: Bool = false) -> String {
        """
        (function () {
          window.\(Self.globalName) = Object.freeze(\(json()));
          window.dispatchEvent(new CustomEvent('\(Self.eventName)', { detail: Object.freeze(\(json(memoryWarning: memoryWarning))) }));
        })();
        """
    }

    // MARK: The real device

    /// `utsname.machine`. On the simulator that is the Mac's architecture, so
    /// the simulated device's identifier is read from the environment instead.
    static func modelIdentifier() -> String {
        if let simulated = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] {
            return simulated
        }
        var system = utsname()
        uname(&system)
        return withUnsafeBytes(of: &system.machine) { raw in
            String(decoding: raw.prefix { $0 != 0 }, as: UTF8.self)
        }
    }

    /// On the main actor because the idiom (iPhone or iPad) is UIKit's.
    @MainActor
    static func current() -> DeviceProfile {
        let info = ProcessInfo.processInfo
        return DeviceProfile(model: modelIdentifier(), memoryBytes: info.physicalMemory,
                             thermal: info.thermalState, lowPower: info.isLowPowerModeEnabled,
                             haptics: HapticKind.deviceSupports(UIDevice.current.userInterfaceIdiom))
    }
}
