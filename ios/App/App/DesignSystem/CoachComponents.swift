import SwiftUI

struct CoachBrandMark: View {
    let subtitle: String

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(CoachTheme.accent)
                    .frame(width: 52, height: 52)

                Image(systemName: "figure.run")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(.white)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text("Coach AI")
                    .font(CoachTheme.titleFont(size: 26))
                    .foregroundStyle(CoachTheme.textPrimary)
                Text(subtitle)
                    .font(.system(size: 13, weight: .medium, design: .rounded))
                    .foregroundStyle(CoachTheme.textSecondary)
            }
        }
    }
}

struct CoachPrimaryButton: View {
    let title: String
    var isLoading: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                if isLoading {
                    ProgressView()
                        .tint(.white)
                }
                Text(title)
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                Image(systemName: "arrow.right")
                    .font(.system(size: 14, weight: .semibold))
            }
            .frame(maxWidth: .infinity)
            .frame(minHeight: 56)
            .padding(.horizontal, 22)
            .background(CoachTheme.accent, in: Capsule())
            .foregroundStyle(.white)
            .shadow(color: Color(hex: 0xFF7B2C, opacity: 0.30), radius: 22, x: 0, y: 10)
        }
        .buttonStyle(.plain)
    }
}

struct CoachSecondaryButton: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 16, weight: .semibold, design: .rounded))
                .frame(maxWidth: .infinity)
                .frame(minHeight: 56)
                .padding(.horizontal, 22)
                .background(Color.white.opacity(0.06), in: Capsule())
                .overlay(
                    Capsule()
                        .stroke(Color.white.opacity(0.10), lineWidth: 1)
                )
                .foregroundStyle(CoachTheme.textPrimary)
        }
        .buttonStyle(.plain)
    }
}

struct CoachSurfaceCard<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .padding(20)
            .background(CoachTheme.surface, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .stroke(CoachTheme.outline, lineWidth: 1)
            )
    }
}

struct CoachSectionHeader: View {
    let eyebrow: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(eyebrow.uppercased())
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .kerning(1.4)
                .foregroundStyle(Color(hex: 0xFFB37B))

            Text(title)
                .font(CoachTheme.titleFont(size: 28))
                .foregroundStyle(CoachTheme.textPrimary)

            Text(subtitle)
                .font(CoachTheme.bodyFont())
                .foregroundStyle(CoachTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

struct CoachTextField: View {
    let title: String
    let icon: String
    let placeholder: String
    @Binding var text: String
    var keyboardType: UIKeyboardType = .default
    var textInputAutocapitalization: TextInputAutocapitalization = .never

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 14, weight: .semibold, design: .rounded))
                .foregroundStyle(CoachTheme.textSecondary)

            HStack(spacing: 12) {
                Image(systemName: icon)
                    .foregroundStyle(Color(hex: 0xFFB37B))

                TextField(placeholder, text: $text)
                    .keyboardType(keyboardType)
                    .textInputAutocapitalization(textInputAutocapitalization)
                    .autocorrectionDisabled()
                    .foregroundStyle(CoachTheme.textPrimary)
            }
            .padding(.horizontal, 18)
            .frame(minHeight: 56)
            .background(CoachTheme.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(CoachTheme.outline, lineWidth: 1)
            )
        }
    }
}

struct CoachSecureField: View {
    let title: String
    let placeholder: String
    @Binding var text: String
    @State private var isRevealed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 14, weight: .semibold, design: .rounded))
                .foregroundStyle(CoachTheme.textSecondary)

            HStack(spacing: 12) {
                Image(systemName: "lock")
                    .foregroundStyle(Color(hex: 0xFFB37B))

                Group {
                    if isRevealed {
                        TextField(placeholder, text: $text)
                    } else {
                        SecureField(placeholder, text: $text)
                    }
                }
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .foregroundStyle(CoachTheme.textPrimary)

                Button {
                    isRevealed.toggle()
                } label: {
                    Image(systemName: isRevealed ? "eye.slash" : "eye")
                        .foregroundStyle(CoachTheme.textMuted)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 18)
            .frame(minHeight: 56)
            .background(CoachTheme.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(CoachTheme.outline, lineWidth: 1)
            )
        }
    }
}

struct CoachStatusBanner: View {
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "exclamationmark.circle.fill")
                .foregroundStyle(Color.red.opacity(0.9))

            Text(text)
                .font(.system(size: 14, weight: .medium, design: .rounded))
                .foregroundStyle(CoachTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.red.opacity(0.10), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.red.opacity(0.24), lineWidth: 1)
        )
    }
}

struct CoachLoadingView: View {
    let title: String

    var body: some View {
        ZStack {
            CoachTheme.background
                .ignoresSafeArea()

            VStack(spacing: 18) {
                ProgressView()
                    .scaleEffect(1.2)
                    .tint(.white)

                Text(title)
                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                    .foregroundStyle(CoachTheme.textPrimary)
            }
            .padding(28)
            .background(CoachTheme.surface, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .stroke(CoachTheme.outline, lineWidth: 1)
            )
        }
    }
}
