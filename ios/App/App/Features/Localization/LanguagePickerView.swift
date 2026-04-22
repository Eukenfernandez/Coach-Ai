import SwiftUI

struct LanguagePickerView: View {
    let selectedLanguage: AppLanguage
    let onSelect: (AppLanguage) -> Void

    var body: some View {
        HStack(spacing: 6) {
            ForEach(AppLanguage.allCases) { language in
                Button {
                    onSelect(language)
                } label: {
                    Text(language.displayCode)
                        .font(.system(size: 13, weight: .bold, design: .rounded))
                        .frame(minWidth: 46, minHeight: 38)
                        .background(
                            Capsule().fill(
                                selectedLanguage == language
                                    ? AnyShapeStyle(CoachTheme.accent)
                                    : AnyShapeStyle(Color.clear)
                            )
                        )
                        .foregroundStyle(
                            selectedLanguage == language
                                ? Color.white
                                : CoachTheme.textSecondary
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(6)
        .background(Color.white.opacity(0.06), in: Capsule())
        .overlay(
            Capsule()
                .stroke(Color.white.opacity(0.10), lineWidth: 1)
        )
    }
}
