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

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(GameSchemeHandler(), forURLScheme: GameSchemeHandler.scheme)
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.websiteDataStore = .default()
        config.userContentController.add(StoreBridge(store: store), name: "sfstore")
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
    }

    // full screen, landscape, and swipes from the screen edges go to the game first
    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }

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
