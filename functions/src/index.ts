/**
 * Firebase Cloud Functions - Coach AI Backend Seguro
 * 
 * Este código vive en Google Cloud y es INVISIBLE para cualquiera que pulse F12.
 * Aquí guardamos:
 * - La API Key de Gemini (en variables de entorno)
 * - Los prompts secretos del entrenador
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI } from "@google/generative-ai";

// La API Key se guarda de forma segura en Firebase Secrets
const geminiApiKey = defineSecret("GEMINI_API_KEY");

// Delay helper para retry
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ========== PROMPTS SECRETOS (NUNCA VISIBLES EN EL NAVEGADOR) ==========

const getSystemPromptForLang = (lang: 'es' | 'ing' | 'eus', type: 'frame' | 'chat') => {
    if (type === 'frame') {
        switch (lang) {
            case 'ing': return `You are an ENTHUSIASTIC elite sports coach analyzing a video frame! 🏆
IMPORTANT: Describe what you SEE in the image with energy and motivation!
- Start with something POSITIVE you notice (good form, effort, progress)
- Describe the athlete's position (arms, legs, torso) with technical insight
- Give ONE specific tip to improve, framed as an exciting opportunity
- End with encouragement! Use emojis sparingly (1-2 max)
Be specific to THIS frame. Sound like a coach who BELIEVES in the athlete! 2-4 sentences.`;
            case 'eus': return `Kirol entrenatzaile GOGOTSU bat zara bideo-fotograma bat aztertzen! 🏆
GARRANTZITSUA: Deskribatu irudian ikusten duzuna energia eta motibazioarekin!
- Hasi ZERBAIT POSITIBOAREKIN (forma ona, ahalegina, aurrerapena)
- Deskribatu atletaren posizioa (besoak, hankak, enborra) jakintza teknikoarekin
- Eman hobetzeko TIP BAT, aukera zirraragarri gisa aurkeztuta
- Amaitu bultzadarekin! Erabili emojiak neurriz (1-2 gehienez)
Izan zehatza FOTOGRAMA honekin. Izan atletarengan SINESTEN duen entrenatzailea! 2-4 esaldi.`;
            default: return `¡Eres un entrenador de élite SÚPER MOTIVADOR analizando un fotograma de video! 🏆
IMPORTANTE: ¡Describe lo que VES en la imagen con energía y motivación!
- Empieza con algo POSITIVO que notes (buena forma, esfuerzo, progreso)
- Describe la posición del atleta (brazos, piernas, torso) con conocimiento técnico
- Da UN consejo específico para mejorar, presentado como una oportunidad emocionante
- ¡Termina con ánimo! Usa emojis con moderación (1-2 máximo)
Sé específico con ESTE fotograma. ¡Suena como un entrenador que CREE en el atleta! 2-4 frases.`;
        }
    } else {
        switch (lang) {
            case 'ing': return `You are an AMAZING high-performance sports coach who LOVES helping athletes succeed! 🔥
- Be warm, encouraging, and genuinely excited about their progress
- Celebrate their efforts and small wins
- Give advice that's both technical AND motivating
- Use occasional emojis to add energy (but don't overdo it)
- Make the athlete feel like a champion in training!
Respond in English with enthusiasm!`;
            case 'eus': return `Kirolariek arrakasta lortzea MAITE duen errendimendu handiko kirol entrenatzaile BIKAINA zara! 🔥
- Izan bero, bultzatzaile eta benetan ilusinatuta haien aurrerapenarekin
- Ospatu haien ahaleginak eta garaipen txikiak
- Eman aholku teknikoak ETA motibatzaileak
- Erabili noizbehinka emojiak energia gehitzeko (baina ez gehiegi)
- Egin atletak entrenamendu txapeldun bat sentitzea!
Erantzun euskaraz gogoz!`;
            default: return `¡Eres un entrenador deportivo de alto rendimiento INCREÍBLE que AMA ayudar a los atletas a triunfar! 🔥
- Sé cálido, motivador y genuinamente emocionado por su progreso
- Celebra sus esfuerzos y pequeñas victorias
- Da consejos que sean técnicos Y motivadores
- Usa emojis ocasionalmente para añadir energía (pero sin pasarte)
- ¡Haz que el atleta se sienta como un campeón en entrenamiento!
Responde en español con entusiasmo!`;
        }
    }
};

// Helper para reintentos con backoff exponencial
async function generateWithRetry(
    genAI: GoogleGenerativeAI,
    modelName: string,
    contents: any,
    systemInstruction: string,
    retries = 3
): Promise<string> {
    let lastError;

    for (let i = 0; i < retries; i++) {
        try {
            const model = genAI.getGenerativeModel({
                model: modelName,
                systemInstruction
            });
            const result = await model.generateContent(contents);
            return result.response.text() || "";
        } catch (error: any) {
            lastError = error;
            const errorCode = error?.status || error?.code;
            if ((errorCode === 429 || errorCode === 503) && i < retries - 1) {
                const waitTime = Math.pow(2, i) * 1000 + (Math.random() * 500);
                await delay(waitTime);
                continue;
            }
            throw error;
        }
    }
    throw lastError;
}

// ========== FUNCIÓN: ANALIZAR FRAME ==========
export const analizarFrame = onCall(
    {
        secrets: [geminiApiKey],
        region: "europe-west1",
        maxInstances: 10
    },
    async (request) => {
        // Validar que el usuario está autenticado
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
        }

        const { base64Image, promptText, chatHistory, modelTier, language } = request.data;

        if (!base64Image) {
            throw new HttpsError("invalid-argument", "Se requiere una imagen.");
        }

        const genAI = new GoogleGenerativeAI(geminiApiKey.value());
        const systemContext = getSystemPromptForLang(language || 'es', 'frame');
        const fullPrompt = `${systemContext}\n\nContexto previo: ${(chatHistory || []).slice(-2).join('\n')}\n\nPregunta del usuario: ${promptText || 'Analiza esta imagen'}`;

        // Use gemini-2.0-flash which is stable and working
        const modelName = 'gemini-2.0-flash';

        console.log('[analizarFrame] Processing request with model:', modelName);
        console.log('[analizarFrame] Image size (chars):', base64Image?.length || 0);

        try {
            const model = genAI.getGenerativeModel({ model: modelName });

            // Format for multimodal content with image
            const result = await model.generateContent([
                {
                    inlineData: {
                        mimeType: 'image/jpeg',
                        data: base64Image
                    }
                },
                { text: fullPrompt }
            ]);

            const response = result.response?.text?.() || "No pude analizar el frame.";
            console.log('[analizarFrame] Success, response length:', response.length);
            return { result: response };
        } catch (error: any) {
            console.error("[analizarFrame] Error completo:", JSON.stringify(error, null, 2));
            console.error("[analizarFrame] Error message:", error?.message);
            console.error("[analizarFrame] Error status:", error?.status);
            throw new HttpsError("internal", "Error al analizar la imagen.");
        }
    }
);

// ========== FUNCIÓN: CHAT CON ENTRENADOR ==========
export const chatWithCoach = onCall(
    {
        secrets: [geminiApiKey],
        region: "europe-west1",
        maxInstances: 10
    },
    async (request) => {
        // Validar que el usuario está autenticado
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
        }

        const { message, history, modelTier, language } = request.data;

        if (!message) {
            throw new HttpsError("invalid-argument", "Se requiere un mensaje.");
        }

        const genAI = new GoogleGenerativeAI(geminiApiKey.value());
        const systemInstruction = getSystemPromptForLang(language || 'es', 'chat');

        // Using gemini-2.0-flash for all users (stable and working)
        const modelName = 'gemini-2.0-flash';

        console.log('[chatWithCoach] Sending message:', message, 'using model:', modelName);

        try {
            const model = genAI.getGenerativeModel({
                model: modelName,
                systemInstruction
            });
            // Simple text content - no need for complex role/parts structure
            const result = await model.generateContent(message);
            const responseText = result.response?.text?.() || "No tengo respuesta en este momento.";
            console.log('[chatWithCoach] Response received:', responseText.substring(0, 100));
            return { result: responseText };
        } catch (error: any) {
            console.error("[chatWithCoach] Error completo:", JSON.stringify(error, null, 2));
            console.error("[chatWithCoach] Error message:", error?.message);
            console.error("[chatWithCoach] Error status:", error?.status);
            throw new HttpsError("internal", "Error al conectar con el entrenador.");
        }
    }
);
