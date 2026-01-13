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
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
// ========== PROMPTS SECRETOS (NUNCA VISIBLES EN EL NAVEGADOR) ==========
const getSystemPromptForLang = (lang, type) => {
    if (type === 'frame') {
        switch (lang) {
            case 'ing': return `You are an elite sports biomechanics coach. Analyze body position, angles, and technique in this image technically but simply. Respond in English concisely.`;
            case 'eus': return `Kirol biomekanikako eliteko entrenatzailea zara. Aztertu gorputzaren posizioa, angeluak eta teknika irudi honetan, teknikoki baina modu errazean. Erantzun euskaraz labur.`;
            default: return `Eres un entrenador de élite en biomecánica deportiva. Analiza la posición corporal, ángulos y técnica en esta imagen de forma técnica pero sencilla. Responde en español de forma concisa.`;
        }
    }
    else {
        switch (lang) {
            case 'ing': return `You are a high-performance sports coach expert in athletics. Help the athlete with empathy and professionalism. Respond in English.`;
            case 'eus': return `Errendimendu handiko kirol entrenatzailea zara, atletismoan aditua. Lagundu atletari enpatiaz eta profesionaltasunez. Erantzun euskaraz.`;
            default: return `Eres un entrenador deportivo de alto rendimiento experto en atletismo. Ayuda al atleta con empatía y profesionalismo. Responde en español.`;
        }
    }
};
// Helper para reintentos con backoff exponencial
async function generateWithRetry(genAI, modelName, contents, systemInstruction, retries = 3) {
    let lastError;
    for (let i = 0; i < retries; i++) {
        try {
            const model = genAI.getGenerativeModel({
                model: modelName,
                systemInstruction
            });
            const result = await model.generateContent(contents);
            return result.response.text() || "";
        }
        catch (error) {
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
export const analizarFrame = onCall({
    secrets: [geminiApiKey],
    region: "europe-west1",
    maxInstances: 10
}, async (request) => {
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
    }
    catch (error) {
        console.error("[analizarFrame] Error completo:", JSON.stringify(error, null, 2));
        console.error("[analizarFrame] Error message:", error?.message);
        console.error("[analizarFrame] Error status:", error?.status);
        throw new HttpsError("internal", "Error al analizar la imagen.");
    }
});
// ========== FUNCIÓN: CHAT CON ENTRENADOR ==========
export const chatWithCoach = onCall({
    secrets: [geminiApiKey],
    region: "europe-west1",
    maxInstances: 10
}, async (request) => {
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
    }
    catch (error) {
        console.error("[chatWithCoach] Error completo:", JSON.stringify(error, null, 2));
        console.error("[chatWithCoach] Error message:", error?.message);
        console.error("[chatWithCoach] Error status:", error?.status);
        throw new HttpsError("internal", "Error al conectar con el entrenador.");
    }
});
