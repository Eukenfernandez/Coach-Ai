import Foundation

enum AppLanguage: String, CaseIterable, Codable, Identifiable, Hashable {
    case spanish = "es"
    case english = "en"
    case basque = "eu"

    var id: String { rawValue }

    var displayCode: String {
        switch self {
        case .spanish: return "ES"
        case .english: return "EN"
        case .basque: return "EU"
        }
    }

    var displayName: String {
        switch self {
        case .spanish: return "Espanol"
        case .english: return "English"
        case .basque: return "Euskara"
        }
    }
}

struct AuthenticatedUser: Codable, Equatable, Hashable {
    let id: String
    var name: String
    var email: String
    var preferredLanguage: AppLanguage
}

struct RegistrationRequest: Equatable {
    let fullName: String
    let email: String
    let password: String
    let preferredLanguage: AppLanguage
}

struct HomeStatChip: Identifiable, Hashable {
    let id = UUID()
    let value: String
    let label: String
}

struct HomeFeatureCard: Identifiable, Hashable {
    let id = UUID()
    let symbolName: String
    let eyebrow: String
    let title: String
    let detail: String
}

struct WorkspaceModule: Identifiable, Hashable {
    let id = UUID()
    let symbolName: String
    let title: String
    let detail: String
    let status: String
}

struct ProfileSnapshot: Hashable {
    let planName: String
    let weeklyFocus: String
    let currentStreak: String
}

struct MediaHighlight: Identifiable, Hashable {
    let id = UUID()
    let title: String
    let detail: String
}

struct HomeContent: Hashable {
    let eyebrow: String
    let title: String
    let subtitle: String
    let primaryCTA: String
    let secondaryCTA: String
    let highlightBullets: [String]
    let stats: [HomeStatChip]
    let features: [HomeFeatureCard]
    let footerTitle: String
    let footerBody: String
}

struct AppCopy: Hashable {
    let brandTitle: String
    let brandSubtitle: String
    let languageLabel: String
    let home: HomeContent
    let modulesTitle: String
    let modulesSubtitle: String
    let workspaceModules: [WorkspaceModule]
    let workspaceTitle: String
    let workspaceSubtitle: String
    let workspaceFutureLabel: String
    let workspacePreviewTitle: String
    let workspacePreviewBody: String
    let signOutLabel: String
    let loginTitle: String
    let loginSubtitle: String
    let registerTitle: String
    let registerSubtitle: String
    let nameLabel: String
    let emailLabel: String
    let passwordLabel: String
    let confirmPasswordLabel: String
    let emailPlaceholder: String
    let passwordPlaceholder: String
    let createAccountLabel: String
    let signInLabel: String
    let alreadyHaveAccountLabel: String
    let needAccountLabel: String
    let demoCredentialsTitle: String
    let demoCredentialsValue: String
    let sessionRestoringLabel: String
    let emptyFieldError: String
    let invalidEmailError: String
    let weakPasswordError: String
    let passwordMismatchError: String
    let duplicateEmailError: String
    let invalidCredentialsError: String
    let genericAuthError: String
}
