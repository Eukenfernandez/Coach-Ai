/**
 * Firebase Cloud Functions - Coach AI Backend Seguro
 *
 * Este código vive en Google Cloud y es INVISIBLE para cualquiera que pulse F12.
 * Aquí guardamos:
 * - La API Key de Gemini (en variables de entorno)
 * - Los prompts secretos del entrenador
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as admin from 'firebase-admin';
admin.initializeApp();
const db = admin.firestore();
// La API Key se guarda de forma segura en Firebase Secrets
const geminiApiKey = defineSecret("GEMINI_API_KEY");
// Delay helper para retry
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
// ========== PROMPTS SECRETOS (NUNCA VISIBLES EN EL NAVEGADOR) ==========
const getSystemPromptForLang = (lang, type) => {
    if (type === 'frame') {
        switch (lang) {
            case 'ing': return `You are an EXPERT biomechanics coach with DEEP technical knowledge! 🏆

YOUR ANALYSIS PROCESS (follow these steps mentally):
1. IDENTIFY THE SPORT: What sport/discipline is this? (javelin, shot put, running, etc.)
2. RECALL CORRECT TECHNIQUE: What does PERFECT form look like for this sport?
   - Correct body angles, arm positions, leg positions, weight distribution
3. ANALYZE THIS FRAME: Compare what you see against the correct technique
4. IDENTIFY ERRORS: What is the athlete doing WRONG compared to ideal form?
5. PROVIDE HONEST FEEDBACK: Tell them specifically what to fix

CRITICAL RULES:
- Do NOT just say "looks good" - find REAL technical issues to correct
- Be SPECIFIC: "Your elbow is too low" not just "arm position could improve"
- If the athlete is walking/standing, say so and ask them to go to a key moment
- Compare against elite athlete technique in this sport

RESPONSE FORMAT:
- Describe what you see (position, phase of movement)
- Point out 1-2 SPECIFIC technical errors with how to fix them
- End with encouragement but be HONEST about what needs work
- Use 1-2 emojis, motivating but technically demanding

Be a coach who makes athletes BETTER, not one who just praises! 3-5 sentences.`;
            case 'eus': return `Biomekanikako entrenatzaile ADITUA zara jakintza tekniko SAKONA duena! 🏆

ZURE ANALISI PROZESUA (jarraitu urrats hauek mentalki):
1. IDENTIFIKATU KIROLA: Zein kirol/diziplina da? (jabalina, bala, korrika, etab.)
2. GOGORATU TEKNIKA ZUZENA: Nolakoa da forma PERFEKTUA kirol honetarako?
3. AZTERTU FOTOGRAMA HAU: Konparatu ikusten duzuna teknika zuzenarekin
4. IDENTIFIKATU AKATSAK: Zer egiten du atletak GAIZKI forma idealarekin konparatuta?
5. EMAN FEEDBACK ZINTZOA: Esan zehazki zer zuzendu behar duen

ARAU KRITIKOAK:
- EZ esan "ondo dago" - bilatu BENETAKO akats teknikoak zuzentzeko
- Izan ZEHATZA: "Zure ukondoa baxuegi dago" ez bakarrik "beso posizioa hobetu daiteke"
- Atleta ibiltzen/zutik badago, esan eta eskatu une garrantzitsu batera joateko

ERANTZUN FORMATUA:
- Deskribatu ikusten duzuna
- Azpimarratu 1-2 akats tekniko ZEHATZ nola zuzentzeko
- Amaitu bultzadarekin baina izan ZINTZOA lantzeko dagoenarekin
- Erabili 1-2 emoji, motibatzailea baina teknikoki zorrotza

Izan atletak HOBETZEN dituen entrenatzailea! 3-5 esaldi.`;
            default: return `¡Eres un entrenador EXPERTO en biomecánica con conocimiento técnico PROFUNDO! 🏆

TU PROCESO DE ANÁLISIS (sigue estos pasos mentalmente):
1. IDENTIFICA EL DEPORTE: ¿Qué deporte/disciplina es? (jabalina, peso, carrera, etc.)
2. RECUERDA LA TÉCNICA CORRECTA: ¿Cómo es la forma PERFECTA para este deporte?
   - Ángulos corporales correctos, posición de brazos, piernas, distribución de peso
3. ANALIZA ESTE FOTOGRAMA: Compara lo que ves contra la técnica correcta
4. IDENTIFICA ERRORES: ¿Qué está haciendo MAL el atleta comparado con la forma ideal?
5. DA FEEDBACK HONESTO: Dile específicamente qué corregir

REGLAS CRÍTICAS:
- NO digas solo "se ve bien" - encuentra ERRORES TÉCNICOS REALES que corregir
- Sé ESPECÍFICO: "Tu codo está muy bajo" no solo "la posición del brazo podría mejorar"
- Si el atleta está caminando/parado, dilo y pídele que vaya a un momento clave
- Compara contra la técnica de atletas de élite en este deporte

FORMATO DE RESPUESTA:
- Describe lo que ves (posición, fase del movimiento)
- Señala 1-2 ERRORES TÉCNICOS ESPECÍFICOS con cómo corregirlos
- Termina con ánimo pero sé HONESTO sobre lo que necesita trabajo
- Usa 1-2 emojis, motivador pero técnicamente exigente

¡Sé un entrenador que hace a los atletas MEJORES, no uno que solo alaba! 3-5 frases.`;
        }
    }
    else {
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
// ========== SUBSCRIPTION ENFORCEMENT ==========
const VIDEO_LIMITS = {
    FREE: 3,
    PRO_ATHLETE: 15,
    PRO_COACH: 50,
    PREMIUM: 300,
};
export const registerVideoInGallery = onCall({ region: "europe-west1", maxInstances: 10 }, async (request) => {
    if (!request.auth)
        throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    const uid = request.auth.uid;
    const videoData = request.data.videoData;
    if (!videoData || !videoData.id) {
        throw new HttpsError("invalid-argument", "Missing videoData.");
    }
    return await db.runTransaction(async (t) => {
        // Check Grace Period status (Block bypass)
        const enforcementRef = db.collection("account_enforcement").doc(uid);
        const enforcSnap = await t.get(enforcementRef);
        if (enforcSnap.exists) {
            const status = enforcSnap.data()?.status;
            if (status === 'OVER_LIMIT_GRACE_PERIOD' || status === 'PENDING_ACCOUNT_DELETION' || status === 'DELETION_IN_PROGRESS') {
                throw new HttpsError("failed-precondition", "No puedes subir vídeos en periodo de gracia. Elimina vídeos primero o sube de plan.");
            }
        }
        // Get user to check plan logic
        const userRef = db.collection("users").doc(uid);
        const userSnap = await t.get(userRef);
        let tier = userSnap.exists ? (userSnap.data()?.currentPlanId || 'FREE') : 'FREE';
        // Bypass logic matching frontend configuration
        if (uid.startsWith('test-'))
            tier = uid.includes('premium') ? 'PREMIUM' : (uid.includes('pro') ? 'PRO_ATHLETE' : tier);
        const userEmail = request.auth?.token.email;
        if (userEmail && ['alejandrosanchez@gmail.com', 'peioetxabe@hotmail.com', 'fernandezeuken@gmail.com', 'julianweber@gmail.com'].includes(userEmail.toLowerCase())) {
            tier = 'PREMIUM';
        }
        const limit = VIDEO_LIMITS[tier] || 3;
        // Transact-safe count (limited to max 300, safe memory footprint)
        const videosSnap = await t.get(db.collection(`userdata/${uid}/videos`));
        const currentCount = videosSnap.docs.length;
        if (currentCount >= limit) {
            throw new HttpsError("resource-exhausted", `Límite excedido. Tu plan actual permite máximo ${limit} vídeos en tu galería.`);
        }
        // Append explicitly to subcollection architecture instead of monolithic array
        const newVideoRef = db.collection(`userdata/${uid}/videos`).doc(videoData.id);
        t.set(newVideoRef, videoData);
        return { success: true, count: currentCount + 1, limit };
    });
});
// Helper Centralizado: Revisa el cumplimiento tras borrar/cambiar tier
export const evaluateVideoQuotaCompliance = async (uid) => {
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    let tier = userSnap.exists ? (userSnap.data()?.currentPlanId || 'FREE') : 'FREE';
    // Safety matching
    if (uid.startsWith('test-'))
        tier = uid.includes('premium') ? 'PREMIUM' : (uid.includes('pro') ? 'PRO_ATHLETE' : tier);
    const limit = VIDEO_LIMITS[tier] || 3;
    const videosSnap = await db.collection(`userdata/${uid}/videos`).get();
    const count = videosSnap.docs.length;
    const enforcementRef = db.collection("account_enforcement").doc(uid);
    const enforcSnap = await enforcementRef.get();
    if (count <= limit) {
        // COMPLIANT -> Levantar restricciones
        if (enforcSnap.exists && (enforcSnap.data()?.status === 'OVER_LIMIT_GRACE_PERIOD' || enforcSnap.data()?.status === 'PENDING_ACCOUNT_DELETION')) {
            await enforcementRef.update({
                status: 'COMPLIANT',
                gracePeriodEndsAt: null,
                currentVideoCount: count,
                allowedVideoLimit: limit,
                lastEvaluatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            // Registrar notificación de salvado
            await db.collection("notifications").add({
                userId: uid, title: "Límite restituido",
                body: "¡Genial! Has vuelto dentro de los márgenes de tu plan y desaparecen las restricciones.",
                severity: "info", read: false, createdAt: new Date().toISOString()
            });
        }
    }
    else {
        // NO COMPLIANT
        // Si no existe o estaba Compliant, lanzar el periodo de 3 días
        if (!enforcSnap.exists || enforcSnap.data()?.status === 'COMPLIANT') {
            const daysUnresolved = 3;
            const endLimitTime = new Date();
            endLimitTime.setDate(endLimitTime.getDate() + daysUnresolved);
            await enforcementRef.set({
                userId: uid,
                status: 'OVER_LIMIT_GRACE_PERIOD',
                allowedVideoLimit: limit,
                currentVideoCount: count,
                gracePeriodEndsAt: admin.firestore.Timestamp.fromDate(endLimitTime),
                lastEvaluatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            await db.collection("notifications").add({
                userId: uid, title: "¡Límite excedido por Downgrade!",
                body: `Tu plan actual permite ${limit} vídeos, pero tienes ${count}. Tienes 3 días completos para borrar el exceso o tu cuenta será inhabilitada y purgada de forma automática irrevocablemente.`,
                severity: "critical", read: false, createdAt: new Date().toISOString()
            });
        }
    }
};
export const enforcementCronJob = onSchedule({
    schedule: "every 1 hours",
    timeZone: "UTC",
    region: "europe-west1"
}, async () => {
    const now = admin.firestore.Timestamp.now();
    const overdueSnap = await db.collection("account_enforcement")
        .where("status", "==", "OVER_LIMIT_GRACE_PERIOD")
        .where("gracePeriodEndsAt", "<", now)
        .get();
    const batch = db.batch();
    overdueSnap.docs.forEach(doc => {
        batch.update(doc.ref, {
            status: 'PENDING_ACCOUNT_DELETION',
            lastEvaluatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    });
    if (overdueSnap.size > 0)
        await batch.commit();
    const pendingSnap = await db.collection("account_enforcement")
        .where("status", "==", "PENDING_ACCOUNT_DELETION")
        .limit(10) // Chunk handling safe
        .get();
    for (const doc of pendingSnap.docs) {
        await doc.ref.update({ status: 'DELETION_IN_PROGRESS' });
        const uid = doc.data().userId;
        try {
            await admin.auth().deleteUser(uid);
            await db.collection("userdata").doc(uid).delete();
            await db.collection("users").doc(uid).delete();
            // Subcollections are generally skipped without Firebase Firebase CLI tools, but we ensure enforcement prevents login.
            await doc.ref.update({
                status: 'DELETED',
                deletedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`[Subscription Enforcement] CRITICAL: Purged account ${uid} per overdue bounds.`);
        }
        catch (e) {
            console.error(`Error deleting user ${uid}`, e);
            await doc.ref.update({ status: 'PENDING_ACCOUNT_DELETION' }); // Safe retry structure
        }
    }
});
// Trigger: Downgrade detection when Stripe updates the user's subscription record
export const onSubscriptionChange = onDocumentWritten({ document: "customers/{uid}/subscriptions/{subscriptionId}", region: "europe-west1" }, async (event) => {
    const uid = event.params.uid;
    // After Stripe webhook has modified the record, we trigger the compliance check
    // It will assess their current videos and push them to Grace Period if out-of-bounds
    console.log(`[Subscription Trigger] Evaluating quota compliance for UID: ${uid}`);
    await evaluateVideoQuotaCompliance(uid);
});
// Trigger: Video deletion check
export const onVideoDeletion = onDocumentWritten({ document: "userdata/{uid}/videos/{videoId}", region: "europe-west1" }, async (event) => {
    const uid = event.params.uid;
    // Only run on deletes (to clear grace periods)
    if (!event.data?.after.exists) {
        console.log(`[Video Deletion Trigger] Re-evaluating compliance for UID: ${uid}`);
        await evaluateVideoQuotaCompliance(uid);
    }
});
