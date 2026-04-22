import SwiftUI

struct RootView: View {
    let container: AppContainer

    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var localizationStore: LocalizationStore
    @EnvironmentObject private var sessionStore: SessionStore

    @State private var profileSnapshot: ProfileSnapshot?
    @State private var mediaHighlights: [MediaHighlight] = []

    var body: some View {
        Group {
            if sessionStore.isRestoringSession {
                CoachLoadingView(title: localizationStore.copy.sessionRestoringLabel)
            } else {
                NavigationStack(path: $router.path) {
                    rootContent
                        .navigationDestination(for: AppRoute.self) { route in
                            switch route {
                            case .login:
                                LoginView(
                                    copy: localizationStore.copy,
                                    selectedLanguage: localizationStore.language,
                                    isSubmitting: sessionStore.isSubmitting,
                                    onLanguageChange: handleLanguageChange,
                                    onSubmit: { email, password in
                                        try await sessionStore.signIn(email: email, password: password)
                                    },
                                    onShowRegister: router.showRegister
                                )
                            case .register:
                                RegisterView(
                                    copy: localizationStore.copy,
                                    selectedLanguage: localizationStore.language,
                                    isSubmitting: sessionStore.isSubmitting,
                                    onLanguageChange: handleLanguageChange,
                                    onSubmit: { request in
                                        try await sessionStore.register(request: request)
                                    },
                                    onShowLogin: router.showLogin
                                )
                            }
                        }
                }
                .tint(.white)
                .onChange(of: sessionStore.currentUser) { user in
                    if let user {
                        router.resetToHome()
                        Task {
                            profileSnapshot = await container.profileService.snapshot(
                                for: user,
                                language: localizationStore.language
                            )
                            mediaHighlights = await container.mediaService.recentHighlights(
                                for: user,
                                language: localizationStore.language
                            )
                        }
                    } else {
                        profileSnapshot = nil
                        mediaHighlights = []
                    }
                }
                .onChange(of: localizationStore.language) { language in
                    guard sessionStore.currentUser != nil else { return }

                    Task {
                        await sessionStore.updatePreferredLanguage(language)
                        if let user = sessionStore.currentUser {
                            profileSnapshot = await container.profileService.snapshot(
                                for: user,
                                language: language
                            )
                            mediaHighlights = await container.mediaService.recentHighlights(
                                for: user,
                                language: language
                            )
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var rootContent: some View {
        if let currentUser = sessionStore.currentUser {
            WorkspaceView(
                copy: localizationStore.copy,
                selectedLanguage: localizationStore.language,
                currentUser: currentUser,
                profileSnapshot: profileSnapshot ?? placeholderProfile(for: localizationStore.language),
                mediaHighlights: mediaHighlights.isEmpty ? placeholderHighlights(for: localizationStore.language) : mediaHighlights,
                onLanguageChange: handleLanguageChange,
                onSignOut: {
                    Task {
                        await sessionStore.signOut()
                    }
                }
            )
        } else {
            HomeView(
                copy: localizationStore.copy,
                selectedLanguage: localizationStore.language,
                onLanguageChange: handleLanguageChange,
                onPrimaryCTA: router.showLogin,
                onSecondaryCTA: router.showRegister
            )
        }
    }

    private func handleLanguageChange(_ language: AppLanguage) {
        localizationStore.setLanguage(language)
    }

    private func placeholderProfile(for language: AppLanguage) -> ProfileSnapshot {
        switch language {
        case .spanish:
            return ProfileSnapshot(
                planName: "Plan nativo base",
                weeklyFocus: "Preparando integracion de perfil y metricas",
                currentStreak: "Sesiones listas para conectar"
            )
        case .english:
            return ProfileSnapshot(
                planName: "Native starter plan",
                weeklyFocus: "Preparing profile and metrics integration",
                currentStreak: "Sessions ready to connect"
            )
        case .basque:
            return ProfileSnapshot(
                planName: "Oinarrizko plan natiboa",
                weeklyFocus: "Profila eta metrikak integratzeko prestatzen",
                currentStreak: "Saioak konektatzeko prest"
            )
        }
    }

    private func placeholderHighlights(for language: AppLanguage) -> [MediaHighlight] {
        switch language {
        case .spanish:
            return [
                MediaHighlight(title: "Subida de video", detail: "Contrato UI + servicio listo para storage."),
                MediaHighlight(title: "Resultados de analisis", detail: "Superficie nativa preparada para feedback estructurado.")
            ]
        case .english:
            return [
                MediaHighlight(title: "Video upload", detail: "UI + service contract ready for storage."),
                MediaHighlight(title: "Analysis results", detail: "Native surface prepared for structured feedback.")
            ]
        case .basque:
            return [
                MediaHighlight(title: "Bideo igoera", detail: "UI + zerbitzu kontratua storage-rako prest."),
                MediaHighlight(title: "Analisi emaitzak", detail: "Feedback egituraturako gainazal natiboa prestatuta.")
            ]
        }
    }
}
