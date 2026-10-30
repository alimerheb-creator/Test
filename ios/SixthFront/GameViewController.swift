import CoreMotion
import UIKit
import WebKit

/// The game runs in a WKWebView, the same game files as the browser, Android and Windows versions. They are
/// bundled in www/ and served by GameSchemeHandler at sixthfront://localhost/, a proper origin, so fetch(),
/// localStorage, WebGL 2 and Web Audio work as in a browser. window.SixthFrontStore (Store) keeps the mod list
/// and settings in files on the device, like the Android app does.
final class GameViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    static let background = UIColor(red: 13 / 255, green: 16 / 255, blue: 18 / 255, alpha: 1)
    private static let startURL = URL(string: "\(GameSchemeHandler.scheme)://localhost/index.html")!

    private let store = Store()
    private var web: WKWebView!
    private let motion = CMMotionManager()

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(GameSchemeHandler(), forURLScheme: GameSchemeHandler.scheme)
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.websiteDataStore = .default()
        config.userContentController.add(StoreBridge(store: store), name: "sfstore")
        config.userContentController.add(MotionBridge(owner: self), name: "sfmotion")
        installStoreScript(config.userContentController)

        web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = Self.background
        web.scrollView.backgroundColor = Self.background
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.scrollView.pinchGestureRecognizer?.isEnabled = false
        web.allowsLinkPreview = false
        web.allowsBackForwardNavigationGestures = false
        web.navigationDelegate = self
        web.uiDelegate = self
        if #available(iOS 16.4, *) { web.isInspectable = true }
        view = web
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        web.load(URLRequest(url: Self.startURL))
        reportStartup()
    }

    /// For the first minute, logs whether the game has started (and its first script error, if any), so a test
    /// run on a simulator can tell from the log that the game came up.
    private func reportStartup(_ n: Int = 0) {
        guard n < 12 else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
            guard let self = self else { return }
            let js = "JSON.stringify({ state: window.__game ? window.__game.state : null, mods: window.__game && window.__game.mods ? window.__game.mods.list.length : 0, error: window.__sfError || null })"
            self.web.evaluateJavaScript(js) { result, _ in
                NSLog("SixthFront: %@", String(describing: result ?? "no page"))
            }
            self.reportStartup(n + 1)
        }
    }

    // full screen, landscape, and swipes from the screen edges go to the game first
    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }

    // MARK: - the motion sensor, for flying by tilting the device

    /// A page in an app gets no motion events of its own, so the app reads the sensor (Core Motion: which way is
    /// down, in the device's own frame) and hands the game which way is up, and how the screen is turned, 60 times
    /// a second, while the game wants it (it says "start" when you pick TILT).
    func startMotion() {
        guard motion.isDeviceMotionAvailable, !motion.isDeviceMotionActive else { return }
        motion.deviceMotionUpdateInterval = 1.0 / 60.0
        motion.startDeviceMotionUpdates(to: .main) { [weak self] data, _ in
            guard let self = self, let g = data?.gravity, let web = self.web else { return }
            let js = String(format: "window.__sfMotion&&window.__sfMotion(%.4f,%.4f,%.4f,%d)", -g.x, -g.y, -g.z, self.screenAngle())
            web.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    func stopMotion() {
        if motion.isDeviceMotionActive { motion.stopDeviceMotionUpdates() }
    }

    /// How far the screen is turned from upright, as a web page counts it (landscape with the home button or the
    /// side button on the right: 90)
    private func screenAngle() -> Int {
        let o: UIInterfaceOrientation
        if let scene = view.window?.windowScene { o = scene.interfaceOrientation } else { o = UIApplication.shared.statusBarOrientation }
        switch o {
        case .landscapeRight: return 90
        case .landscapeLeft: return 270
        case .portraitUpsideDown: return 180
        default: return 0
        }
    }

    /// (and if the page asks for the motion sensor itself, it may have it)
    @available(iOS 15.0, *)
    func webView(_ webView: WKWebView, requestDeviceOrientationAndMotionPermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }

    /// Writes anything the game saved that is still on its way to disk (the app is going to the background).
    func saveNow() {
        web?.evaluateJavaScript("try { window.dispatchEvent(new Event('pagehide')) } catch (e) {}", completionHandler: nil)
        store.flush()
    }

    /// The store's current contents go into every page the game loads (it reloads itself after mod changes).
    private func installStoreScript(_ controller: WKUserContentController) {
        controller.removeAllUserScripts()
        controller.addUserScript(WKUserScript(source: store.bootstrapScript(), injectionTime: .atDocumentStart,
                                              forMainFrameOnly: true))
        controller.addUserScript(WKUserScript(
            source: "addEventListener('error', function (e) { if (!window.__sfError) window.__sfError = String(e.message) + ' @ ' + e.filename + ':' + e.lineno; });",
            injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }

    // MARK: - navigation: stay inside the game, open web links in Safari

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { return decisionHandler(.cancel) }
        let mainFrame = navigationAction.targetFrame?.isMainFrame ?? true
        if url.scheme == GameSchemeHandler.scheme {
            if mainFrame { installStoreScript(webView.configuration.userContentController) }
            return decisionHandler(.allow)
        }
        if mainFrame, let scheme = url.scheme, scheme == "http" || scheme == "https" {
            UIApplication.shared.open(url)
            return decisionHandler(.cancel)
        }
        decisionHandler(.allow)
    }

    // the system can stop a page that uses a lot of memory; start the game again rather than show a blank screen
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        installStoreScript(webView.configuration.userContentController)
        webView.load(URLRequest(url: Self.startURL))
    }

    // MARK: - window.open, alert(), confirm() and prompt()

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, url.scheme == "http" || url.scheme == "https" {
            UIApplication.shared.open(url)
        }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(a, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(a, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let a = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        a.addTextField { $0.text = defaultText }
        a.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(a.textFields?.first?.text) })
        present(a, animated: true)
    }
}

/// "start" and "stop" from the game for the motion sensor (held weakly: the web view keeps its message handlers)
final class MotionBridge: NSObject, WKScriptMessageHandler {
    private weak var owner: GameViewController?

    init(owner: GameViewController) {
        self.owner = owner
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let op = message.body as? String else { return }
        if op == "start" { owner?.startMotion() } else if op == "stop" { owner?.stopMotion() }
    }
}
