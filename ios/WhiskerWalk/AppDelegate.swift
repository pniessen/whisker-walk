import AVFoundation
import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Ambient: the iPhone's silent switch mutes the game, like most casual
        // games, and it mixes with music already playing instead of stopping it.
        try? AVAudioSession.sharedInstance().setCategory(.ambient)
        // Start the game's web view loading now, before the window exists
        // (GameViewController.prewarm), so the first seconds overlap the
        // system's own launch work.
        GameViewController.prewarm()
        return true
    }
}
