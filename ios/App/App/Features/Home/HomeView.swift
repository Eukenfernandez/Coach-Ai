import SwiftUI

struct HomeView: View {
    let copy: AppCopy
    let selectedLanguage: AppLanguage
    let onLanguageChange: (AppLanguage) -> Void
    let onPrimaryCTA: () -> Void
    let onSecondaryCTA: () -> Void

    private let featureColumns = [
        GridItem(.adaptive(minimum: 240), spacing: 16)
    ]

    private var analysisLabel: String {
        copy.home.features.indices.contains(0) ? copy.home.features[0].eyebrow : copy.home.eyebrow
    }

    private var techniqueLabel: String {
        copy.home.features.indices.contains(1) ? copy.home.features[1].eyebrow : copy.modulesTitle
    }

    private var progressLabel: String {
        copy.home.features.indices.contains(2) ? copy.home.features[2].eyebrow : copy.workspaceFutureLabel
    }

    var body: some View {
        GeometryReader { proxy in
            let isWideLayout = proxy.size.width > 700

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 28) {
                    header

                    if isWideLayout {
                        HStack(alignment: .center, spacing: 24) {
                            heroCopy
                            heroPreview
                        }
                    } else {
                        VStack(spacing: 24) {
                            heroCopy
                            heroPreview
                        }
                    }

                    CoachSectionHeader(
                        eyebrow: copy.home.eyebrow,
                        title: copy.modulesTitle,
                        subtitle: copy.modulesSubtitle
                    )

                    LazyVGrid(columns: featureColumns, spacing: 16) {
                        ForEach(copy.home.features) { feature in
                            CoachSurfaceCard {
                                VStack(alignment: .leading, spacing: 14) {
                                    Image(systemName: feature.symbolName)
                                        .font(.system(size: 20, weight: .semibold))
                                        .foregroundStyle(Color(hex: 0xFFB37B))

                                    Text(feature.eyebrow.uppercased())
                                        .font(.system(size: 11, weight: .semibold, design: .rounded))
                                        .kerning(1.2)
                                        .foregroundStyle(CoachTheme.textMuted)

                                    Text(feature.title)
                                        .font(.system(size: 19, weight: .bold, design: .rounded))
                                        .foregroundStyle(CoachTheme.textPrimary)

                                    Text(feature.detail)
                                        .font(CoachTheme.bodyFont(size: 15))
                                        .foregroundStyle(CoachTheme.textSecondary)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                    }

                    CoachSurfaceCard {
                        VStack(alignment: .leading, spacing: 12) {
                            Text(copy.home.footerTitle)
                                .font(CoachTheme.titleFont(size: 22))
                                .foregroundStyle(CoachTheme.textPrimary)

                            Text(copy.home.footerBody)
                                .font(CoachTheme.bodyFont())
                                .foregroundStyle(CoachTheme.textSecondary)

                            HStack(spacing: 12) {
                                CoachPrimaryButton(title: copy.home.primaryCTA, action: onPrimaryCTA)
                                CoachSecondaryButton(title: copy.home.secondaryCTA, action: onSecondaryCTA)
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
                        .fill(Color(hex: 0xFF7B2C, opacity: 0.18))
                        .frame(width: 280, height: 280)
                        .blur(radius: 80)
                        .offset(x: 160, y: -140)
                }
                .ignoresSafeArea()
            )
        }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 16) {
            CoachBrandMark(subtitle: copy.brandSubtitle)
            Spacer(minLength: 12)
            LanguagePickerView(
                selectedLanguage: selectedLanguage,
                onSelect: onLanguageChange
            )
        }
    }

    private var heroCopy: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(copy.home.eyebrow.uppercased())
                .font(.system(size: 12, weight: .bold, design: .rounded))
                .kerning(1.8)
                .foregroundStyle(Color(hex: 0xFFB37B))

            Text(copy.home.title)
                .font(CoachTheme.titleFont(size: 38))
                .foregroundStyle(CoachTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)

            Text(copy.home.subtitle)
                .font(CoachTheme.bodyFont(size: 18))
                .foregroundStyle(CoachTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 12) {
                ForEach(copy.home.highlightBullets, id: \.self) { bullet in
                    HStack(alignment: .top, spacing: 12) {
                        Circle()
                            .fill(Color(hex: 0xFF7B2C))
                            .frame(width: 10, height: 10)
                            .padding(.top, 6)

                        Text(bullet)
                            .font(CoachTheme.bodyFont())
                            .foregroundStyle(CoachTheme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }

            HStack(spacing: 12) {
                CoachPrimaryButton(title: copy.home.primaryCTA, action: onPrimaryCTA)
                CoachSecondaryButton(title: copy.home.secondaryCTA, action: onSecondaryCTA)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(copy.home.stats) { stat in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(stat.value)
                                .font(.system(size: 22, weight: .bold, design: .rounded))
                                .foregroundStyle(CoachTheme.textPrimary)
                            Text(stat.label)
                                .font(.system(size: 13, weight: .medium, design: .rounded))
                                .foregroundStyle(CoachTheme.textSecondary)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 14)
                        .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .stroke(Color.white.opacity(0.08), lineWidth: 1)
                        )
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var heroPreview: some View {
        CoachSurfaceCard {
            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    Text(copy.workspacePreviewTitle)
                        .font(.system(size: 18, weight: .bold, design: .rounded))
                        .foregroundStyle(CoachTheme.textPrimary)
                    Spacer()
                    Label("iOS", systemImage: "iphone")
                        .font(.system(size: 12, weight: .semibold, design: .rounded))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color.white.opacity(0.06), in: Capsule())
                        .foregroundStyle(CoachTheme.textSecondary)
                }

                RoundedRectangle(cornerRadius: 30, style: .continuous)
                    .fill(CoachTheme.softAccent)
                    .frame(height: 420)
                    .overlay(alignment: .topLeading) {
                        VStack(alignment: .leading, spacing: 14) {
                            HStack {
                                Circle()
                                    .fill(Color.white.opacity(0.12))
                                    .frame(width: 10, height: 10)
                                Circle()
                                    .fill(Color.white.opacity(0.12))
                                    .frame(width: 10, height: 10)
                                Circle()
                                    .fill(Color.white.opacity(0.12))
                                    .frame(width: 10, height: 10)
                                Spacer()
                            }

                            CoachSurfaceCard {
                                VStack(alignment: .leading, spacing: 12) {
                                    Text(analysisLabel)
                                        .font(.system(size: 16, weight: .semibold, design: .rounded))
                                        .foregroundStyle(CoachTheme.textPrimary)

                                    Rectangle()
                                        .fill(Color.white.opacity(0.10))
                                        .frame(height: 120)
                                        .overlay(
                                            Image(systemName: "play.circle.fill")
                                                .font(.system(size: 34, weight: .semibold))
                                                .foregroundStyle(Color(hex: 0xFFB37B))
                                        )

                                    HStack(spacing: 10) {
                                        previewBadge(analysisLabel)
                                        previewBadge(techniqueLabel)
                                        previewBadge(progressLabel)
                                    }
                                }
                            }

                            HStack(spacing: 12) {
                                CoachSurfaceCard {
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text("84%")
                                            .font(.system(size: 30, weight: .bold, design: .rounded))
                                            .foregroundStyle(CoachTheme.textPrimary)
                                        Text(techniqueLabel)
                                            .font(.system(size: 13, weight: .medium, design: .rounded))
                                            .foregroundStyle(CoachTheme.textSecondary)
                                    }
                                }

                                CoachSurfaceCard {
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text("+12")
                                            .font(.system(size: 30, weight: .bold, design: .rounded))
                                            .foregroundStyle(CoachTheme.textPrimary)
                                        Text(progressLabel)
                                            .font(.system(size: 13, weight: .medium, design: .rounded))
                                            .foregroundStyle(CoachTheme.textSecondary)
                                    }
                                }
                            }
                        }
                        .padding(22)
                    }

                Text(copy.workspacePreviewBody)
                    .font(CoachTheme.bodyFont())
                    .foregroundStyle(CoachTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func previewBadge(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 12, weight: .semibold, design: .rounded))
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(Color.white.opacity(0.08), in: Capsule())
            .foregroundStyle(CoachTheme.textSecondary)
    }
}
