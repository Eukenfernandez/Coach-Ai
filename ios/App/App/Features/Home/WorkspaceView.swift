import SwiftUI

struct WorkspaceView: View {
    let copy: AppCopy
    let selectedLanguage: AppLanguage
    let currentUser: AuthenticatedUser
    let profileSnapshot: ProfileSnapshot
    let mediaHighlights: [MediaHighlight]
    let onLanguageChange: (AppLanguage) -> Void
    let onSignOut: () -> Void

    private let moduleColumns = [
        GridItem(.adaptive(minimum: 220), spacing: 16)
    ]

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 24) {
                header

                CoachSurfaceCard {
                    VStack(alignment: .leading, spacing: 14) {
                        Text(copy.workspaceTitle)
                            .font(CoachTheme.titleFont(size: 32))
                            .foregroundStyle(CoachTheme.textPrimary)

                        Text(copy.workspaceSubtitle)
                            .font(CoachTheme.bodyFont())
                            .foregroundStyle(CoachTheme.textSecondary)

                        HStack(spacing: 12) {
                            profilePill(title: currentUser.name)
                            profilePill(title: profileSnapshot.planName)
                            profilePill(title: profileSnapshot.currentStreak)
                        }

                        Text(profileSnapshot.weeklyFocus)
                            .font(.system(size: 15, weight: .medium, design: .rounded))
                            .foregroundStyle(Color(hex: 0xFFB37B))
                    }
                }

                CoachSectionHeader(
                    eyebrow: copy.workspaceFutureLabel,
                    title: copy.modulesTitle,
                    subtitle: copy.modulesSubtitle
                )

                LazyVGrid(columns: moduleColumns, spacing: 16) {
                    ForEach(copy.workspaceModules) { module in
                        CoachSurfaceCard {
                            VStack(alignment: .leading, spacing: 14) {
                                Image(systemName: module.symbolName)
                                    .font(.system(size: 20, weight: .semibold))
                                    .foregroundStyle(Color(hex: 0xFFB37B))

                                Text(module.title)
                                    .font(.system(size: 20, weight: .bold, design: .rounded))
                                    .foregroundStyle(CoachTheme.textPrimary)

                                Text(module.detail)
                                    .font(CoachTheme.bodyFont(size: 15))
                                    .foregroundStyle(CoachTheme.textSecondary)
                                    .fixedSize(horizontal: false, vertical: true)

                                Text(module.status)
                                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 8)
                                    .background(Color.white.opacity(0.06), in: Capsule())
                                    .foregroundStyle(CoachTheme.textSecondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }

                CoachSurfaceCard {
                    VStack(alignment: .leading, spacing: 14) {
                        Text(copy.workspacePreviewTitle)
                            .font(.system(size: 22, weight: .bold, design: .rounded))
                            .foregroundStyle(CoachTheme.textPrimary)

                        ForEach(mediaHighlights) { item in
                            HStack(alignment: .top, spacing: 12) {
                                Image(systemName: "sparkles.rectangle.stack")
                                    .foregroundStyle(Color(hex: 0xFFB37B))
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(item.title)
                                        .font(.system(size: 16, weight: .semibold, design: .rounded))
                                        .foregroundStyle(CoachTheme.textPrimary)
                                    Text(item.detail)
                                        .font(.system(size: 14, weight: .medium, design: .rounded))
                                        .foregroundStyle(CoachTheme.textSecondary)
                                }
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 36)
            .frame(maxWidth: 1080, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(
            ZStack {
                CoachTheme.background
                Circle()
                    .fill(Color(hex: 0xFF7B2C, opacity: 0.14))
                    .frame(width: 260, height: 260)
                    .blur(radius: 72)
                    .offset(x: 180, y: -120)
            }
            .ignoresSafeArea()
        )
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 16) {
            CoachBrandMark(subtitle: currentUser.email)

            Spacer(minLength: 12)

            LanguagePickerView(
                selectedLanguage: selectedLanguage,
                onSelect: onLanguageChange
            )

            Button(action: onSignOut) {
                Text(copy.signOutLabel)
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .padding(.horizontal, 18)
                    .padding(.vertical, 12)
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

    private func profilePill(title: String) -> some View {
        Text(title)
            .font(.system(size: 13, weight: .semibold, design: .rounded))
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Color.white.opacity(0.06), in: Capsule())
            .foregroundStyle(CoachTheme.textSecondary)
    }
}
