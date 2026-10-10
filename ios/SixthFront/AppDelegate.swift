import AVFoundation
import UIKit

// Sixth Front for iPhone and iPad: one full-screen view running the game (GameViewController).
@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // game sound mixes with music from other apps and follows the silent switch, like other games
        try? AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        // the screen stays on while you play
        application.isIdleTimerDisabled = true

        let window = UIWindow(frame: UIScreen.main.bounds)
        window.backgroundColor = GameViewController.background
        window.rootViewController = GameViewController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        (window?.rootViewController as? GameViewController)?.saveNow()
    }

    func applicationWillTerminate(_ application: UIApplication) {
        (window?.rootViewController as? GameViewController)?.saveNow()
    }
}
