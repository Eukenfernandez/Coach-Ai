
/**
 * Biomechanical Guidelines for AI Analysis
 * 
 * This file contains sport-specific technical rules to guide the AI's analysis.
 * It helps correct common AI hallucinations or generic advice that contradicts
 * specific sport techniques (e.g., "blocking leg must be rigid" vs "extended").
 */

interface BiomechanicalRule {
    sport: string; // matches sport type or specific discipline substring
    rules: string[];
}

const BIOMECHANICAL_GUIDELINES: BiomechanicalRule[] = [
    {
        sport: 'Lanz. Jabalina',
        rules: [
            "ROLES (Right-Handed): Right leg = DRIVE/IMPULSE (Push). Left leg = BLOCK/BRACE (Stop).",
            "BLOCKING LEG (Left): Must be RIGID (STIFF) and planted FIRMLY (Heel/Flat). Do NOT advise 'running on toes' or 'pushing with toes' for the block. It acts as a brake/fulcrum.",
            "HIP DRIVE: Right hip must rotate AHEAD of the shoulder.",
            "STRIDE: A long stride is ESSENTIAL. Do NOT criticize the left foot for being 'too forward' (adelantado) - that is the goal. Only criticize if it causes falling.",
            "FEET: Block foot (Left) should point forward or slightly inturned. Drive foot (Right) pushes active.",
            "THROWING ARM: Must be delayed (long arm) and high. Full EXTENSION at release. Do NOT drop the elbow below shoulder height.",
            "CRITICAL: Do not use sprinting cues ('fuerza de los dedos', 'pie reactivo') for the BLOCKING leg.",
            "TERMINOLOGY: Use 'Bloqueo' (Block), 'Tensión' (Tension), 'Fulcro'."
        ]
    },
    {
        sport: 'Lanz. Peso',
        rules: [
            "POWER POSITION: Body weight must be loaded on the back leg initially.",
            "BLOCKING: The front leg must Block RIGIDLY. The goal is a sudden stop of the lower body to catapult the upper body.",
            "ELBOW: Keep elbow high, thumb down at release.",
            "REVERSE: The reverse (exchange) happens AFTER the release, never before."
        ]
    },
    {
        sport: 'Lanz. Disco',
        rules: [
            "BLOCKING: Firm left side block (for right-handed).",
            "ORBIT: Discus must travel in a wide orbit.",
            "SEPARATION: Keep the discus behind the hip ('separation') as long as possible.",
            "RELEASE: Index finger rolling off last."
        ]
    },
    {
        sport: 'Sprint',
        rules: [
            "GROUND CONTACT: Contact must be under the center of mass to minimize braking forces.",
            "KNEE DRIVE: High, distinct knee drive.",
            "LEG STIFFNESS: Structurally stiff stance leg on contact (like a stiff spring). Do not collapse.",
            "ARMS: 90 degree flexion, drive elbows back."
        ]
    },
    {
        sport: 'Salto',
        rules: [
            "PENULTIMATE STEP: The penultimate step should be flat/rolling to lower center of mass.",
            "TAKEOFF LEG: Must be RIGID/STIFF at plant to convert horizontal velocity to vertical.",
            "POSITIONS: Drive free knee up vigorously."
        ]
    },
    {
        sport: 'Gym',
        rules: [
            "SPINE: Maintain neutral spine dominance.",
            "KNEES: Knee valgus (caving in) is a major fault. Knees must track over toes.",
            "DEPTH: Breaking parallel in squats is the standard for full range of motion.",
            "CONTROL: Eccentric phase should be controlled."
        ]
    }
];

export const getBiomechanicalContext = (sport?: string, discipline?: string): string => {
    if (!sport && !discipline) return "";

    const target = (discipline || sport || "").toLowerCase();

    // Find matching rules (checking if the rule's key is contained in the user's sport/discipline)
    const relevantRules = BIOMECHANICAL_GUIDELINES.filter(guide =>
        target.includes(guide.sport.toLowerCase()) ||
        (sport && sport.toLowerCase().includes(guide.sport.toLowerCase()))
    );

    if (relevantRules.length === 0) return "";

    // Flatten rules into a single string
    const specificRules = relevantRules.flatMap(r => r.rules).map(r => `[RULE]: ${r}`).join('\n');

    return `
[ROLE: EXPERT WORLD ATHLETICS BIOMECHANIST]
[CONTEXT: Analyzing ${sport} - ${discipline}]
[TASK]: Analyze the athlete's technique. You must STRICTLY adhere to the following biomechanical rules.
[CRITICAL TECHNICAL RULES]:
${specificRules}
[INSTRUCTION]: 
1. If the athlete violates a rule, point it out using the specific terminology provided.
2. If the athlete follows the rule, praise the specific mechanic (e.g., "Good block rigidity").
3. Do NOT provide generic advice that contradicts these rules.
4. IMPORTANT: You MUST respond in the SAME LANGUAGE the user writes in. If the user writes in Spanish, respond in Spanish. If in English, respond in English. If in Basque (Euskera), respond in Basque.
`;
};
