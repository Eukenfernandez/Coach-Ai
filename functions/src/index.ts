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
            case 'ing': return `You are an elite sports biomechanics coach. Analyze body position, angles, and technique in this image technically but simply. Respond in English concisely.`;
            case 'eus': return `Kirol biomekanikako eliteko entrenatzailea zara. Aztertu gorputzaren posizioa, angeluak eta teknika irudi honetan, teknikoki baina modu errazean. Erantzun euskaraz labur.`;
            default: return `Eres un entrenador de élite en biomecánica deportiva. Analiza la posición corporal, ángulos y técnica en esta imagen de forma técnica pero sencilla. Responde en español de forma concisa.`;
        }
    } else {
        switch (lang) {
            case 'ing': return `You are a high-performance sports coach expert in athletics. Help the athlete with empathy and professionalism. Respond in English.`;
            case 'eus': return `Errendimendu handiko kirol entrenatzailea zara, atletismoan aditua. Lagundu atletari enpatiaz eta profesionaltasunez. Erantzun euskaraz.`;
            default: return `Eres un entrenador deportivo de alto rendimiento experto en atletismo. Ayuda al atleta con empatía y profesionalismo. Responde en español.`;
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
        const fullPrompt = `Contexto previo: ${(chatHistory || []).slice(-2).join('\n')}\n\nPregunta: ${promptText || 'Analiza esta imagen'}`;

        let modelName = 'gemini-1.5-flash';
        if (modelTier === 'advanced') {
            modelName = 'gemini-1.5-flash';
        } else if (modelTier === 'premium') {
            modelName = 'gemini-1.5-pro';
        }

        try {
            const contents = [
                { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
                { text: fullPrompt }
            ];

            const response = await generateWithRetry(genAI, modelName, contents, systemContext, 2);
            return { result: response || "No pude analizar el frame." };
        } catch (error) {
            console.error("Error en analizarFrame:", error);
            // Fallback al modelo básico
            try {
                const contents = [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
                    { text: fullPrompt }
                ];
                const response = await generateWithRetry(genAI, 'gemini-1.5-flash', contents, systemContext, 1);
                return { result: response || "Error en el análisis." };
            } catch {
                throw new HttpsError("internal", "Error al analizar la imagen.");
            }
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

        // Simplificado: solo enviar el mensaje actual sin historial
        // Esto evita errores de formato con Gemini
        const contents = [{ role: 'user', parts: [{ text: message }] }];

        let modelName = 'gemini-1.5-flash';
        if (modelTier === 'premium') modelName = 'gemini-1.5-pro';

        console.log('[chatWithCoach] Sending message:', message);

        try {
            const response = await generateWithRetry(genAI, modelName, contents, systemInstruction, 3);
            return { result: response || "No tengo respuesta en este momento." };
        } catch (error) {
            console.error("Error en chatWithCoach:", error);
            throw new HttpsError("internal", "Error al conectar con el entrenador.");
        }
    }
);
