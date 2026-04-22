import UIKit
import WebKit

final class AppBridgeViewController: UIViewController {
    private enum Constants {
        static let defaultStartURLString = "https://www.coachai.es"
        static let userAgentToken = "CoachAI-iOSApp"
        static let webKitErrorDomain = "WebKitErrorDomain"
        static let frameLoadInterruptedCode = 102
        static let urlCancelledCode = NSURLErrorCancelled
        static let internalBaseDomains = ["coachai.com", "coachai.es"]
    }

    private lazy var initialURL: URL = {
        let configuredURL = (Bundle.main.object(forInfoDictionaryKey: "CoachAIInitialURL") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let rawValue = configuredURL?.isEmpty == false ? configuredURL! : Constants.defaultStartURLString

        guard let url = URL(string: rawValue) else {
            fatalError("Invalid CoachAIInitialURL value: \(rawValue)")
        }

        return url
    }()

    private lazy var webView: WKWebView = {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        configuration.userContentController.addUserScript(
            WKUserScript(
                source: injectedBridgeScript(),
                injectionTime: .atDocumentStart,
                forMainFrameOnly: false
            )
        )

        if #available(iOS 10.0, *) {
            configuration.mediaTypesRequiringUserActionForPlayback = []
        }

        if #available(iOS 14.0, *) {
            configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        }

        let existingApplicationName = configuration.applicationNameForUserAgent?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let userAgentParts = [existingApplicationName, Constants.userAgentToken]
            .compactMap { value -> String? in
                guard let value, !value.isEmpty else { return nil }
                return value
            }
        configuration.applicationNameForUserAgent = userAgentParts.joined(separator: " ")

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsLinkPreview = false
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.automaticallyAdjustsScrollIndicatorInsets = false

        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }

        return webView
    }()
    private var lastHandledNewWindowURL: String?

    override func viewDidLoad() {
        super.viewDidLoad()
        configureLayout()
        loadInitialURLIfNeeded()
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        log("safeAreaInsets changed -> \(string(from: view.safeAreaInsets))")
    }

    private func configureLayout() {
        view.backgroundColor = .black
        view.addSubview(webView)

        let safeArea = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: safeArea.topAnchor),
            webView.leadingAnchor.constraint(equalTo: safeArea.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: safeArea.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: safeArea.bottomAnchor),
        ])
    }

    private func loadInitialURLIfNeeded() {
        guard webView.url == nil else { return }

        var request = URLRequest(url: initialURL)
        request.timeoutInterval = 30

        log("Loading initial URL -> \(initialURL.absoluteString)")
        webView.load(request)
    }

    private func injectedBridgeScript() -> String {
        let payload: [String: Any] = [
            "platform": "ios",
            "embedded": true,
            "userAgentToken": Constants.userAgentToken,
            "allowedHosts": Array(resolvedInternalHosts()).sorted(),
        ]
        let payloadData = (try? JSONSerialization.data(withJSONObject: payload, options: [])) ?? Data("{}".utf8)
        let payloadString = String(data: payloadData, encoding: .utf8) ?? "{}"

        return """
        (function () {
          var payload = \(payloadString);
          window.__IS_IOS_APP__ = true;
          window.__COACHAI_NATIVE_SHELL__ = payload;

          var applyIOSFlags = function () {
            var root = document.documentElement;
            if (!root) { return false; }
            root.classList.add('ios-app', 'native-app', 'native-ios');
            root.dataset.coachaiNativeShell = 'ios';
            root.dataset.iosApp = 'true';
            return true;
          };

          if (!applyIOSFlags()) {
            document.addEventListener('DOMContentLoaded', applyIOSFlags, { once: true });
          }
        })();
        """
    }

    private func resolvedInternalHosts() -> Set<String> {
        var hosts = Set(Constants.internalBaseDomains)
        if let host = initialURL.host?.lowercased(), !host.isEmpty {
            hosts.insert(host)
        }
        return hosts
    }

    private func isInternalURL(_ url: URL) -> Bool {
        let scheme = (url.scheme ?? "").lowercased()

        switch scheme {
        case "", "about", "blob", "data", "file":
            return true
        case "http", "https":
            break
        default:
            return false
        }

        guard let host = url.host?.lowercased() else {
            return true
        }

        if let initialHost = initialURL.host?.lowercased(), host == initialHost {
            return true
        }

        return Constants.internalBaseDomains.contains { domain in
            host == domain || host.hasSuffix(".\(domain)")
        }
    }

    private func openExternally(_ url: URL) {
        log("Opening external URL -> \(url.absoluteString)")

        guard UIApplication.shared.canOpenURL(url) else {
            log("Cannot open external URL -> \(url.absoluteString)")
            return
        }

        UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }

    private func shouldIgnoreNavigationError(_ error: Error) -> Bool {
        let nsError = error as NSError

        if nsError.domain == Constants.webKitErrorDomain, nsError.code == Constants.frameLoadInterruptedCode {
            log("Ignoring WebKit redirect interruption (domain=\(nsError.domain), code=\(nsError.code))")
            return true
        }

        if nsError.domain == NSURLErrorDomain, nsError.code == Constants.urlCancelledCode {
            log("Ignoring URL cancellation during navigation (domain=\(nsError.domain), code=\(nsError.code))")
            return true
        }

        return false
    }

    private func log(_ message: String) {
        print("[AppBridge] \(message)")
    }

    private func navigationTypeName(_ navigationType: WKNavigationType) -> String {
        switch navigationType {
        case .linkActivated:
            return "linkActivated"
        case .formSubmitted:
            return "formSubmitted"
        case .backForward:
            return "backForward"
        case .reload:
            return "reload"
        case .formResubmitted:
            return "formResubmitted"
        case .other:
            return "other"
        @unknown default:
            return "unknown"
        }
    }

    private func string(from edgeInsets: UIEdgeInsets) -> String {
        "top=\(edgeInsets.top), left=\(edgeInsets.left), bottom=\(edgeInsets.bottom), right=\(edgeInsets.right)"
    }

    private func presentJavaScriptDialog(_ alertController: UIAlertController, fallback: @escaping () -> Void) {
        DispatchQueue.main.async {
            let presenter = self.presentedViewController ?? self

            guard presenter.viewIfLoaded?.window != nil else {
                fallback()
                return
            }

            presenter.present(alertController, animated: true, completion: nil)
        }
    }
}

extension AppBridgeViewController: WKNavigationDelegate {
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            log("Blocked navigation action without URL")
            decisionHandler(.cancel)
            return
        }

        let targetDescription = navigationAction.targetFrame?.isMainFrame == true ? "mainFrame" : "newWindow"
        log("Navigation action -> type=\(navigationTypeName(navigationAction.navigationType)) target=\(targetDescription) url=\(url.absoluteString)")

        if navigationAction.targetFrame == nil {
            lastHandledNewWindowURL = url.absoluteString

            if isInternalURL(url) {
                log("Loading target=_blank/window.open inside same WKWebView -> \(url.absoluteString)")
                webView.load(navigationAction.request)
            } else {
                openExternally(url)
            }

            decisionHandler(.cancel)
            return
        }

        if isInternalURL(url) {
            decisionHandler(.allow)
            return
        }

        openExternally(url)
        decisionHandler(.cancel)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse,
        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
        guard let responseURL = navigationResponse.response.url else {
            log("Blocked navigation response without URL")
            decisionHandler(.cancel)
            return
        }

        let statusCode = (navigationResponse.response as? HTTPURLResponse)?.statusCode
        log("Navigation response -> status=\(statusCode.map(String.init) ?? "-") url=\(responseURL.absoluteString)")

        if isInternalURL(responseURL) {
            decisionHandler(.allow)
            return
        }

        openExternally(responseURL)
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        log("didStartProvisionalNavigation -> \(webView.url?.absoluteString ?? initialURL.absoluteString)")
    }

    func webView(_ webView: WKWebView, didReceiveServerRedirectForProvisionalNavigation navigation: WKNavigation!) {
        log("didReceiveServerRedirectForProvisionalNavigation -> \(webView.url?.absoluteString ?? "unknown")")
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        log("didCommit -> \(webView.url?.absoluteString ?? "unknown")")
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        log("didFinish -> url=\(webView.url?.absoluteString ?? "unknown") title=\(webView.title ?? "-")")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if shouldIgnoreNavigationError(error) {
            return
        }

        log("didFail -> \(error.localizedDescription)")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if shouldIgnoreNavigationError(error) {
            return
        }

        log("didFailProvisionalNavigation -> \(error.localizedDescription)")
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        log("webViewWebContentProcessDidTerminate -> reloading current page")
        webView.reload()
    }

    @available(iOS 15.0, *)
    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        log("Granting media capture permission -> host=\(origin.host)")
        decisionHandler(.grant)
    }

    @available(iOS 15.0, *)
    func webView(
        _ webView: WKWebView,
        requestDeviceOrientationAndMotionPermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        log("Granting motion permission -> host=\(origin.host)")
        decisionHandler(.grant)
    }
}

extension AppBridgeViewController: WKUIDelegate {
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        guard let url = navigationAction.request.url else {
            log("createWebViewWith received request without URL")
            return nil
        }

        log("createWebViewWith -> \(url.absoluteString)")

        if lastHandledNewWindowURL == url.absoluteString {
            log("createWebViewWith deduplicated -> \(url.absoluteString)")
            lastHandledNewWindowURL = nil
            return nil
        }

        if isInternalURL(url) {
            webView.load(navigationAction.request)
        } else {
            openExternally(url)
        }

        return nil
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        let alertController = UIAlertController(title: webView.title ?? "Coach AI", message: message, preferredStyle: .alert)
        alertController.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            completionHandler()
        })

        presentJavaScriptDialog(alertController) {
            completionHandler()
        }
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        let alertController = UIAlertController(title: webView.title ?? "Coach AI", message: message, preferredStyle: .alert)
        alertController.addAction(UIAlertAction(title: "Cancelar", style: .cancel) { _ in
            completionHandler(false)
        })
        alertController.addAction(UIAlertAction(title: "Aceptar", style: .default) { _ in
            completionHandler(true)
        })

        presentJavaScriptDialog(alertController) {
            completionHandler(false)
        }
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (String?) -> Void
    ) {
        let alertController = UIAlertController(title: webView.title ?? "Coach AI", message: prompt, preferredStyle: .alert)
        alertController.addTextField { textField in
            textField.text = defaultText
        }
        alertController.addAction(UIAlertAction(title: "Cancelar", style: .cancel) { _ in
            completionHandler(nil)
        })
        alertController.addAction(UIAlertAction(title: "Aceptar", style: .default) { [weak alertController] _ in
            completionHandler(alertController?.textFields?.first?.text)
        })

        presentJavaScriptDialog(alertController) {
            completionHandler(defaultText)
        }
    }
}
