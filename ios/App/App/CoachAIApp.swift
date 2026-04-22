import SwiftUI

@main
struct CoachAIApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    private let container: AppContainer

    @StateObject private var router: AppRouter
    @StateObject private var localizationStore: LocalizationStore
    @StateObject private var sessionStore: SessionStore

    init() {
        let container = AppContainer.makeDefault()
        self.container = container
        _router = StateObject(wrappedValue: AppRouter())
        _localizationStore = StateObject(
            wrappedValue: LocalizationStore(
                defaultLanguage: .spanish,
                contentService: container.contentService
            )
        )
        _sessionStore = StateObject(
            wrappedValue: SessionStore(
                authService: container.authService,
                analyticsService: container.analyticsService
            )
        )
    }

    var body: some Scene {
        WindowGroup {
            RootView(container: container)
                .environmentObject(router)
                .environmentObject(localizationStore)
                .environmentObject(sessionStore)
                .task {
                    await sessionStore.restoreSessionIfNeeded()
                    localizationStore.syncFromCurrentUser(sessionStore.currentUser)
                }
                .onChange(of: sessionStore.currentUser) { user in
                    localizationStore.syncFromCurrentUser(user)
                }
        }
    }
}
