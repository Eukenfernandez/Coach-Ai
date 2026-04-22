import Combine
import Foundation

final class AppContainer {
    let apiClient: APIClientProtocol
    let authService: AuthServicing
    let contentService: ContentServicing
    let profileService: ProfileServicing
    let mediaService: MediaServicing
    let analyticsService: AnalyticsServicing

    init(
        apiClient: APIClientProtocol,
        authService: AuthServicing,
        contentService: ContentServicing,
        profileService: ProfileServicing,
        mediaService: MediaServicing,
        analyticsService: AnalyticsServicing
    ) {
        self.apiClient = apiClient
        self.authService = authService
        self.contentService = contentService
        self.profileService = profileService
        self.mediaService = mediaService
        self.analyticsService = analyticsService
    }

    static func makeDefault() -> AppContainer {
        AppContainer(
            apiClient: MockAPIClient(),
            authService: MockAuthService(),
            contentService: LocalContentService(),
            profileService: MockProfileService(),
            mediaService: MockMediaService(),
            analyticsService: ConsoleAnalyticsService()
        )
    }
}

enum AppRoute: Hashable {
    case login
    case register
}

@MainActor
final class AppRouter: ObservableObject {
    @Published var path: [AppRoute] = []

    func showLogin() {
        path = [.login]
    }

    func showRegister() {
        path = [.register]
    }

    func resetToHome() {
        path = []
    }
}

@MainActor
final class LocalizationStore: ObservableObject {
    @Published private(set) var language: AppLanguage

    private let defaults: UserDefaults
    private let contentService: ContentServicing
    private let languageKey = "coachai.native.language"

    init(
        defaultLanguage: AppLanguage,
        contentService: ContentServicing,
        defaults: UserDefaults = .standard
    ) {
        self.defaults = defaults
        self.contentService = contentService

        if
            let rawValue = defaults.string(forKey: languageKey),
            let storedLanguage = AppLanguage(rawValue: rawValue)
        {
            language = storedLanguage
        } else {
            language = defaultLanguage
        }
    }

    var copy: AppCopy {
        contentService.copy(for: language)
    }

    func setLanguage(_ language: AppLanguage) {
        guard self.language != language else { return }
        self.language = language
        defaults.set(language.rawValue, forKey: languageKey)
    }

    func syncFromCurrentUser(_ user: AuthenticatedUser?) {
        guard let preferredLanguage = user?.preferredLanguage else { return }
        setLanguage(preferredLanguage)
    }
}

@MainActor
final class SessionStore: ObservableObject {
    @Published private(set) var currentUser: AuthenticatedUser?
    @Published private(set) var isRestoringSession = false
    @Published private(set) var isSubmitting = false

    private let authService: AuthServicing
    private let analyticsService: AnalyticsServicing
    private var didRestoreSession = false

    init(authService: AuthServicing, analyticsService: AnalyticsServicing) {
        self.authService = authService
        self.analyticsService = analyticsService
    }

    func restoreSessionIfNeeded() async {
        guard !didRestoreSession else { return }
        didRestoreSession = true
        isRestoringSession = true
        defer { isRestoringSession = false }

        do {
            currentUser = try await authService.restoreSession()
            if currentUser != nil {
                analyticsService.track(.sessionRestored)
            }
        } catch {
            currentUser = nil
        }
    }

    func signIn(email: String, password: String) async throws {
        isSubmitting = true
        defer { isSubmitting = false }

        let user = try await authService.signIn(email: email, password: password)
        currentUser = user
        analyticsService.track(.signIn)
    }

    func register(request: RegistrationRequest) async throws {
        isSubmitting = true
        defer { isSubmitting = false }

        let user = try await authService.register(request: request)
        currentUser = user
        analyticsService.track(.signUp)
    }

    func signOut() async {
        do {
            try await authService.signOut()
        } catch {
            // Keep the local UX consistent even if persistence fails.
        }
        currentUser = nil
        analyticsService.track(.signOut)
    }

    func updatePreferredLanguage(_ language: AppLanguage) async {
        guard let currentUser else { return }

        do {
            let updatedUser = try await authService.updatePreferredLanguage(language, for: currentUser.id)
            self.currentUser = updatedUser
            analyticsService.track(.languageChanged(language.rawValue))
        } catch {
            // Local persistence is enough for the first native cut.
        }
    }
}
