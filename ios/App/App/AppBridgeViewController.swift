import UIKit
import WebKit

final class AppBridgeViewController: UIViewController {

    private var webView: WKWebView!

    // MARK: - Configuración

    // Cambia esto por tu URL inicial real
    private let initialURL = URL(string: "https://coachai.es")!

    // Cambia esto por tu dominio raíz real
    private let rootDomain = "coachai.es∫"

    // Si tu login/registro/idioma usa otros hosts concretos, añádelos aquí
    // Ejemplo: ["auth.tu-dominio.com", "app.tu-dominio.com"]
    private let additionalInternalHosts: Set<String> = []

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        setupWebView()
        loadInitialURL()
    }

    // MARK: - Setup

    private func setupWebView() {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        let userContentController = WKUserContentController()

        // Marca que la web está corriendo dentro de la app
        let appBridgeScript = """
        window.__IS_IOS_APP__ = true;
        document.documentElement.classList.add('ios-app');
        """
        let userScript = WKUserScript(
            source: appBridgeScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        userContentController.addUserScript(userScript)
        configuration.userContentController = userContentController

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.bounces = true
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black

        self.webView = webView
        view.addSubview(webView)

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])
    }

    private func loadInitialURL() {
        let request = URLRequest(url: initialURL)
        webView.load(request)
    }

    // MARK: - Helpers

    private func isInternalURL(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }

        if additionalInternalHosts.contains(host) {
            return true
        }

        return host == rootDomain ||
               host == "www.\(rootDomain)" ||
               host.hasSuffix(".\(rootDomain)")
    }

    private func openExternally(_ url: URL) {
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }

    private func shouldIgnoreWebKitError(_ error: Error) -> Bool {
        let nsError = error as NSError
        return nsError.domain == "WebKitErrorDomain" && nsError.code == 102
    }

    private func isSpecialExternalScheme(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased() else { return false }
        return ["tel", "mailto", "sms"].contains(scheme)
    }

    private func isHttpOrHttps(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased() else { return false }
        return scheme == "http" || scheme == "https"
    }
}

// MARK: - WKNavigationDelegate

extension AppBridgeViewController: WKNavigationDelegate {

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {

        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }

        print("Solicitud de navegación: \(url.absoluteString)")

        // Esquemas del sistema
        if isSpecialExternalScheme(url) {
            openExternally(url)
            decisionHandler(.cancel)
            return
        }

        // Si no es http/https, no lo tratamos como navegación web interna
        if !isHttpOrHttps(url) {
            openExternally(url)
            decisionHandler(.cancel)
            return
        }

        // target="_blank" / window.open
        if navigationAction.targetFrame == nil {
            if isInternalURL(url) {
                webView.load(URLRequest(url: url))
            } else {
                openExternally(url)
            }
            decisionHandler(.cancel)
            return
        }

        // Todo tu dominio y subdominios se consideran internos
        if isInternalURL(url) {
            decisionHandler(.allow)
            return
        }

        // Todo lo demás se abre fuera
        openExternally(url)
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        print("Página cargada: \(webView.url?.absoluteString ?? "sin URL")")
    }

    func webView(_ webView: WKWebView,
                 didFail navigation: WKNavigation!,
                 withError error: Error) {
        if shouldIgnoreWebKitError(error) { return }

        let nsError = error as NSError
        print("Error de navegación real: \(nsError.domain) - \(nsError.code) - \(nsError.localizedDescription)")
    }

    func webView(_ webView: WKWebView,
                 didFailProvisionalNavigation navigation: WKNavigation!,
                 withError error: Error) {
        if shouldIgnoreWebKitError(error) { return }

        let nsError = error as NSError
        print("Error provisional real: \(nsError.domain) - \(nsError.code) - \(nsError.localizedDescription)")
    }
}

// MARK: - WKUIDelegate

extension AppBridgeViewController: WKUIDelegate {

    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {

        guard let url = navigationAction.request.url else { return nil }

        print("Nueva ventana solicitada: \(url.absoluteString)")

        if navigationAction.targetFrame == nil {
            if isInternalURL(url) {
                webView.load(URLRequest(url: url))
            } else {
                openExternally(url)
            }
        }

        return nil
    }
}
