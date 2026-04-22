import SwiftUI

enum CoachTheme {
    static let background = LinearGradient(
        colors: [
            Color(hex: 0x050816),
            Color(hex: 0x0A1024),
            Color(hex: 0x111827)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let accent = LinearGradient(
        colors: [
            Color(hex: 0xFF7B2C),
            Color(hex: 0xFF944D)
        ],
        startPoint: .leading,
        endPoint: .trailing
    )

    static let softAccent = LinearGradient(
        colors: [
            Color(hex: 0xFF7B2C, opacity: 0.28),
            Color(hex: 0xFF944D, opacity: 0.12)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let surface = Color(hex: 0x111827, opacity: 0.82)
    static let surfaceStrong = Color(hex: 0x0B1220, opacity: 0.92)
    static let outline = Color.white.opacity(0.10)
    static let textPrimary = Color.white
    static let textSecondary = Color.white.opacity(0.72)
    static let textMuted = Color(hex: 0xAAB4C8)

    static func titleFont(size: CGFloat) -> Font {
        .system(size: size, weight: .bold, design: .rounded)
    }

    static func bodyFont(size: CGFloat = 16) -> Font {
        .system(size: size, weight: .regular, design: .rounded)
    }
}

extension Color {
    init(hex: UInt, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }
}
