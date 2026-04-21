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
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
export { askVideoQuestion, upsertVideoContext } from './videoContext.js';
if (!getApps().length) {
    initializeApp();
}
const db = getFirestore();
// La API Key se guarda de forma segura en Firebase Secrets
const geminiApiKey = defineSecret("GEMINI_API_KEY");
// Delay helper para retry
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
// ========== PROMPTS SECRETOS (NUNCA VISIBLES EN EL NAVEGADOR) ==========
const getSystemPromptForLang = (lang, type) => {
    if (type === 'frame') {
        switch (lang) {
            case 'ing': return `You are an EXPERT biomechanics coach with DEEP technical knowledge! 🏆

YOUR PROCESS AND STRICT RULES FOR VISUAL GROUNDING:
1. OBSERVE THE CURRENT FRAME STRICTLY: Analyze ONLY what is fully visible in the current exact frame.
2. DO NOT ANTICIPATE: Do NOT describe a technical phase as "happening" or "completed" if it isn't visible yet. For instance, do not talk about "release" or "follow-through" if the implement hasn't left the hand.
3. CONTEXT INDEPENDENCE: Do not blindly reuse narratives from the previous chat history if it contradicts the current observable frame.
4. UNCERTAINTY IS OK: If an angle, joint, or phase is not clearly visible or uncertain, explicitly state it instead of guessing. Differentiate between "pre-release" and "release confirmed".
5. PROVIDE HONEST, OBSERVABLE FEEDBACK: Describe what you see, identify 1-2 specific errors (with correction), and maintain an elite coaching standard.

IMPORTANT: You MUST return a STRICT JSON object answering the schema. Do NOT use markdown codeblocks. Just the JSON.`;
            case 'eus': return `Biomekanikako entrenatzaile ADITUA zara jakintza tekniko SAKONA duena! 🏆

ZURE PROZESUA ETA IKUSIZKO ARAU ZORROTZAK:
1. AZTERTU EGUNGO FOTOGRAMA ZORROTZKI: Uneko fotograman soilik guztiz ikusten dena aztertu.
2. EZ AURRERATU: Ez deskribatu fase bat "gertatzen ari" deituz edo "amaituta" gisa, oraindik ikusten ez bada. Adibidez, ez hitz egin "askatzeaz" inplementua oraindik eskuan badago.
3. TESTUINGURUAREN INDEPENDENTZIA: Ez berrerabili itsuki aurreko historia fotogramaren kontra doanean.
4. ZALANTZA ONDO DAGO: Angelu bat edo fase bat ez bada garbi ikusten, esan ezazu asmatu beharrean. Bereizi "askatu aurretik" eta "askatzea berretsita" artean.
5. FEEDBACK ZINTZOA ETA IKUSGARRIA EMAN: Azaldu ikusten duzuna, identifikatu 1-2 akats zehatz, nola zuzendu esan.

GARRANTZITSUA: SCHEMARI erantzuten dion JSON ZORROTZA itzuli BEHAR duzu. Ez erabili markdown kode blokearik. JSON hutsa.`;
            default: return `¡Eres un entrenador EXPERTO en biomecánica con conocimiento profundo! 🏆

TU PROCESO Y REGLAS ESTRICTAS DE GROUNDING VISUAL:
1. OBSERVACIÓN ESTRICTA DEL FRAME: Analiza ÚNICAMENTE lo que es visible en este fotograma exacto.
2. NO ANTICIPES FASES: NUNCA describas una fase de "liberación", "soltado" o "lanzamiento final" si el implemento NO ha salido claramente de la mano en esta imagen.
3. INDEPENDENCIA DEL HISTORIAL: No reutilices ciegamente la narrativa del turno anterior si contradice el frame actual. Recalcula tu análisis desde cero.
4. INCERTIDUMBRE Y PRUDENCIA: Si la fase es ambigua, recógelo. Diferencia estrictamente entre "pre-liberación" y "liberación confirmada".
5. FEEDBACK TÉCNICO ALINEADO: Tras clasificar estrictamente la fase, proporciona correcciones de élite (1-2) atadas exclusivamente al defecto visto. NUNCA suenes más seguro de lo que la imagen permite o inventes detalles que no se ven.

IIMPORTANTE: NUNCA devuelvas Markdown (\`\`\`json). Devuelve EXCLUSIVAMENTE el objeto JSON puro y estricto requerido por el modelo.`;
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
// Resolutor de Tier Autoritativo
const resolveAllowedModelForTier = (tier) => {
    switch (tier) {
        case 'PREMIUM':
        case 'ATLETA_PREMIUM':
        case 'PRO_COACH':
            return 'gemini-2.5-pro';
        case 'PRO_ATHLETE':
        case 'ATLETA_PRO':
        case 'FREE':
        default:
            return 'gemini-2.5-flash';
    }
};
const FRAME_ANALYSIS_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        detected_sport: { type: SchemaType.STRING },
        sport_confidence: { type: SchemaType.STRING },
        observable_phase: { type: SchemaType.STRING },
        phase_confidence: { type: SchemaType.STRING },
        release_visible: { type: SchemaType.BOOLEAN },
        release_visibility_confidence: { type: SchemaType.STRING },
        visible_evidence: { type: SchemaType.STRING },
        not_visible_or_uncertain: { type: SchemaType.STRING },
        allowed_claims: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        forbidden_claims: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        primary_faults: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        top_priority_correction: { type: SchemaType.STRING },
        final_user_answer: { type: SchemaType.STRING },
    },
    required: ["observable_phase", "release_visible", "not_visible_or_uncertain", "final_user_answer"]
};
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
    const { base64Image, promptText, chatHistory, language } = request.data;
    const uid = request.auth.uid;
    if (!base64Image) {
        throw new HttpsError("invalid-argument", "Se requiere una imagen.");
    }
    // Recuperar Plan Real Canónico
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    let tier = userSnap.exists ? (userSnap.data()?.currentPlanId || 'FREE') : 'FREE';
    // Bypass mapping for testing like in other functions
    if (uid.startsWith('test-'))
        tier = uid.includes('premium') ? 'PREMIUM' : (uid.includes('pro') ? 'PRO_ATHLETE' : tier);
    const userEmail = request.auth?.token.email;
    if (userEmail && ['alejandrosanchez@gmail.com', 'peioetxabe@hotmail.com', 'fernandezeuken@gmail.com', 'julianweber@gmail.com'].includes(userEmail.toLowerCase())) {
        tier = 'PREMIUM';
    }
    const modelName = resolveAllowedModelForTier(tier);
    const genAI = new GoogleGenerativeAI(geminiApiKey.value());
    const systemContext = getSystemPromptForLang(language || 'es', 'frame');
    const fullPrompt = `${systemContext}\n\nContexto previo: ${(chatHistory || []).slice(-2).join('\n')}\n\nPregunta del usuario: ${promptText || 'Analiza estrictamente lo visible en esta imagen'}`;
    console.log(`[analizarFrame API Call] UID: ${uid} | Tier: ${tier} | Resuelto a Modelo: ${modelName}`);
    try {
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: FRAME_ANALYSIS_SCHEMA
            }
        });
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
        const responseText = result.response?.text?.() || "{}";
        const parsedPayload = JSON.parse(responseText);
        const finalUserAnswer = parsedPayload.final_user_answer || "El formato obtenido del entrenador AI fue devuelto vacío.";
        // Save AI Usage Logs
        await db.collection("ai_analysis_logs").add({
            userId: uid,
            subscriptionPlan: tier,
            resolvedModel: modelName,
            observablePhase: parsedPayload.observable_phase || null,
            releaseVisible: parsedPayload.release_visible || false,
            notVisibleOrUncertain: parsedPayload.not_visible_or_uncertain || null,
            timestamp: FieldValue.serverTimestamp()
        });
        return {
            result: finalUserAnswer,
            metadata: parsedPayload
        };
    }
    catch (error) {
        console.error("[analizarFrame] Error completo:", JSON.stringify(error, null, 2));
        console.error("[analizarFrame] Error status:", error?.status);
        throw new HttpsError("internal", "Error al analizar la imagen y extraer contexto.");
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
    const { message, history, language } = request.data;
    const uid = request.auth.uid;
    if (!message) {
        throw new HttpsError("invalid-argument", "Se requiere un mensaje.");
    }
    // Recuperar Plan Real Canónico
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    let tier = userSnap.exists ? (userSnap.data()?.currentPlanId || 'FREE') : 'FREE';
    // Bypass mapping
    if (uid.startsWith('test-'))
        tier = uid.includes('premium') ? 'PREMIUM' : (uid.includes('pro') ? 'PRO_ATHLETE' : tier);
    const userEmail = request.auth?.token.email;
    if (userEmail && ['alejandrosanchez@gmail.com', 'peioetxabe@hotmail.com', 'fernandezeuken@gmail.com', 'julianweber@gmail.com'].includes(userEmail.toLowerCase())) {
        tier = 'PREMIUM';
    }
    const modelName = resolveAllowedModelForTier(tier);
    const genAI = new GoogleGenerativeAI(geminiApiKey.value());
    const systemInstruction = getSystemPromptForLang(language || 'es', 'chat');
    console.log(`[chatWithCoach API Call] UID: ${uid} | Tier: ${tier} | Resuelto a Modelo: ${modelName}`);
    try {
        const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction
        });
        const result = await model.generateContent(message);
        const responseText = result.response?.text?.() || "No tengo respuesta en este momento.";
        // Log plain coaching usage
        await db.collection("ai_analysis_logs").add({
            userId: uid,
            subscriptionPlan: tier,
            resolvedModel: modelName,
            timestamp: FieldValue.serverTimestamp()
        });
        return { result: responseText };
    }
    catch (error) {
        console.error("[chatWithCoach] Error completo:", JSON.stringify(error, null, 2));
        throw new HttpsError("internal", "Error al conectar con el entrenador.");
    }
});
// ========== SUBSCRIPTION ENFORCEMENT ==========
// Central source of truth for plan limits (must mirror subscriptionService.ts on frontend)
const PLAN_LIMITS = {
    FREE: { videos: 3, pdfs: 5, analyses: 3, chats: 10, athletes: 0 },
    PRO_ATHLETE: { videos: 15, pdfs: 15, analyses: 15, chats: 100, athletes: 0 },
    PRO_COACH: { videos: 50, pdfs: 100, analyses: 100, chats: 200, athletes: 20 },
    PREMIUM: { videos: 300, pdfs: 300, analyses: 300, chats: 500, athletes: 50 },
};
// Premium bypass emails
const PREMIUM_EMAILS = ['alejandrosanchez@gmail.com', 'peioetxabe@hotmail.com', 'fernandezeuken@gmail.com', 'julianweber@gmail.com'];
// Resolve user tier from Firestore + bypass rules
const resolveUserTier = (uid, userEmail, userData) => {
    if (userEmail && PREMIUM_EMAILS.includes(userEmail.toLowerCase()))
        return 'PREMIUM';
    if (uid.startsWith('test-')) {
        if (uid.includes('premium'))
            return 'PREMIUM';
        if (uid.includes('pro'))
            return 'PRO_ATHLETE';
        return 'FREE';
    }
    return userData?.currentPlanId || userData?.profile?.subscriptionTier || 'FREE';
};
// Validate that caller has access to the target user profile
const validateTargetAccess = async (t, callerId, targetUserId) => {
    if (callerId === targetUserId)
        return; // Own profile, always allowed
    // Check canonical request document
    const reqRef = db.collection('requests').doc(`${callerId}_${targetUserId}`);
    const reqSnap = await t.get(reqRef);
    if (!reqSnap.exists || reqSnap.data()?.status !== 'accepted') {
        throw new HttpsError('permission-denied', `No tienes acceso al perfil del atleta ${targetUserId}. La relación debe ser aceptada.`);
    }
};
export const registerVideoInGallery = onCall({ region: "europe-west1", maxInstances: 10 }, async (request) => {
    if (!request.auth)
        throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    const uid = request.auth.uid;
    const videoData = request.data.videoData;
    const targetUserId = request.data.targetUserId || uid;
    if (!videoData || !videoData.id) {
        throw new HttpsError("invalid-argument", "Missing videoData.");
    }
    return await db.runTransaction(async (t) => {
        // 1. Validate target access (own profile or accepted coach relationship)
        await validateTargetAccess(t, uid, targetUserId);
        // 2. Check Grace Period status (Block bypass)
        const enforcementRef = db.collection("account_enforcement").doc(uid);
        const enforcSnap = await t.get(enforcementRef);
        if (enforcSnap.exists) {
            const status = enforcSnap.data()?.status;
            if (status === 'OVER_LIMIT_GRACE_PERIOD' || status === 'PENDING_ACCOUNT_DELETION' || status === 'DELETION_IN_PROGRESS') {
                throw new HttpsError("failed-precondition", "No puedes subir vídeos en periodo de gracia. Elimina vídeos primero o sube de plan.");
            }
        }
        // 3. Resolve tier from the UPLOADER (quota payer), not the target
        const userRef = db.collection("users").doc(uid);
        const userSnap = await t.get(userRef);
        const userData = userSnap.exists ? userSnap.data() : {};
        const tier = resolveUserTier(uid, request.auth?.token.email, userData);
        const limits = PLAN_LIMITS[tier] || PLAN_LIMITS.FREE;
        // 4. Read or initialize the quota counter (atomic, race-condition safe)
        const counterRef = db.collection("quota_counters").doc(uid);
        const counterSnap = await t.get(counterRef);
        const counters = counterSnap.exists ? counterSnap.data() : { videosGlobal: 0, pdfsGlobal: 0 };
        const currentVideoCount = counters.videosGlobal || 0;
        if (currentVideoCount >= limits.videos) {
            throw new HttpsError("resource-exhausted", `Límite excedido. Tu plan permite máximo ${limits.videos} vídeos globales.`);
        }
        // 5. Tag ownership on the video data
        const taggedVideoData = {
            ...videoData,
            uploadedByCoachId: uid !== targetUserId ? uid : null,
            uploadedAt: FieldValue.serverTimestamp(),
            quotaCounted: true,
        };
        // 6. Write video to the TARGET user's subcollection
        const newVideoRef = db.collection(`userdata/${targetUserId}/videos`).doc(videoData.id);
        t.set(newVideoRef, taggedVideoData);
        // 7. Atomically increment the UPLOADER's global counter
        t.set(counterRef, {
            videosGlobal: currentVideoCount + 1,
            lastUpdated: FieldValue.serverTimestamp(),
        }, { merge: true });
        return { success: true, count: currentVideoCount + 1, limit: limits.videos };
    });
});
export const registerPdfInGallery = onCall({ region: "europe-west1", maxInstances: 10 }, async (request) => {
    if (!request.auth)
        throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    const uid = request.auth.uid;
    const pdfData = request.data.pdfData;
    const targetUserId = request.data.targetUserId || uid;
    if (!pdfData || !pdfData.id) {
        throw new HttpsError("invalid-argument", "Missing pdfData.");
    }
    return await db.runTransaction(async (t) => {
        // 1. Validate target access
        await validateTargetAccess(t, uid, targetUserId);
        // 2. Check Grace Period
        const enforcementRef = db.collection("account_enforcement").doc(uid);
        const enforcSnap = await t.get(enforcementRef);
        if (enforcSnap.exists) {
            const status = enforcSnap.data()?.status;
            if (status === 'OVER_LIMIT_GRACE_PERIOD' || status === 'PENDING_ACCOUNT_DELETION' || status === 'DELETION_IN_PROGRESS') {
                throw new HttpsError("failed-precondition", "No puedes subir PDFs en periodo de gracia.");
            }
        }
        // 3. Resolve tier from the UPLOADER
        const userRef = db.collection("users").doc(uid);
        const userSnap = await t.get(userRef);
        const userData = userSnap.exists ? userSnap.data() : {};
        const tier = resolveUserTier(uid, request.auth?.token.email, userData);
        const limits = PLAN_LIMITS[tier] || PLAN_LIMITS.FREE;
        // 4. Quota counter
        const counterRef = db.collection("quota_counters").doc(uid);
        const counterSnap = await t.get(counterRef);
        const counters = counterSnap.exists ? counterSnap.data() : { videosGlobal: 0, pdfsGlobal: 0 };
        const currentPdfCount = counters.pdfsGlobal || 0;
        if (currentPdfCount >= limits.pdfs) {
            throw new HttpsError("resource-exhausted", `Límite excedido. Tu plan permite máximo ${limits.pdfs} PDFs globales.`);
        }
        // 5. Tag ownership
        const taggedPdfData = {
            ...pdfData,
            uploadedByCoachId: uid !== targetUserId ? uid : null,
            uploadedAt: FieldValue.serverTimestamp(),
            quotaCounted: true,
        };
        // 6. Write to target's plans subcollection
        const newPdfRef = db.collection(`userdata/${targetUserId}/plans`).doc(pdfData.id);
        t.set(newPdfRef, taggedPdfData);
        // 7. Atomically increment uploader's global PDF counter
        t.set(counterRef, {
            pdfsGlobal: currentPdfCount + 1,
            lastUpdated: FieldValue.serverTimestamp(),
        }, { merge: true });
        return { success: true, count: currentPdfCount + 1, limit: limits.pdfs };
    });
});
// Callable: Get coach's global quota usage
export const getCoachQuotaUsage = onCall({ region: "europe-west1", maxInstances: 10 }, async (request) => {
    if (!request.auth)
        throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    const uid = request.auth.uid;
    const counterSnap = await db.collection("quota_counters").doc(uid).get();
    const counters = counterSnap.exists ? counterSnap.data() : { videosGlobal: 0, pdfsGlobal: 0 };
    const userSnap = await db.collection("users").doc(uid).get();
    const userData = userSnap.exists ? userSnap.data() : {};
    const tier = resolveUserTier(uid, request.auth?.token.email, userData);
    const limits = PLAN_LIMITS[tier] || PLAN_LIMITS.FREE;
    return {
        videosUsed: counters.videosGlobal || 0,
        videosLimit: limits.videos,
        pdfsUsed: counters.pdfsGlobal || 0,
        pdfsLimit: limits.pdfs,
        tier
    };
});
// Helper Centralizado: Revisa el cumplimiento tras borrar/cambiar tier
export const evaluateVideoQuotaCompliance = async (uid) => {
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : {};
    const tier = resolveUserTier(uid, undefined, userData);
    const limits = PLAN_LIMITS[tier] || PLAN_LIMITS.FREE;
    // Use the authoritative quota counter
    const counterSnap = await db.collection("quota_counters").doc(uid).get();
    const counters = counterSnap.exists ? counterSnap.data() : { videosGlobal: 0, pdfsGlobal: 0 };
    const videoCount = counters.videosGlobal || 0;
    const enforcementRef = db.collection("account_enforcement").doc(uid);
    const enforcSnap = await enforcementRef.get();
    if (videoCount <= limits.videos) {
        // COMPLIANT -> Levantar restricciones
        if (enforcSnap.exists && (enforcSnap.data()?.status === 'OVER_LIMIT_GRACE_PERIOD' || enforcSnap.data()?.status === 'PENDING_ACCOUNT_DELETION')) {
            await enforcementRef.update({
                status: 'COMPLIANT',
                gracePeriodEndsAt: null,
                currentVideoCount: videoCount,
                allowedVideoLimit: limits.videos,
                lastEvaluatedAt: FieldValue.serverTimestamp()
            });
            await db.collection("notifications").add({
                userId: uid, title: "Límite restituido",
                body: "¡Genial! Has vuelto dentro de los márgenes de tu plan y desaparecen las restricciones.",
                severity: "info", read: false, createdAt: new Date().toISOString()
            });
        }
    }
    else {
        // NO COMPLIANT
        if (!enforcSnap.exists || enforcSnap.data()?.status === 'COMPLIANT') {
            const daysUnresolved = 3;
            const endLimitTime = new Date();
            endLimitTime.setDate(endLimitTime.getDate() + daysUnresolved);
            await enforcementRef.set({
                userId: uid,
                status: 'OVER_LIMIT_GRACE_PERIOD',
                allowedVideoLimit: limits.videos,
                currentVideoCount: videoCount,
                gracePeriodEndsAt: Timestamp.fromDate(endLimitTime),
                lastEvaluatedAt: FieldValue.serverTimestamp()
            }, { merge: true });
            await db.collection("notifications").add({
                userId: uid, title: "¡Límite excedido por Downgrade!",
                body: `Tu plan actual permite ${limits.videos} vídeos, pero tienes ${videoCount}. Tienes 3 días completos para borrar el exceso o tu cuenta será inhabilitada y purgada de forma automática irrevocablemente.`,
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
    const now = Timestamp.now();
    const overdueSnap = await db.collection("account_enforcement")
        .where("status", "==", "OVER_LIMIT_GRACE_PERIOD")
        .where("gracePeriodEndsAt", "<", now)
        .get();
    const batch = db.batch();
    overdueSnap.docs.forEach(doc => {
        batch.update(doc.ref, {
            status: 'PENDING_ACCOUNT_DELETION',
            lastEvaluatedAt: FieldValue.serverTimestamp()
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
            await getAuth().deleteUser(uid);
            await db.collection("userdata").doc(uid).delete();
            await db.collection("users").doc(uid).delete();
            // Subcollections are generally skipped without Firebase Firebase CLI tools, but we ensure enforcement prevents login.
            await doc.ref.update({
                status: 'DELETED',
                deletedAt: FieldValue.serverTimestamp()
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
// Trigger: count direct-write fallback video uploads when callable flow was unavailable
export const onVideoCreatedFallback = onDocumentWritten({ document: "userdata/{uid}/videos/{videoId}", region: "europe-west1" }, async (event) => {
    if (!event.data?.after.exists || event.data?.before.exists)
        return;
    const uid = event.params.uid;
    const createdData = event.data.after.data();
    if (createdData?.quotaCounted !== false)
        return;
    const quotaPayer = createdData?.uploadedByCoachId || uid;
    await db.collection("quota_counters").doc(quotaPayer).set({
        videosGlobal: FieldValue.increment(1),
        lastUpdated: FieldValue.serverTimestamp()
    }, { merge: true });
    await event.data.after.ref.set({
        quotaCounted: true,
        fallbackCountedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    console.log(`[Video Fallback Trigger] Counted direct-write upload for UID: ${quotaPayer}`);
    await evaluateVideoQuotaCompliance(quotaPayer);
});
// Trigger: count direct-write fallback PDF uploads when callable flow was unavailable
export const onPdfCreatedFallback = onDocumentWritten({ document: "userdata/{uid}/plans/{planId}", region: "europe-west1" }, async (event) => {
    if (!event.data?.after.exists || event.data?.before.exists)
        return;
    const uid = event.params.uid;
    const createdData = event.data.after.data();
    if (createdData?.quotaCounted !== false)
        return;
    const quotaPayer = createdData?.uploadedByCoachId || uid;
    await db.collection("quota_counters").doc(quotaPayer).set({
        pdfsGlobal: FieldValue.increment(1),
        lastUpdated: FieldValue.serverTimestamp()
    }, { merge: true });
    await event.data.after.ref.set({
        quotaCounted: true,
        fallbackCountedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    console.log(`[PDF Fallback Trigger] Counted direct-write upload for UID: ${quotaPayer}`);
});
// Trigger: Video deletion check
export const onVideoDeletion = onDocumentWritten({ document: "userdata/{uid}/videos/{videoId}", region: "europe-west1" }, async (event) => {
    const uid = event.params.uid;
    // Only run on deletes (to clear grace periods and decrement counters)
    if (!event.data?.after.exists) {
        const deletedData = event.data?.before.data();
        if (deletedData?.quotaCounted === false) {
            return;
        }
        // Determine who "paid" for this video: the coach who uploaded it, or the profile owner
        const quotaPayer = deletedData?.uploadedByCoachId || uid;
        // Decrement the quota counter for the payer
        const counterRef = db.collection("quota_counters").doc(quotaPayer);
        const counterSnap = await counterRef.get();
        if (counterSnap.exists) {
            const current = counterSnap.data()?.videosGlobal || 0;
            if (current > 0) {
                await counterRef.update({
                    videosGlobal: current - 1,
                    lastUpdated: FieldValue.serverTimestamp()
                });
            }
        }
        console.log(`[Video Deletion Trigger] Re-evaluating compliance for UID: ${quotaPayer}`);
        await evaluateVideoQuotaCompliance(quotaPayer);
    }
});
// Trigger: PDF deletion (decrement counter)
export const onPdfDeletion = onDocumentWritten({ document: "userdata/{uid}/plans/{planId}", region: "europe-west1" }, async (event) => {
    const uid = event.params.uid;
    if (!event.data?.after.exists) {
        const deletedData = event.data?.before.data();
        if (deletedData?.quotaCounted === false) {
            return;
        }
        const quotaPayer = deletedData?.uploadedByCoachId || uid;
        const counterRef = db.collection("quota_counters").doc(quotaPayer);
        const counterSnap = await counterRef.get();
        if (counterSnap.exists) {
            const current = counterSnap.data()?.pdfsGlobal || 0;
            if (current > 0) {
                await counterRef.update({
                    pdfsGlobal: current - 1,
                    lastUpdated: FieldValue.serverTimestamp()
                });
            }
        }
        console.log(`[PDF Deletion Trigger] Decremented counter for UID: ${quotaPayer}`);
    }
});
