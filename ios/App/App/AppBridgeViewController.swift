import Foundation
import Capacitor
import UIKit
import WebKit

final class AppBridgeViewController: CAPBridgeViewController {
    private let nativeShellUserAgentToken = "CoachAI-iOSApp"
    private let defaultAllowedHosts: Set<String> = [
        "coachai.es",
        "www.coachai.es",
        "entrenamientos-bfac2.web.app"
    ]

    private lazy var navigationProxy = AppNavigationProxy(owner: self)
    private var baseNavigationDelegate: WKNavigationDelegate?
    private var baseUIDelegate: WKUIDelegate?
    private var baseScrollDelegate: UIScrollViewDelegate?

    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let configuration = super.webViewConfiguration(for: instanceConfiguration)
        let scriptSource = nativeShellScript(for: instanceConfiguration)

        configuration.userContentController.addUserScript(
            WKUserScript(
                source: scriptSource,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: false
            )
        )

        if #available(iOS 14.0, *) {
            configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        }

        let currentApplicationName = configuration.applicationNameForUserAgent?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let currentApplicationName, !currentApplicationName.contains(nativeShellUserAgentToken) {
            configuration.applicationNameForUserAgent = "\(currentApplicationName) \(nativeShellUserAgentToken)"
        } else if currentApplicationName == nil {
            configuration.applicationNameForUserAgent = nativeShellUserAgentToken
        }

        return configuration
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        guard let webView else { return }

        configureWebView(webView)
        installNavigationProxy(on: webView)
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()

        guard let webView else { return }

        webView.scrollView.contentInset = .zero
        webView.scrollView.scrollIndicatorInsets = .zero
        if #available(iOS 13.0, *) {
            webView.scrollView.verticalScrollIndicatorInsets = .zero
            webView.scrollView.horizontalScrollIndicatorInsets = .zero
        }
    }

    fileprivate func isInternalAppURL(_ url: URL) -> Bool {
        if let bridge {
            if url.absoluteString.hasPrefix(bridge.config.serverURL.absoluteString) {
                return true
            }

            if url.absoluteString.hasPrefix(bridge.config.localURL.absoluteString) {
                return true
            }
        }

        if url.scheme == "capacitor" {
            return true
        }

        guard let host = url.host?.lowercased() else {
            return false
        }

        return resolvedAllowedHosts().contains(host)
    }

    fileprivate func openExternally(_ url: URL) {
        guard UIApplication.shared.applicationState == .active else { return }
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }

    private func configureWebView(_ webView: WKWebView) {
        view.backgroundColor = .black
        webView.backgroundColor = .black
        webView.isOpaque = false
        webView.scrollView.backgroundColor = .black
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.contentInset = .zero
        webView.scrollView.scrollIndicatorInsets = .zero
        webView.scrollView.automaticallyAdjustsScrollIndicatorInsets = false
        if #available(iOS 13.0, *) {
            webView.scrollView.verticalScrollIndicatorInsets = .zero
            webView.scrollView.horizontalScrollIndicatorInsets = .zero
        }
    }

    private func installNavigationProxy(on webView: WKWebView) {
        guard !(webView.navigationDelegate is AppNavigationProxy) else { return }

        baseNavigationDelegate = webView.navigationDelegate
        baseUIDelegate = webView.uiDelegate
        baseScrollDelegate = webView.scrollView.delegate

        navigationProxy.baseNavigationDelegate = baseNavigationDelegate
        navigationProxy.baseUIDelegate = baseUIDelegate
        navigationProxy.baseScrollDelegate = baseScrollDelegate

        webView.navigationDelegate = navigationProxy
        webView.uiDelegate = navigationProxy
        webView.scrollView.delegate = navigationProxy
    }

    private func nativeShellScript(for instanceConfiguration: InstanceConfiguration) -> String {
        let shellDescriptor: [String: Any] = [
            "platform": "ios",
            "embedded": true,
            "userAgentToken": nativeShellUserAgentToken,
            "allowedHosts": Array(allowedHosts(for: instanceConfiguration)).sorted()
        ]

        let payloadData = (try? JSONSerialization.data(withJSONObject: shellDescriptor, options: [])) ?? Data("{}".utf8)
        let payloadString = String(data: payloadData, encoding: .utf8) ?? "{}"

        return """
        (function() {
          window.__COACHAI_NATIVE_SHELL__ = \(payloadString);
          document.documentElement.dataset.coachaiNativeShell = 'ios';
          document.documentElement.classList.add('native-app', 'native-ios');
        })();
        """
    }

    private func allowedHosts(for instanceConfiguration: InstanceConfiguration) -> Set<String> {
        var hosts = defaultAllowedHosts

        if let serverHost = instanceConfiguration.serverURL.host?.lowercased() {
            hosts.insert(serverHost)
        }

        if let localHost = instanceConfiguration.localURL.host?.lowercased() {
            hosts.insert(localHost)
        }

        return hosts
    }

    private func resolvedAllowedHosts() -> Set<String> {
        if let bridge {
            return allowedHosts(for: bridge.config)
        }

        return defaultAllowedHosts
    }
}

private final class AppNavigationProxy: NSObject, WKNavigationDelegate, WKUIDelegate, UIScrollViewDelegate {
    weak var owner: AppBridgeViewController?
    var baseNavigationDelegate: WKNavigationDelegate?
    var baseUIDelegate: WKUIDelegate?
    var baseScrollDelegate: UIScrollViewDelegate?

    init(owner: AppBridgeViewController) {
        self.owner = owner
        super.init()
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        baseNavigationDelegate?.webView?(webView, didStartProvisionalNavigation: navigation)
    }

    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        if let baseNavigationDelegate {
            baseNavigationDelegate.webView?(
                webView,
                requestMediaCapturePermissionFor: origin,
                initiatedByFrame: frame,
                type: type,
                decisionHandler: decisionHandler
            )
            return
        }

        decisionHandler(.grant)
    }

    func webView(
        _ webView: WKWebView,
        requestDeviceOrientationAndMotionPermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        if let baseNavigationDelegate {
            baseNavigationDelegate.webView?(
                webView,
                requestDeviceOrientationAndMotionPermissionFor: origin,
                initiatedByFrame: frame,
                decisionHandler: decisionHandler
            )
            return
        }

        decisionHandler(.grant)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard
            let owner,
            let url = navigationAction.request.url
        else {
            if let baseNavigationDelegate {
                baseNavigationDelegate.webView?(webView, decidePolicyFor: navigationAction, decisionHandler: decisionHandler)
            } else {
                decisionHandler(.allow)
            }
            return
        }

        if navigationAction.targetFrame == nil, owner.isInternalAppURL(url) {
            webView.load(navigationAction.request)
            decisionHandler(.cancel)
            return
        }

        if let baseNavigationDelegate {
            baseNavigationDelegate.webView?(webView, decidePolicyFor: navigationAction, decisionHandler: decisionHandler)
        } else {
            decisionHandler(.allow)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        baseNavigationDelegate?.webView?(webView, didFinish: navigation)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        baseNavigationDelegate?.webView?(webView, didFail: navigation, withError: error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        baseNavigationDelegate?.webView?(webView, didFailProvisionalNavigation: navigation, withError: error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        baseNavigationDelegate?.webViewWebContentProcessDidTerminate?(webView)
    }

    func webView(
        _ webView: WKWebView,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping @MainActor (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        if let baseNavigationDelegate {
            baseNavigationDelegate.webView?(webView, didReceive: challenge, completionHandler: completionHandler)
            return
        }

        completionHandler(.rejectProtectionSpace, nil)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        if let baseUIDelegate {
            baseUIDelegate.webView?(webView, runJavaScriptAlertPanelWithMessage: message, initiatedByFrame: frame, completionHandler: completionHandler)
            return
        }

        completionHandler()
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        if let baseUIDelegate {
            baseUIDelegate.webView?(webView, runJavaScriptConfirmPanelWithMessage: message, initiatedByFrame: frame, completionHandler: completionHandler)
            return
        }

        completionHandler(false)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (String?) -> Void
    ) {
        if let baseUIDelegate {
            baseUIDelegate.webView?(
                webView,
                runJavaScriptTextInputPanelWithPrompt: prompt,
                defaultText: defaultText,
                initiatedByFrame: frame,
                completionHandler: completionHandler
            )
            return
        }

        completionHandler(defaultText)
    }

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        guard
            let owner,
            let url = navigationAction.request.url
        else {
            return nil
        }

        if owner.isInternalAppURL(url) {
            webView.load(navigationAction.request)
        } else {
            owner.openExternally(url)
        }

        return nil
    }

    func scrollViewWillBeginZooming(_ scrollView: UIScrollView, with view: UIView?) {
        baseScrollDelegate?.scrollViewWillBeginZooming?(scrollView, with: view)
    }
}
