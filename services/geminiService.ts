/**
 * Servicio de IA - Coach AI
 * 
 * Este archivo del frontend SOLO hace llamadas a Firebase Cloud Functions.
 * La API Key y los prompts secretos están en el backend (invisibles en F12).
 */

import firebase from 'firebase/compat/app';
import 'firebase/compat/functions';

// Obtener la instancia de Functions (usa la misma app que storageService)
const getFunctionsInstance = () => {
  const app = firebase.app();
  return app.functions('europe-west1');
};

/**
 * Analizar un frame/imagen de video usando IA
 */
export const analyzeFrame = async (
  base64Image: string,
  promptText: string,
  chatHistory: string[] = [],
  modelTier: 'standard' | 'advanced' | 'premium' = 'standard',
  language: 'es' | 'ing' | 'eus' = 'es'
): Promise<string> => {
  try {
    const functions = getFunctionsInstance();
    const analizarFrameFn = functions.httpsCallable('analizarFrame');

    const result = await analizarFrameFn({
      base64Image,
      promptText,
      chatHistory,
      modelTier,
      language
    });

    return (result.data as any).result || "No pude analizar el frame.";
  } catch (error: any) {
    console.error("Error llamando a Cloud Function analizarFrame:", error);

    // Mensaje de error amigable para el usuario
    if (error.code === 'unauthenticated') {
      return "Debes iniciar sesión para usar el análisis IA.";
    }
    return "Error en el análisis. Inténtalo de nuevo.";
  }
};

/**
 * Chat con el entrenador IA
 */
export const chatWithCoach = async (
  message: string,
  history: { role: string; text: string }[],
  modelTier: 'standard' | 'advanced' | 'premium' = 'standard',
  language: 'es' | 'ing' | 'eus' = 'es'
): Promise<string> => {
  try {
    const functions = getFunctionsInstance();
    const chatWithCoachFn = functions.httpsCallable('chatWithCoach');

    const result = await chatWithCoachFn({
      message,
      history,
      modelTier,
      language
    });

    return (result.data as any).result || "No tengo respuesta en este momento.";
  } catch (error: any) {
    console.error("Error llamando a Cloud Function chatWithCoach:", error);

    if (error.code === 'unauthenticated') {
      return "Debes iniciar sesión para chatear con el entrenador.";
    }
    return "Error al conectar con el entrenador.";
  }
};