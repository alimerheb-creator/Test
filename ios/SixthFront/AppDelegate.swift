import AVFoundation
import UIKit

// Sixth Front for iPhone and iPad: one full-screen view running the game (GameViewController).
@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // the game's sound plays even with the silent switch on (an "ambient" app is muted by it, which made the
        // game seem to have no sound), and mixes with music from other apps
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
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

    // back in front: the sound starts again (iOS stops it while another app or a call has the speaker)
    func applicationDidBecomeActive(_ application: UIApplication) {
        try? AVAudioSession.sharedInstance().setActive(true)
        (window?.rootViewController as? GameViewController)?.resumeAudio()
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        (window?.rootViewController as? GameViewController)?.saveNow()
    }

    func applicationWillTerminate(_ application: UIApplication) {
        (window?.rootViewController as? GameViewController)?.saveNow()
    }
}
