import XCTest
@testable import WhiskerWalk

/// What the app tells the game about the device: one small, plain object
/// before the game boots, and an event when something changes.
final class DeviceProfileTests: XCTestCase {
    private let iPad7 = DeviceProfile(model: "iPad7,11", memoryBytes: 3_115_663_360,
                                      thermal: .nominal, lowPower: false)

    private func decoded(_ json: String) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any])
    }

    func test_the_profile_is_plain_json_with_the_four_facts() throws {
        XCTAssertEqual(iPad7.json(), #"{"lowPower":false,"memoryGB":2.9,"model":"iPad7,11","thermal":"nominal"}"#)
        let fields = try decoded(iPad7.json())
        XCTAssertEqual(fields["model"] as? String, "iPad7,11")
        XCTAssertEqual(fields["memoryGB"] as? Double, 2.9)
        XCTAssertEqual(fields["thermal"] as? String, "nominal")
        XCTAssertEqual(fields["lowPower"] as? Bool, false)
        XCTAssertNil(fields["memoryWarning"])
    }

    func test_memory_is_gigabytes_to_one_decimal() {
        XCTAssertEqual(DeviceProfile.memoryGB(bytes: 3_115_663_360), 2.9)   // a "3 GB" iPad
        XCTAssertEqual(DeviceProfile.memoryGB(bytes: 4 * 1_073_741_824), 4.0)
        XCTAssertEqual(DeviceProfile.memoryGB(bytes: 8_589_934_592), 8.0)
        XCTAssertEqual(DeviceProfile.memoryGB(bytes: 0), 0.0)
        let eight = DeviceProfile(model: "iPhone18,1", memoryBytes: 8_589_934_592, thermal: .nominal, lowPower: false)
        XCTAssertTrue(eight.json().contains(#""memoryGB":8.0,"#))
    }

    func test_every_thermal_state_has_its_name() {
        XCTAssertEqual(DeviceProfile.thermalName(.nominal), "nominal")
        XCTAssertEqual(DeviceProfile.thermalName(.fair), "fair")
        XCTAssertEqual(DeviceProfile.thermalName(.serious), "serious")
        XCTAssertEqual(DeviceProfile.thermalName(.critical), "critical")
    }

    func test_the_model_is_only_ever_a_short_plain_word() {
        XCTAssertEqual(DeviceProfile.cleanModel("iPad7,11"), "iPad7,11")
        XCTAssertEqual(DeviceProfile.cleanModel("iPhone18,1"), "iPhone18,1")
        XCTAssertEqual(DeviceProfile.cleanModel("x\"); alert(1); (\""), "xalert1")
        XCTAssertEqual(DeviceProfile.cleanModel("</script>"), "script")
        XCTAssertEqual(DeviceProfile.cleanModel(String(repeating: "a", count: 100)).count, 32)
        let odd = DeviceProfile(model: "i\u{2028}Pad\n7,11", memoryBytes: 0, thermal: .fair, lowPower: true)
        XCTAssertEqual(odd.model, "iPad7,11")
    }

    func test_the_boot_script_sets_one_frozen_object() {
        XCTAssertEqual(iPad7.bootScript(),
                       #"window.__whiskerDevice = Object.freeze({"lowPower":false,"memoryGB":2.9,"model":"iPad7,11","thermal":"nominal"});"#)
    }

    func test_a_change_replaces_the_object_and_sends_the_event() throws {
        let hot = DeviceProfile(model: "iPad7,11", memoryBytes: 3_115_663_360, thermal: .serious, lowPower: true)
        let script = hot.eventScript()
        XCTAssertTrue(script.contains(#"window.__whiskerDevice = Object.freeze({"lowPower":true,"memoryGB":2.9,"model":"iPad7,11","thermal":"serious"});"#))
        XCTAssertTrue(script.contains(#"new CustomEvent('whisker-device', { detail: Object.freeze({"lowPower":true,"memoryGB":2.9,"model":"iPad7,11","thermal":"serious"}) })"#))
        XCTAssertFalse(script.contains("memoryWarning"))
    }

    func test_a_memory_warning_is_on_the_event_and_not_on_the_object() throws {
        let script = iPad7.eventScript(memoryWarning: true)
        XCTAssertTrue(script.contains(#"window.__whiskerDevice = Object.freeze({"lowPower":false,"memoryGB":2.9,"model":"iPad7,11","thermal":"nominal"});"#))
        XCTAssertTrue(script.contains(#"detail: Object.freeze({"lowPower":false,"memoryGB":2.9,"memoryWarning":true,"model":"iPad7,11","thermal":"nominal"})"#))
        let fields = try decoded(iPad7.json(memoryWarning: true))
        XCTAssertEqual(fields["memoryWarning"] as? Bool, true)
    }

    func test_the_real_device_reads_as_a_sane_profile() {
        let now = DeviceProfile.current()
        XCTAssertFalse(now.model.isEmpty)
        XCTAssertEqual(now.model, DeviceProfile.cleanModel(now.model))
        XCTAssertGreaterThan(now.memoryGB, 0.5)
        XCTAssertTrue(["nominal", "fair", "serious", "critical"].contains(now.thermal))
    }
}
