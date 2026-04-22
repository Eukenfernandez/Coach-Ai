import SwiftUI

struct LoginView: View {
    let copy: AppCopy
    let selectedLanguage: AppLanguage
    let isSubmitting: Bool
    let onLanguageChange: (AppLanguage) -> Void
    let onSubmit: (String, String) async throws -> Void
    let onShowRegister: () -> Void

    @State private var email = ""
    @State private var password = ""
    @State private var errorMessage: String?

    var body: some View {
        AuthScaffold(
            copy: copy,
            selectedLanguage: selectedLanguage,
            title: copy.loginTitle,
            subtitle: copy.loginSubtitle,
            onLanguageChange: onLanguageChange
        ) {
            CoachTextField(
                title: copy.emailLabel,
                icon: "envelope",
                placeholder: copy.emailPlaceholder,
                text: $email,
                keyboardType: .emailAddress
            )

            CoachSecureField(
                title: copy.passwordLabel,
                placeholder: copy.passwordPlaceholder,
                text: $password
            )

            if let errorMessage {
                CoachStatusBanner(text: errorMessage)
            }

            CoachPrimaryButton(title: copy.signInLabel, isLoading: isSubmitting) {
                submit()
            }

            CoachSurfaceCard {
                VStack(alignment: .leading, spacing: 8) {
                    Text(copy.demoCredentialsTitle)
                        .font(.system(size: 14, weight: .semibold, design: .rounded))
                        .foregroundStyle(CoachTheme.textPrimary)
                    Text(copy.demoCredentialsValue)
                        .font(.system(size: 14, weight: .medium, design: .monospaced))
                        .foregroundStyle(CoachTheme.textSecondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            Button(action: onShowRegister) {
                Text(copy.needAccountLabel)
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundStyle(CoachTheme.textSecondary)
            }
            .buttonStyle(.plain)
            .frame(maxWidth: .infinity, alignment: .center)
        }
    }

    private func submit() {
        errorMessage = nil

        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedPassword = password.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmedEmail.isEmpty, !trimmedPassword.isEmpty else {
            errorMessage = copy.emptyFieldError
            return
        }

        guard trimmedEmail.contains("@"), trimmedEmail.contains(".") else {
            errorMessage = copy.invalidEmailError
            return
        }

        Task {
            do {
                try await onSubmit(trimmedEmail, trimmedPassword)
            } catch {
                errorMessage = authErrorMessage(for: error)
            }
        }
    }

    private func authErrorMessage(for error: Error) -> String {
        guard let authError = error as? AuthServiceError else {
            return copy.genericAuthError
        }

        switch authError {
        case .invalidCredentials:
            return copy.invalidCredentialsError
        case .invalidEmail:
            return copy.invalidEmailError
        case .weakPassword:
            return copy.weakPasswordError
        case .duplicateEmail:
            return copy.duplicateEmailError
        case .unknown:
            return copy.genericAuthError
        }
    }
}

struct RegisterView: View {
    let copy: AppCopy
    let selectedLanguage: AppLanguage
    let isSubmitting: Bool
    let onLanguageChange: (AppLanguage) -> Void
    let onSubmit: (RegistrationRequest) async throws -> Void
    let onShowLogin: () -> Void

    @State private var fullName = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var errorMessage: String?

    var body: some View {
        AuthScaffold(
            copy: copy,
            selectedLanguage: selectedLanguage,
            title: copy.registerTitle,
            subtitle: copy.registerSubtitle,
            onLanguageChange: onLanguageChange
        ) {
            CoachTextField(
                title: copy.nameLabel,
                icon: "person",
                placeholder: copy.nameLabel,
                text: $fullName,
                keyboardType: .default,
                textInputAutocapitalization: .words
            )

            CoachTextField(
                title: copy.emailLabel,
                icon: "envelope",
                placeholder: copy.emailPlaceholder,
                text: $email,
                keyboardType: .emailAddress
            )

            CoachSecureField(
                title: copy.passwordLabel,
                placeholder: copy.passwordPlaceholder,
                text: $password
            )

            CoachSecureField(
                title: copy.confirmPasswordLabel,
                placeholder: copy.passwordPlaceholder,
                text: $confirmPassword
            )

            if let errorMessage {
                CoachStatusBanner(text: errorMessage)
            }

            CoachPrimaryButton(title: copy.createAccountLabel, isLoading: isSubmitting) {
                submit()
            }

            Button(action: onShowLogin) {
                Text(copy.alreadyHaveAccountLabel)
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundStyle(CoachTheme.textSecondary)
            }
            .buttonStyle(.plain)
            .frame(maxWidth: .infinity, alignment: .center)
        }
    }

    private func submit() {
        errorMessage = nil

        let trimmedName = fullName.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedPassword = password.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedConfirmPassword = confirmPassword.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmedName.isEmpty, !trimmedEmail.isEmpty, !trimmedPassword.isEmpty, !trimmedConfirmPassword.isEmpty else {
            errorMessage = copy.emptyFieldError
            return
        }

        guard trimmedEmail.contains("@"), trimmedEmail.contains(".") else {
            errorMessage = copy.invalidEmailError
            return
        }

        guard trimmedPassword.count >= 8 else {
            errorMessage = copy.weakPasswordError
            return
        }

        guard trimmedPassword == trimmedConfirmPassword else {
            errorMessage = copy.passwordMismatchError
            return
        }

        let request = RegistrationRequest(
            fullName: trimmedName,
            email: trimmedEmail,
            password: trimmedPassword,
            preferredLanguage: selectedLanguage
        )

        Task {
            do {
                try await onSubmit(request)
            } catch {
                errorMessage = authErrorMessage(for: error)
            }
        }
    }

    private func authErrorMessage(for error: Error) -> String {
        guard let authError = error as? AuthServiceError else {
            return copy.genericAuthError
        }

        switch authError {
        case .invalidCredentials:
            return copy.invalidCredentialsError
        case .invalidEmail:
            return copy.invalidEmailError
        case .weakPassword:
            return copy.weakPasswordError
        case .duplicateEmail:
            return copy.duplicateEmailError
        case .unknown:
            return copy.genericAuthError
        }
    }
}

private struct AuthScaffold<Content: View>: View {
    let copy: AppCopy
    let selectedLanguage: AppLanguage
    let title: String
    let subtitle: String
    let onLanguageChange: (AppLanguage) -> Void
    let content: Content

    init(
        copy: AppCopy,
        selectedLanguage: AppLanguage,
        title: String,
        subtitle: String,
        onLanguageChange: @escaping (AppLanguage) -> Void,
        @ViewBuilder content: () -> Content
    ) {
        self.copy = copy
        self.selectedLanguage = selectedLanguage
        self.title = title
        self.subtitle = subtitle
        self.onLanguageChange = onLanguageChange
        self.content = content()
    }

    var body: some View {
        GeometryReader { proxy in
            let isWideLayout = proxy.size.width > 760

            ScrollView(showsIndicators: false) {
                if isWideLayout {
                    HStack(alignment: .top, spacing: 24) {
                        introPanel
                        formPanel
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 20)
                    .padding(.bottom, 36)
                    .frame(maxWidth: 1120)
                    .frame(maxWidth: .infinity)
                } else {
                    VStack(spacing: 24) {
                        introPanel
                        formPanel
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 20)
                    .padding(.bottom, 36)
                    .frame(maxWidth: 580)
                    .frame(maxWidth: .infinity)
                }
            }
            .background(
                ZStack {
                    CoachTheme.background
                    Circle()
                        .fill(Color(hex: 0xFF7B2C, opacity: 0.20))
                        .frame(width: 260, height: 260)
                        .blur(radius: 82)
                        .offset(x: 180, y: -120)
                }
                .ignoresSafeArea()
            )
        }
    }

    private var introPanel: some View {
        CoachSurfaceCard {
            VStack(alignment: .leading, spacing: 20) {
                HStack(alignment: .center) {
                    CoachBrandMark(subtitle: copy.brandSubtitle)
                    Spacer()
                    LanguagePickerView(
                        selectedLanguage: selectedLanguage,
                        onSelect: onLanguageChange
                    )
                }

                Text(title)
                    .font(CoachTheme.titleFont(size: 34))
                    .foregroundStyle(CoachTheme.textPrimary)

                Text(subtitle)
                    .font(CoachTheme.bodyFont(size: 17))
                    .foregroundStyle(CoachTheme.textSecondary)

                VStack(alignment: .leading, spacing: 12) {
                    infoRow(symbol: "iphone.gen3", label: "SwiftUI")
                    infoRow(symbol: "lock.shield", label: copy.workspaceTitle)
                    infoRow(symbol: "globe", label: copy.languageLabel)
                }
            }
        }
    }

    private var formPanel: some View {
        CoachSurfaceCard {
            VStack(alignment: .leading, spacing: 18) {
                content
            }
        }
    }

    private func infoRow(symbol: String, label: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .foregroundStyle(Color(hex: 0xFFB37B))
            Text(label)
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .foregroundStyle(CoachTheme.textSecondary)
        }
    }
}
