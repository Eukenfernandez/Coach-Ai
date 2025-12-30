
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Helper to get the AI instance safely.
 */
const getAIClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

/**
 * Helper to retry calls with exponential backoff
 */
async function generateWithRetry(
  model: string, 
  contents: any, 
  retries = 3,
  systemInstruction?: string
): Promise<GenerateContentResponse> {
  const ai = getAIClient();
  let lastError;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await ai.models.generateContent({
        model,
        contents,
        config: systemInstruction ? { systemInstruction } : undefined
      });
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

export const analyzeFrame = async (
  base64Image: string,
  promptText: string,
  chatHistory: string[] = [],
  modelTier: 'standard' | 'advanced' | 'premium' = 'standard',
  language: 'es' | 'ing' | 'eus' = 'es'
): Promise<string> => {
  const systemContext = getSystemPromptForLang(language, 'frame');
  const fullPrompt = `Contexto previo: ${chatHistory.slice(-2).join('\n')}\n\nPregunta: ${promptText}`;
  
  let modelName = 'gemini-3-flash-preview'; // Default/Free (Standard)
  
  if (modelTier === 'advanced') {
     modelName = 'gemini-3-flash-preview'; 
  } else if (modelTier === 'premium') {
     modelName = 'gemini-3-pro-preview';
  }

  const contents = {
    parts: [
      { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
      { text: fullPrompt }
    ]
  };

  try {
    const response = await generateWithRetry(modelName, contents, 2, systemContext);
    return response.text || "No pude analizar el frame.";
  } catch (error) {
    console.warn("Fallback to basic model due to error", error);
    // Fallback
    const response = await generateWithRetry('gemini-3-flash-preview', contents, 1, systemContext);
    return response.text || "Error en el análisis.";
  }
};

export const chatWithCoach = async (
  message: string,
  history: {role: string, text: string}[],
  modelTier: 'standard' | 'advanced' | 'premium' = 'standard',
  language: 'es' | 'ing' | 'eus' = 'es'
): Promise<string> => {
  const systemInstruction = getSystemPromptForLang(language, 'chat');
  const formattedHistory = history.map(h => ({ role: h.role, parts: [{ text: h.text }] }));
  formattedHistory.push({ role: 'user', parts: [{ text: message }] });

  let modelName = 'gemini-3-flash-preview';
  if (modelTier === 'premium') modelName = 'gemini-3-pro-preview';

  try {
    const response = await generateWithRetry(modelName, formattedHistory, 3, systemInstruction);
    return response.text || "No tengo respuesta en este momento.";
  } catch (error) {
    return "Error al conectar con el entrenador.";
  }
};