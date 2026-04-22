import Foundation

protocol APIClientProtocol {
    func perform(_ endpoint: String) async throws -> Data
}

struct MockAPIClient: APIClientProtocol {
    func perform(_ endpoint: String) async throws -> Data {
        _ = endpoint
        return Data()
    }
}

protocol ContentServicing {
    func copy(for language: AppLanguage) -> AppCopy
}

protocol AuthServicing {
    func restoreSession() async throws -> AuthenticatedUser?
    func signIn(email: String, password: String) async throws -> AuthenticatedUser
    func register(request: RegistrationRequest) async throws -> AuthenticatedUser
    func signOut() async throws
    func updatePreferredLanguage(_ language: AppLanguage, for userID: String) async throws -> AuthenticatedUser
}

protocol ProfileServicing {
    func snapshot(for user: AuthenticatedUser, language: AppLanguage) async -> ProfileSnapshot
}

protocol MediaServicing {
    func recentHighlights(for user: AuthenticatedUser, language: AppLanguage) async -> [MediaHighlight]
}

protocol AnalyticsServicing {
    func track(_ event: AnalyticsEvent)
}

enum AnalyticsEvent: Hashable {
    case sessionRestored
    case signIn
    case signUp
    case signOut
    case languageChanged(String)
}

enum AuthServiceError: Error, Equatable {
    case invalidCredentials
    case duplicateEmail
    case invalidEmail
    case weakPassword
    case unknown
}

struct LocalContentService: ContentServicing {
    func copy(for language: AppLanguage) -> AppCopy {
        switch language {
        case .spanish:
            return AppCopy(
                brandTitle: "Coach AI",
                brandSubtitle: "Analisis deportivo nativo",
                languageLabel: "Idioma",
                home: HomeContent(
                    eyebrow: "CoachAI",
                    title: "App de entrenamiento con IA para analizar video, tecnica y progreso",
                    subtitle: "Coach AI convierte cada entrenamiento en una oportunidad real de progresar con analisis de video, correccion tecnica y seguimiento del rendimiento en una experiencia iOS nativa.",
                    primaryCTA: "Comenzar",
                    secondaryCTA: "Crear cuenta",
                    highlightBullets: [
                        "Analiza tus videos con inteligencia artificial.",
                        "Corrige tu tecnica con mas contexto.",
                        "Sigue tu progreso y tus marcas desde una sola app."
                    ],
                    stats: [
                        HomeStatChip(value: "IA", label: "Analisis guiado"),
                        HomeStatChip(value: "3", label: "Idiomas nativos"),
                        HomeStatChip(value: "100%", label: "Interfaz SwiftUI")
                    ],
                    features: [
                        HomeFeatureCard(
                            symbolName: "video.badge.waveform",
                            eyebrow: "Analisis de video",
                            title: "Convierte cada clip en feedback accionable",
                            detail: "Revisa ejecuciones, detecta patrones tecnicos y organiza sesiones con una interfaz pensada para movil."
                        ),
                        HomeFeatureCard(
                            symbolName: "figure.strengthtraining.traditional",
                            eyebrow: "Tecnica",
                            title: "Entiende mejor cada repeticion",
                            detail: "La app agrupa contexto, observaciones y siguientes pasos para que el atleta no dependa de pantallas web."
                        ),
                        HomeFeatureCard(
                            symbolName: "chart.line.uptrend.xyaxis",
                            eyebrow: "Progreso",
                            title: "Sigue la evolucion con claridad",
                            detail: "Une marcas, trabajo tecnico y bloques de entrenamiento en un flujo listo para integrarse con APIs."
                        )
                    ],
                    footerTitle: "Disenada para crecer mas alla de la landing",
                    footerBody: "Esta base nativa deja listo el producto para perfil, subida de video, resultados de analisis, historial, suscripciones y ajustes."
                ),
                modulesTitle: "Base preparada para las siguientes pantallas",
                modulesSubtitle: "Los modulos se muestran ya como superficies nativas desacopladas del sitio y listas para backend.",
                workspaceModules: [
                    WorkspaceModule(symbolName: "person.crop.circle", title: "Perfil", detail: "Datos del atleta, preferencias y plan actual.", status: "Listo para API"),
                    WorkspaceModule(symbolName: "square.and.arrow.up.on.square", title: "Subida de video", detail: "Punto de entrada para clips y material de analisis.", status: "Proxima fase"),
                    WorkspaceModule(symbolName: "waveform.path.ecg", title: "Resultados IA", detail: "Observaciones, comparativas y feedback estructurado.", status: "Diseno preparado"),
                    WorkspaceModule(symbolName: "clock.arrow.circlepath", title: "Historial", detail: "Seguimiento de sesiones, progreso y evolucion.", status: "Escalable")
                ],
                workspaceTitle: "Workspace nativo",
                workspaceSubtitle: "La sesion ya no navega por URLs. Todo el flujo corre como vistas SwiftUI con estado persistente.",
                workspaceFutureLabel: "Proximos modulos",
                workspacePreviewTitle: "Vista previa de producto",
                workspacePreviewBody: "En esta iteracion la home, el login, el registro, el idioma y la sesion ya funcionan de forma nativa.",
                signOutLabel: "Cerrar sesion",
                loginTitle: "Accede a Coach AI",
                loginSubtitle: "Inicia sesion de forma nativa para entrar en tu workspace sin webviews ni redirects.",
                registerTitle: "Crea tu cuenta",
                registerSubtitle: "Preparamos el registro nativo con validacion, persistencia y contrato listo para backend real.",
                nameLabel: "Nombre completo",
                emailLabel: "Correo electronico",
                passwordLabel: "Contrasena",
                confirmPasswordLabel: "Confirmar contrasena",
                emailPlaceholder: "tu@correo.com",
                passwordPlaceholder: "Minimo 8 caracteres",
                createAccountLabel: "Crear cuenta",
                signInLabel: "Iniciar sesion",
                alreadyHaveAccountLabel: "Ya tienes cuenta? Inicia sesion",
                needAccountLabel: "Todavia no tienes cuenta? Crear cuenta",
                demoCredentialsTitle: "Credenciales de demo",
                demoCredentialsValue: "demo@coachai.es / CoachAI123",
                sessionRestoringLabel: "Recuperando sesion...",
                emptyFieldError: "Completa todos los campos antes de continuar.",
                invalidEmailError: "Introduce un correo electronico valido.",
                weakPasswordError: "La contrasena debe tener al menos 8 caracteres.",
                passwordMismatchError: "Las contrasenas no coinciden.",
                duplicateEmailError: "Ese correo ya esta registrado en el entorno mock.",
                invalidCredentialsError: "Las credenciales no son correctas.",
                genericAuthError: "No se ha podido completar la operacion. Intentalo de nuevo."
            )
        case .english:
            return AppCopy(
                brandTitle: "Coach AI",
                brandSubtitle: "Native sports analysis",
                languageLabel: "Language",
                home: HomeContent(
                    eyebrow: "CoachAI",
                    title: "AI training app for video analysis, technique, and progress",
                    subtitle: "Coach AI turns every training session into actionable insight with native video review, technical feedback, and progress tracking built directly in SwiftUI.",
                    primaryCTA: "Get started",
                    secondaryCTA: "Create account",
                    highlightBullets: [
                        "Analyze training videos with AI.",
                        "Correct technique with clearer mobile feedback.",
                        "Track records and progress in one native workflow."
                    ],
                    stats: [
                        HomeStatChip(value: "AI", label: "Guided review"),
                        HomeStatChip(value: "3", label: "Native languages"),
                        HomeStatChip(value: "100%", label: "SwiftUI interface")
                    ],
                    features: [
                        HomeFeatureCard(
                            symbolName: "video.badge.waveform",
                            eyebrow: "Video analysis",
                            title: "Turn every clip into structured feedback",
                            detail: "Review sessions, detect technical patterns, and keep context together instead of bouncing between browser screens."
                        ),
                        HomeFeatureCard(
                            symbolName: "figure.strengthtraining.traditional",
                            eyebrow: "Technique",
                            title: "Understand each rep with more detail",
                            detail: "The app groups context, insights, and next steps so athletes and coaches can act on what they see."
                        ),
                        HomeFeatureCard(
                            symbolName: "chart.line.uptrend.xyaxis",
                            eyebrow: "Progress",
                            title: "Track evolution with a predictable flow",
                            detail: "Records, technical review, and future AI outputs live in the same native architecture ready for production APIs."
                        )
                    ],
                    footerTitle: "Built to grow beyond the landing screen",
                    footerBody: "This native foundation is ready for profile, video upload, AI results, history, subscriptions, and settings without going back to web runtime."
                ),
                modulesTitle: "Foundation for the next product surfaces",
                modulesSubtitle: "These modules already exist as native cards prepared to connect to services instead of public URLs.",
                workspaceModules: [
                    WorkspaceModule(symbolName: "person.crop.circle", title: "Profile", detail: "Athlete data, preferences, and current plan.", status: "API ready"),
                    WorkspaceModule(symbolName: "square.and.arrow.up.on.square", title: "Video upload", detail: "Entry point for analysis footage and media.", status: "Next phase"),
                    WorkspaceModule(symbolName: "waveform.path.ecg", title: "AI results", detail: "Observations, comparisons, and structured feedback.", status: "Ready for integration"),
                    WorkspaceModule(symbolName: "clock.arrow.circlepath", title: "History", detail: "Sessions, progress, and evolution over time.", status: "Scalable")
                ],
                workspaceTitle: "Native workspace",
                workspaceSubtitle: "The signed in experience no longer depends on URLs. Every step now runs as predictable SwiftUI state.",
                workspaceFutureLabel: "Upcoming modules",
                workspacePreviewTitle: "Product preview",
                workspacePreviewBody: "Home, login, signup, language switching, and session persistence already run natively.",
                signOutLabel: "Sign out",
                loginTitle: "Sign in to Coach AI",
                loginSubtitle: "Open your workspace through native screens only. No embedded site, no redirects, no fake reloads.",
                registerTitle: "Create your account",
                registerSubtitle: "The signup flow is native, validated, and ready to plug into a real backend contract.",
                nameLabel: "Full name",
                emailLabel: "Email",
                passwordLabel: "Password",
                confirmPasswordLabel: "Confirm password",
                emailPlaceholder: "you@email.com",
                passwordPlaceholder: "At least 8 characters",
                createAccountLabel: "Create account",
                signInLabel: "Sign in",
                alreadyHaveAccountLabel: "Already have an account? Sign in",
                needAccountLabel: "Need an account? Create one",
                demoCredentialsTitle: "Demo credentials",
                demoCredentialsValue: "demo@coachai.es / CoachAI123",
                sessionRestoringLabel: "Restoring session...",
                emptyFieldError: "Please complete all fields before continuing.",
                invalidEmailError: "Enter a valid email address.",
                weakPasswordError: "Password must contain at least 8 characters.",
                passwordMismatchError: "Passwords do not match.",
                duplicateEmailError: "That email is already registered in the mock environment.",
                invalidCredentialsError: "Those credentials are not valid.",
                genericAuthError: "The operation could not be completed. Please try again."
            )
        case .basque:
            return AppCopy(
                brandTitle: "Coach AI",
                brandSubtitle: "Kirol analisi natiboa",
                languageLabel: "Hizkuntza",
                home: HomeContent(
                    eyebrow: "CoachAI",
                    title: "Entrenamendu appa IArekin bideoa, teknika eta aurrerapena aztertzeko",
                    subtitle: "Coach AIk entrenamendu bakoitza hobekuntza erabilgarri bihurtzen du: bideo berrikuspena, feedback teknikoa eta aurrerapenaren jarraipena iOS esperientzia natibo batean.",
                    primaryCTA: "Hasi",
                    secondaryCTA: "Kontua sortu",
                    highlightBullets: [
                        "Aztertu entrenamendu bideoak IArekin.",
                        "Teknika hobetu testuinguru handiagoarekin.",
                        "Jarraitu markak eta aurrerapena fluxu natibo berean."
                    ],
                    stats: [
                        HomeStatChip(value: "IA", label: "Berrikuspen gidatua"),
                        HomeStatChip(value: "3", label: "Hizkuntza natibo"),
                        HomeStatChip(value: "100%", label: "SwiftUI interfazea")
                    ],
                    features: [
                        HomeFeatureCard(
                            symbolName: "video.badge.waveform",
                            eyebrow: "Bideo analisia",
                            title: "Clip bakoitza feedback egituratu bihurtu",
                            detail: "Saioak berrikusi, patroi teknikoak detektatu eta testuingurua mugikorrerako pentsatutako interfaze batean mantendu."
                        ),
                        HomeFeatureCard(
                            symbolName: "figure.strengthtraining.traditional",
                            eyebrow: "Teknika",
                            title: "Errepikapen bakoitza hobeto ulertu",
                            detail: "Appak testuingurua, behaketak eta hurrengo urratsak elkartzen ditu kirolariak eta entrenatzaileak hobeto erabakitzeko."
                        ),
                        HomeFeatureCard(
                            symbolName: "chart.line.uptrend.xyaxis",
                            eyebrow: "Aurrerapena",
                            title: "Bilakaera modu aurreikusgarrian jarraitu",
                            detail: "Markak, berrikuspen teknikoa eta etorkizuneko IA emaitzak arkitektura natibo berean geratzen dira."
                        )
                    ],
                    footerTitle: "Landingetik harago hazteko prestatua",
                    footerBody: "Oinarri natibo honek profila, bideo igoera, IA emaitzak, historia, harpidetzak eta doikuntzak gehitzeko bidea prest uzten du."
                ),
                modulesTitle: "Hurrengo produktu geruzetarako oinarria",
                modulesSubtitle: "Modulu hauek txartel natibo gisa erakusten dira eta backend zerbitzuetara konektatzeko prest daude.",
                workspaceModules: [
                    WorkspaceModule(symbolName: "person.crop.circle", title: "Profila", detail: "Atletaren datuak, hobespenak eta plana.", status: "APIrako prest"),
                    WorkspaceModule(symbolName: "square.and.arrow.up.on.square", title: "Bideo igoera", detail: "Analisiaren sarrera puntua eta media.", status: "Hurrengo fasea"),
                    WorkspaceModule(symbolName: "waveform.path.ecg", title: "IA emaitzak", detail: "Behaketak, konparazioak eta feedback egituratua.", status: "Integraziorako prest"),
                    WorkspaceModule(symbolName: "clock.arrow.circlepath", title: "Historia", detail: "Saioak, aurrerapena eta bilakaera.", status: "Eskalagarria")
                ],
                workspaceTitle: "Lan eremu natiboa",
                workspaceSubtitle: "Saio autentifikatua ez dago URLen menpe. Pauso guztiak SwiftUI egoera aurreikusgarri gisa exekutatzen dira.",
                workspaceFutureLabel: "Hurrengo moduluak",
                workspacePreviewTitle: "Produktuaren aurrebista",
                workspacePreviewBody: "Hasiera, login-a, erregistroa, hizkuntza aldaketa eta saioaren persistentea natiboki funtzionatzen dute.",
                signOutLabel: "Saioa itxi",
                loginTitle: "Sartu Coach AI-ra",
                loginSubtitle: "Ireki zure lan eremua pantaila natiboen bidez bakarrik. Ez dago webviewrik, ez redirectrik, ez karga faltsurik.",
                registerTitle: "Sortu zure kontua",
                registerSubtitle: "Erregistro fluxua natiboa da, balidatua dago eta backend erreal batera konektatzeko prest dago.",
                nameLabel: "Izen osoa",
                emailLabel: "Posta elektronikoa",
                passwordLabel: "Pasahitza",
                confirmPasswordLabel: "Berretsi pasahitza",
                emailPlaceholder: "zure@posta.com",
                passwordPlaceholder: "Gutxienez 8 karaktere",
                createAccountLabel: "Kontua sortu",
                signInLabel: "Saioa hasi",
                alreadyHaveAccountLabel: "Baduzu kontua? Hasi saioa",
                needAccountLabel: "Konturik ez duzu? Sortu bat",
                demoCredentialsTitle: "Demo kredentzialak",
                demoCredentialsValue: "demo@coachai.es / CoachAI123",
                sessionRestoringLabel: "Saioa leheneratzen...",
                emptyFieldError: "Bete eremu guztiak jarraitu aurretik.",
                invalidEmailError: "Sartu baliozko posta elektronikoa.",
                weakPasswordError: "Pasahitzak gutxienez 8 karaktere izan behar ditu.",
                passwordMismatchError: "Pasahitzak ez datoz bat.",
                duplicateEmailError: "Helbide hori dagoeneko erregistratuta dago mock ingurunean.",
                invalidCredentialsError: "Kredentzialak ez dira zuzenak.",
                genericAuthError: "Ezin izan da eragiketa osatu. Saiatu berriro."
            )
        }
    }
}

actor MockAuthService: AuthServicing {
    private struct StoredCredential: Codable, Equatable {
        let id: String
        var name: String
        var email: String
        var password: String
        var preferredLanguage: AppLanguage

        var user: AuthenticatedUser {
            AuthenticatedUser(
                id: id,
                name: name,
                email: email,
                preferredLanguage: preferredLanguage
            )
        }
    }

    private let defaults: UserDefaults
    private let usersKey = "coachai.native.mock.users"
    private let sessionKey = "coachai.native.mock.session"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func restoreSession() async throws -> AuthenticatedUser? {
        ensureSeedIfNeeded()

        guard
            let sessionID = defaults.string(forKey: sessionKey),
            let credential = loadUsers().first(where: { $0.id == sessionID })
        else {
            return nil
        }

        return credential.user
    }

    func signIn(email: String, password: String) async throws -> AuthenticatedUser {
        try await simulateLatency()
        ensureSeedIfNeeded()

        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard isValid(email: normalizedEmail) else {
            throw AuthServiceError.invalidEmail
        }

        guard let credential = loadUsers().first(where: { $0.email.lowercased() == normalizedEmail }) else {
            throw AuthServiceError.invalidCredentials
        }

        guard credential.password == password else {
            throw AuthServiceError.invalidCredentials
        }

        defaults.set(credential.id, forKey: sessionKey)
        return credential.user
    }

    func register(request: RegistrationRequest) async throws -> AuthenticatedUser {
        try await simulateLatency()
        ensureSeedIfNeeded()

        let normalizedEmail = request.email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        guard isValid(email: normalizedEmail) else {
            throw AuthServiceError.invalidEmail
        }

        guard request.password.count >= 8 else {
            throw AuthServiceError.weakPassword
        }

        var users = loadUsers()

        if users.contains(where: { $0.email.lowercased() == normalizedEmail }) {
            throw AuthServiceError.duplicateEmail
        }

        let credential = StoredCredential(
            id: UUID().uuidString,
            name: request.fullName.trimmingCharacters(in: .whitespacesAndNewlines),
            email: normalizedEmail,
            password: request.password,
            preferredLanguage: request.preferredLanguage
        )

        users.append(credential)
        saveUsers(users)
        defaults.set(credential.id, forKey: sessionKey)

        return credential.user
    }

    func signOut() async throws {
        defaults.removeObject(forKey: sessionKey)
    }

    func updatePreferredLanguage(_ language: AppLanguage, for userID: String) async throws -> AuthenticatedUser {
        ensureSeedIfNeeded()
        var users = loadUsers()

        guard let index = users.firstIndex(where: { $0.id == userID }) else {
            throw AuthServiceError.unknown
        }

        users[index].preferredLanguage = language
        saveUsers(users)
        defaults.set(userID, forKey: sessionKey)

        return users[index].user
    }

    private func ensureSeedIfNeeded() {
        if !loadUsers().isEmpty {
            return
        }

        let seedUser = StoredCredential(
            id: UUID().uuidString,
            name: "CoachAI Demo",
            email: "demo@coachai.es",
            password: "CoachAI123",
            preferredLanguage: .spanish
        )

        saveUsers([seedUser])
    }

    private func loadUsers() -> [StoredCredential] {
        guard let data = defaults.data(forKey: usersKey) else { return [] }

        do {
            return try JSONDecoder().decode([StoredCredential].self, from: data)
        } catch {
            return []
        }
    }

    private func saveUsers(_ users: [StoredCredential]) {
        guard let data = try? JSONEncoder().encode(users) else { return }
        defaults.set(data, forKey: usersKey)
    }

    private func isValid(email: String) -> Bool {
        let parts = email.split(separator: "@")
        return parts.count == 2 && parts[1].contains(".")
    }

    private func simulateLatency() async throws {
        try await Task.sleep(nanoseconds: 450_000_000)
    }
}

struct MockProfileService: ProfileServicing {
    func snapshot(for user: AuthenticatedUser, language: AppLanguage) async -> ProfileSnapshot {
        _ = user

        switch language {
        case .spanish:
            return ProfileSnapshot(
                planName: "Plan nativo base",
                weeklyFocus: "Tecnica + analisis de video",
                currentStreak: "4 sesiones esta semana"
            )
        case .english:
            return ProfileSnapshot(
                planName: "Native starter plan",
                weeklyFocus: "Technique + video analysis",
                currentStreak: "4 sessions this week"
            )
        case .basque:
            return ProfileSnapshot(
                planName: "Oinarrizko plan natiboa",
                weeklyFocus: "Teknika + bideo analisia",
                currentStreak: "4 saio aste honetan"
            )
        }
    }
}

struct MockMediaService: MediaServicing {
    func recentHighlights(for user: AuthenticatedUser, language: AppLanguage) async -> [MediaHighlight] {
        _ = user

        switch language {
        case .spanish:
            return [
                MediaHighlight(title: "Subida de video", detail: "Contrato listo para integrar storage."),
                MediaHighlight(title: "Resultados IA", detail: "Placeholder nativo para feedback estructurado."),
                MediaHighlight(title: "Historial", detail: "Timeline preparado para sesiones futuras.")
            ]
        case .english:
            return [
                MediaHighlight(title: "Video upload", detail: "Contract ready for storage integration."),
                MediaHighlight(title: "AI results", detail: "Native placeholder for structured feedback."),
                MediaHighlight(title: "History", detail: "Timeline prepared for future sessions.")
            ]
        case .basque:
            return [
                MediaHighlight(title: "Bideo igoera", detail: "Storage integraziorako kontratua prest."),
                MediaHighlight(title: "IA emaitzak", detail: "Feedback egituraturako placeholder natiboa."),
                MediaHighlight(title: "Historia", detail: "Etorkizuneko saioetarako timeline prestatua.")
            ]
        }
    }
}

struct ConsoleAnalyticsService: AnalyticsServicing {
    func track(_ event: AnalyticsEvent) {
        #if DEBUG
        print("[CoachAIAnalytics] \(event)")
        #endif
    }
}
