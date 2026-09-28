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
import { GoogleGenerativeAI, Schema, SchemaType } from "@google/generative-ai";
import { getApps, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import {
    PLAN_LIMITS,
    consumeMonthlyQuota,
    getServerMonthKey,
    normalizeMonthlyCounters,
    buildCounterUpdate,
    resolveUserTier,
    resolveAllowedModelForTier,
    toMillis,
} from './quota.js';
export { askVideoQuestion, upsertVideoContext } from './videoContext.js';

if (!getApps().length) {
    initializeApp();
}
const db = getFirestore();

// La API Key se guarda de forma segura en Firebase Secrets
const geminiApiKey = defineSecret("GEMINI_API_KEY");

// Delay helper para retry
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ========== PROMPTS SECRETOS (NUNCA VISIBLES EN EL NAVEGADOR) ==========

const getSystemPromptForLang = (lang: 'es' | 'ing' | 'eus', type: 'frame' | 'chat') => {
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

const FRAME_ANALYSIS_SCHEMA: Schema = {
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

        const { base64Image, promptText, chatHistory, language } = request.data;
        const uid = request.auth.uid;

        if (!base64Image || typeof base64Image !== 'string') {
            throw new HttpsError("invalid-argument", "Se requiere una imagen.");
        }
        // ~10MB decoded; anything larger inflates Gemini cost and risks the function timeout.
        if (base64Image.length > 14_000_000) {
            throw new HttpsError("invalid-argument", "La imagen es demasiado grande.");
        }
        if (promptText !== undefined && (typeof promptText !== 'string' || promptText.length > 4000)) {
            throw new HttpsError("invalid-argument", "El texto de la consulta no es válido.");
        }
        if (chatHistory !== undefined && !Array.isArray(chatHistory)) {
            throw new HttpsError("invalid-argument", "El historial no es válido.");
        }
        const boundedHistory = (Array.isArray(chatHistory) ? chatHistory : [])
            .slice(-2)
            .map((entry: unknown) => String(entry).slice(0, 2000));

        const quota = await consumeMonthlyQuota(uid, request.auth?.token.email, 'analyses');
        const tier = quota.tier;

        const modelName = resolveAllowedModelForTier(tier);

        const genAI = new GoogleGenerativeAI(geminiApiKey.value());
        const systemContext = getSystemPromptForLang(language || 'es', 'frame');
        const fullPrompt = `${systemContext}\n\nContexto previo: ${boundedHistory.join('\n')}\n\nPregunta del usuario: ${promptText || 'Analiza estrictamente lo visible en esta imagen'}`;

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
                metadata: parsedPayload,
                analysesUsed: quota.count,
                analysesLimit: quota.limit,
            };
        } catch (error: any) {
            // Log only message/status: the SDK error object can embed request config.
            console.error("[analizarFrame] Error:", error?.message, "| status:", error?.status);
            throw new HttpsError("internal", "Error al analizar la imagen y extraer contexto.");
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

        const { message, history, language } = request.data;
        const uid = request.auth.uid;

        if (!message || typeof message !== 'string') {
            throw new HttpsError("invalid-argument", "Se requiere un mensaje.");
        }
        if (message.length > 8000) {
            throw new HttpsError("invalid-argument", "El mensaje es demasiado largo.");
        }

        const quota = await consumeMonthlyQuota(uid, request.auth?.token.email, 'chats');
        const tier = quota.tier;

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
        } catch (error: any) {
            console.error("[chatWithCoach] Error:", error?.message, "| status:", error?.status);
            throw new HttpsError("internal", "Error al conectar con el entrenador.");
        }
    }
);

// ========== SUBSCRIPTION ENFORCEMENT ==========
// Plan limits, tier resolution and quota counters live in quota.ts.

type StoredAssetKind = 'videos' | 'plans';

type StoredAssetRecord = {
    id: string;
    data: any;
    ref?: FirebaseFirestore.DocumentReference;
};

const getAssetTimestamp = (asset: any) =>
    toMillis(asset?.uploadedAt) ||
    toMillis(asset?.createdAt) ||
    toMillis(asset?.date) ||
    (/^\d+$/.test(String(asset?.id || '')) ? Number(asset.id) : 0);

// A registered asset's storagePath must live under the target user's own
// Storage prefix. The enforcement cron later deletes that path with admin
// credentials, so a client-supplied path pointing elsewhere would let a
// caller destroy another user's files.
const assertOwnedStoragePath = (storagePath: unknown, kind: StoredAssetKind, targetUserId: string): void => {
    if (storagePath === undefined || storagePath === null || storagePath === '') return;
    const prefix = `${kind}/${targetUserId}/`;
    if (typeof storagePath !== 'string' || storagePath.includes('..') || !storagePath.startsWith(prefix)) {
        throw new HttpsError("invalid-argument", `storagePath inválido: debe estar bajo ${prefix}`);
    }
};

// Validate that caller has access to the target user profile
const validateTargetAccess = async (t: FirebaseFirestore.Transaction, callerId: string, targetUserId: string): Promise<void> => {
    if (callerId === targetUserId) return; // Own profile, always allowed

    // Check canonical request document
    const reqRef = db.collection('requests').doc(`${callerId}_${targetUserId}`);
    const reqSnap = await t.get(reqRef);
    if (!reqSnap.exists || reqSnap.data()?.status !== 'accepted') {
        throw new HttpsError('permission-denied', `No tienes acceso al perfil del atleta ${targetUserId}. La relación debe ser aceptada.`);
    }
};

export const registerVideoInGallery = onCall(
    { region: "europe-west1", maxInstances: 10 },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
        
        const uid = request.auth.uid;
        const videoData = request.data.videoData;
        const targetUserId: string = request.data.targetUserId || uid;
        
        if (!videoData || !videoData.id) {
            throw new HttpsError("invalid-argument", "Missing videoData.");
        }
        assertOwnedStoragePath(videoData.storagePath, 'videos', targetUserId);

        return await db.runTransaction(async (t) => {
            // 1. Validate target access (own profile or accepted coach relationship)
            await validateTargetAccess(t, uid, targetUserId);

            // 2. Check Grace Period status (Block bypass)
            const enforcementRef = db.collection("account_enforcement").doc(uid);
            const enforcSnap = await t.get(enforcementRef);
            if (enforcSnap.exists) {
                const status = enforcSnap.data()?.status;
                if (['OVER_LIMIT_GRACE_PERIOD', 'PENDING_ASSET_DELETION', 'ASSET_DELETION_IN_PROGRESS', 'PENDING_ACCOUNT_DELETION', 'DELETION_IN_PROGRESS'].includes(status)) {
                    throw new HttpsError("failed-precondition", "No puedes subir vídeos en periodo de gracia. Elimina vídeos primero o sube de plan.");
                }
            }

            // 3. Resolve tier from the UPLOADER (quota payer), not the target
            const tier = await resolveUserTier(uid, request.auth?.token.email, t);
            const limits = PLAN_LIMITS[tier] || PLAN_LIMITS.FREE;

            // 4. Read or initialize the monthly quota counter (atomic, race-condition safe)
            const period = getServerMonthKey();
            const counterRef = db.collection("quota_counters").doc(uid);
            const userDataRef = db.collection("userdata").doc(uid);
            const [counterSnap, userDataSnap] = await Promise.all([
                t.get(counterRef),
                t.get(userDataRef),
            ]);
            const counters = normalizeMonthlyCounters(
                counterSnap.exists ? counterSnap.data()! : {},
                period,
                userDataSnap.exists ? userDataSnap.data()?.usage : undefined,
            );
            const currentVideoCount = counters.videos;

            if (currentVideoCount >= limits.videos) {
                throw new HttpsError("resource-exhausted", `Has alcanzado el límite mensual de vídeos de tu suscripción. Tu plan permite ${limits.videos}.`);
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

            // 7. Atomically increment the UPLOADER's monthly counter.
            t.set(counterRef, buildCounterUpdate(period, {
                ...counters,
                videos: currentVideoCount + 1,
            }), { merge: true });

            return { success: true, count: currentVideoCount + 1, limit: limits.videos, period, tier };
        });
    }
);

export const registerPdfInGallery = onCall(
    { region: "europe-west1", maxInstances: 10 },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
        
        const uid = request.auth.uid;
        const pdfData = request.data.pdfData;
        const targetUserId: string = request.data.targetUserId || uid;
        
        if (!pdfData || !pdfData.id) {
            throw new HttpsError("invalid-argument", "Missing pdfData.");
        }
        assertOwnedStoragePath(pdfData.storagePath, 'plans', targetUserId);

        return await db.runTransaction(async (t) => {
            // 1. Validate target access
            await validateTargetAccess(t, uid, targetUserId);

            // 2. Check Grace Period
            const enforcementRef = db.collection("account_enforcement").doc(uid);
            const enforcSnap = await t.get(enforcementRef);
            if (enforcSnap.exists) {
                const status = enforcSnap.data()?.status;
                if (['OVER_LIMIT_GRACE_PERIOD', 'PENDING_ASSET_DELETION', 'ASSET_DELETION_IN_PROGRESS', 'PENDING_ACCOUNT_DELETION', 'DELETION_IN_PROGRESS'].includes(status)) {
                    throw new HttpsError("failed-precondition", "No puedes subir PDFs en periodo de gracia.");
                }
            }

            // 3. Resolve tier from the UPLOADER
            const tier = await resolveUserTier(uid, request.auth?.token.email, t);
            const limits = PLAN_LIMITS[tier] || PLAN_LIMITS.FREE;

            // 4. Monthly quota counter
            const period = getServerMonthKey();
            const counterRef = db.collection("quota_counters").doc(uid);
            const userDataRef = db.collection("userdata").doc(uid);
            const [counterSnap, userDataSnap] = await Promise.all([
                t.get(counterRef),
                t.get(userDataRef),
            ]);
            const counters = normalizeMonthlyCounters(
                counterSnap.exists ? counterSnap.data()! : {},
                period,
                userDataSnap.exists ? userDataSnap.data()?.usage : undefined,
            );
            const currentPdfCount = counters.pdfs;

            if (currentPdfCount >= limits.pdfs) {
                throw new HttpsError("resource-exhausted", `Has alcanzado el límite mensual de PDFs de tu suscripción. Tu plan permite ${limits.pdfs}.`);
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

            // 7. Atomically increment uploader's monthly PDF counter
            t.set(counterRef, buildCounterUpdate(period, {
                ...counters,
                pdfs: currentPdfCount + 1,
            }), { merge: true });

            return { success: true, count: currentPdfCount + 1, limit: limits.pdfs, period, tier };
        });
    }
);

// Callable: Get coach's global quota usage
export const getCoachQuotaUsage = onCall(
    { region: "europe-west1", maxInstances: 10 },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
        const uid = request.auth.uid;

        const period = getServerMonthKey();
        const [counterSnap, userDataSnap] = await Promise.all([
            db.collection("quota_counters").doc(uid).get(),
            db.collection("userdata").doc(uid).get(),
        ]);
        const counters = normalizeMonthlyCounters(
            counterSnap.exists ? counterSnap.data()! : {},
            period,
            userDataSnap.exists ? userDataSnap.data()?.usage : undefined,
        );

        const tier = await resolveUserTier(uid, request.auth?.token.email);
        const limits = PLAN_LIMITS[tier] || PLAN_LIMITS.FREE;

        return {
            videosUsed: counters.videos,
            videosLimit: limits.videos,
            pdfsUsed: counters.pdfs,
            pdfsLimit: limits.pdfs,
            chatsUsed: counters.chats,
            chatsLimit: limits.chats,
            analysesUsed: counters.analyses,
            analysesLimit: limits.analyses,
            period,
            tier
        };
    }
);

// ========== COACH-ATHLETE RELATIONSHIP (server-managed) ==========

// Callable: look up an athlete by email and create/refresh the coach request.
// This replaces the old client flow, which required world-readable `users`
// documents (PII enumeration) and client-created request docs (forgeable).
export const sendCoachRequest = onCall(
    { region: "europe-west1", maxInstances: 10 },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
        const coachId = request.auth.uid;

        const rawEmail = request.data?.athleteEmail;
        if (typeof rawEmail !== 'string' || !rawEmail.trim() || rawEmail.length > 320) {
            throw new HttpsError("invalid-argument", "Email de atleta inválido.");
        }
        const athleteEmail = rawEmail.trim().toLowerCase();

        const tier = await resolveUserTier(coachId, request.auth.token.email);
        const limits = PLAN_LIMITS[tier] || PLAN_LIMITS.FREE;
        if (limits.athletes <= 0) {
            throw new HttpsError("permission-denied", "Tu plan no permite gestionar atletas. Mejora tu suscripción.");
        }

        const acceptedSnap = await db.collection("requests")
            .where("coachId", "==", coachId)
            .where("status", "==", "accepted")
            .get();
        if (acceptedSnap.size >= limits.athletes) {
            throw new HttpsError("resource-exhausted", `Tu plan permite gestionar ${limits.athletes} atletas como máximo.`);
        }

        const athleteSnap = await db.collection("users").where("username", "==", athleteEmail).limit(1).get();
        if (athleteSnap.empty) throw new HttpsError("not-found", "Atleta no encontrado.");
        const athleteDoc = athleteSnap.docs[0];
        const athleteId = athleteDoc.id;
        if (athleteId === coachId) throw new HttpsError("invalid-argument", "No puedes enviarte una solicitud a ti mismo.");
        const athleteData = athleteDoc.data() as any;

        const coachSnap = await db.collection("users").doc(coachId).get();
        const coachProfile = coachSnap.exists ? (coachSnap.data() as any)?.profile : null;

        const reqRef = db.collection("requests").doc(`${coachId}_${athleteId}`);
        const existing = await reqRef.get();
        if (existing.exists && existing.data()?.status === 'accepted') {
            return { success: true, alreadyAccepted: true };
        }

        await reqRef.set({
            coachId,
            coachName: `${coachProfile?.firstName || ''} ${coachProfile?.lastName || ''}`.trim() || 'Entrenador',
            athleteId,
            athleteEmail,
            athleteName: `${athleteData?.profile?.firstName || ''} ${athleteData?.profile?.lastName || ''}`.trim(),
            athleteDiscipline: athleteData?.profile?.discipline || 'Atleta',
            status: 'pending',
            createdAt: new Date().toISOString()
        }, { merge: true });

        return { success: true };
    }
);

// Trigger: keep users' managedAthletes/coaches arrays in sync with request
// status transitions. The clients used to write these cross-user updates
// directly, which Firestore rules (correctly) deny — so acceptance was
// silently half-broken. The server is now the only writer.
export const onCoachRequestWritten = onDocumentWritten(
    { document: "requests/{requestId}", region: "europe-west1" },
    async (event) => {
        const before = event.data?.before.exists ? event.data.before.data() : null;
        const after = event.data?.after.exists ? event.data.after.data() : null;
        const wasAccepted = before?.status === 'accepted';
        const isAccepted = after?.status === 'accepted';
        if (wasAccepted === isAccepted) return;

        const coachId = (after ?? before)?.coachId;
        const athleteId = (after ?? before)?.athleteId;
        if (typeof coachId !== 'string' || typeof athleteId !== 'string' || !coachId || !athleteId) return;

        const op = isAccepted ? FieldValue.arrayUnion : FieldValue.arrayRemove;
        await Promise.allSettled([
            db.collection("users").doc(coachId).set(
                { profile: { managedAthletes: op(athleteId) } }, { merge: true }),
            db.collection("users").doc(athleteId).set(
                { profile: { coaches: op(coachId) } }, { merge: true }),
        ]);
    }
);

const readStoredAssets = async (uid: string, kind: StoredAssetKind): Promise<StoredAssetRecord[]> => {
    const rootRef = db.collection("userdata").doc(uid);
    const [rootSnap, subSnap] = await Promise.all([
        rootRef.get(),
        rootRef.collection(kind).get(),
    ]);

    const merged = new Map<string, StoredAssetRecord>();

    subSnap.docs.forEach((doc) => {
        merged.set(doc.id, {
            id: doc.id,
            data: { id: doc.id, ...doc.data() },
            ref: doc.ref,
        });
    });

    const arrayField = kind === 'videos' ? 'videos' : 'plans';
    const legacyAssets = Array.isArray(rootSnap.data()?.[arrayField]) ? rootSnap.data()?.[arrayField] : [];
    legacyAssets.forEach((asset: any) => {
        const id = String(asset?.id || '');
        if (!id) return;
        if (!merged.has(id)) {
            merged.set(id, { id, data: asset });
        }
    });

    return Array.from(merged.values()).sort((a, b) => getAssetTimestamp(b.data) - getAssetTimestamp(a.data));
};

const deleteStorageObjectForAsset = async (asset: StoredAssetRecord, expectedPrefix: string) => {
    const storagePath = asset.data?.storagePath;
    if (!storagePath) return;
    // Never delete outside the owner's prefix: storagePath originates from
    // client-written documents and must not be trusted with admin credentials.
    if (typeof storagePath !== 'string' || !storagePath.startsWith(expectedPrefix)) {
        console.warn(`[Subscription Enforcement] Refusing to delete storage object outside ${expectedPrefix}: ${storagePath}`);
        return;
    }
    try {
        await getStorage().bucket().file(storagePath).delete({ ignoreNotFound: true } as any);
    } catch (error) {
        console.warn(`[Subscription Enforcement] Could not delete storage object ${storagePath}`, error);
    }
};

const deleteExcessStoredAssets = async (
    uid: string,
    kind: StoredAssetKind,
    allowedCount: number,
): Promise<number> => {
    const rootRef = db.collection("userdata").doc(uid);
    const allAssets = await readStoredAssets(uid, kind);
    const keep = allAssets.slice(0, Math.max(0, allowedCount));
    const remove = allAssets.slice(Math.max(0, allowedCount));

    if (remove.length === 0) return 0;

    const keepIds = new Set(keep.map((asset) => asset.id));
    const batch = db.batch();
    remove.forEach((asset) => {
        if (asset.ref) batch.delete(asset.ref);
    });

    const rootSnap = await rootRef.get();
    const arrayField = kind === 'videos' ? 'videos' : 'plans';
    const legacyAssets = Array.isArray(rootSnap.data()?.[arrayField]) ? rootSnap.data()?.[arrayField] : [];
    batch.set(rootRef, {
        [arrayField]: legacyAssets.filter((asset: any) => keepIds.has(String(asset?.id || ''))),
    }, { merge: true });

    await batch.commit();
    await Promise.all(remove.map((asset) => deleteStorageObjectForAsset(asset, `${kind}/${uid}/`)));
    return remove.length;
};

const enforceStoredAssetLimits = async (uid: string) => {
    // No ID token in this context: resolveUserTier falls back to the trusted
    // Auth-record email (never the client-writable users/{uid} profile).
    const tier = await resolveUserTier(uid);
    const limits = PLAN_LIMITS[tier] || PLAN_LIMITS.FREE;

    const [videoAssets, pdfAssets] = await Promise.all([
        readStoredAssets(uid, 'videos'),
        readStoredAssets(uid, 'plans'),
    ]);

    const deletedVideos = videoAssets.length > limits.videos
        ? await deleteExcessStoredAssets(uid, 'videos', limits.videos)
        : 0;
    const deletedPdfs = pdfAssets.length > limits.pdfs
        ? await deleteExcessStoredAssets(uid, 'plans', limits.pdfs)
        : 0;

    return { tier, limits, deletedVideos, deletedPdfs };
};

// Helper Centralizado: revisa el cumplimiento de vídeos/PDFs guardados tras borrar o cambiar de tier.
export const evaluateVideoQuotaCompliance = async (uid: string) => {
    const tier = await resolveUserTier(uid);
    const limits = PLAN_LIMITS[tier] || PLAN_LIMITS.FREE;

    const [videoAssets, pdfAssets] = await Promise.all([
        readStoredAssets(uid, 'videos'),
        readStoredAssets(uid, 'plans'),
    ]);

    const videoCount = videoAssets.length;
    const pdfCount = pdfAssets.length;
    const isVideoOver = videoCount > limits.videos;
    const isPdfOver = pdfCount > limits.pdfs;

    const enforcementRef = db.collection("account_enforcement").doc(uid);
    const enforcSnap = await enforcementRef.get();

    if (!isVideoOver && !isPdfOver) {
        // COMPLIANT -> Levantar restricciones
        if (enforcSnap.exists && ['OVER_LIMIT_GRACE_PERIOD', 'PENDING_ASSET_DELETION', 'ASSET_DELETION_IN_PROGRESS', 'PENDING_ACCOUNT_DELETION'].includes(enforcSnap.data()?.status)) {
            await enforcementRef.update({
                status: 'COMPLIANT',
                gracePeriodEndsAt: null,
                currentVideoCount: videoCount,
                allowedVideoLimit: limits.videos,
                currentPdfCount: pdfCount,
                allowedPdfLimit: limits.pdfs,
                lastEvaluatedAt: FieldValue.serverTimestamp()
            });

            await db.collection("notifications").add({
                userId: uid, title: "Límite restituido",
                body: "¡Genial! Has vuelto dentro de los márgenes de tu plan y desaparecen las restricciones.",
                severity: "info", read: false, createdAt: new Date().toISOString()
            });
        }
    } else {
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
                allowedPdfLimit: limits.pdfs,
                currentPdfCount: pdfCount,
                overVideoLimit: isVideoOver,
                overPdfLimit: isPdfOver,
                gracePeriodEndsAt: Timestamp.fromDate(endLimitTime),
                lastEvaluatedAt: FieldValue.serverTimestamp()
            }, { merge: true });

            const overParts = [
                isVideoOver ? `${videoCount} vídeos (límite ${limits.videos})` : '',
                isPdfOver ? `${pdfCount} PDFs (límite ${limits.pdfs})` : '',
            ].filter(Boolean).join(' y ');

            await db.collection("notifications").add({
                userId: uid, title: "¡Límite excedido por Downgrade!",
                body: `Tu plan actual tiene menos capacidad: tienes ${overParts}. Tienes 3 días para ajustarte; si no, se eliminarán solo los vídeos o PDFs que sobren.`,
                severity: "critical", read: false, createdAt: new Date().toISOString()
            });
        } else if (enforcSnap.exists && enforcSnap.data()?.status === 'OVER_LIMIT_GRACE_PERIOD') {
            await enforcementRef.set({
                allowedVideoLimit: limits.videos,
                currentVideoCount: videoCount,
                allowedPdfLimit: limits.pdfs,
                currentPdfCount: pdfCount,
                overVideoLimit: isVideoOver,
                overPdfLimit: isPdfOver,
                lastEvaluatedAt: FieldValue.serverTimestamp()
            }, { merge: true });
        }
    }
};

export const enforcementCronJob = onSchedule(
  {
     schedule: "every 1 hours",
     timeZone: "UTC",
     region: "europe-west1"
  }, 
  async () => {
    const now = Timestamp.now();

    const overdueSnap = await db.collection("account_enforcement")
        .where("status", "==", "OVER_LIMIT_GRACE_PERIOD")
        .where("gracePeriodEndsAt", "<", now)
        .get();

    const batch = db.batch();
    overdueSnap.docs.forEach(doc => {
        batch.update(doc.ref, { 
            status: 'PENDING_ASSET_DELETION',
            lastEvaluatedAt: FieldValue.serverTimestamp()
        });
    });
    if (overdueSnap.size > 0) await batch.commit();

    const pendingSnap = await db.collection("account_enforcement")
        .where("status", "in", ["PENDING_ASSET_DELETION", "PENDING_ACCOUNT_DELETION"])
        .limit(10) // Chunk handling safe
        .get();

    for (const doc of pendingSnap.docs) {
        await doc.ref.update({ status: 'ASSET_DELETION_IN_PROGRESS' });
        const uid = doc.data().userId;
        try {
            const result = await enforceStoredAssetLimits(uid);
            
            await doc.ref.update({ 
                status: 'COMPLIANT',
                deletedVideoCount: result.deletedVideos,
                deletedPdfCount: result.deletedPdfs,
                gracePeriodEndsAt: null,
                lastEvaluatedAt: FieldValue.serverTimestamp(),
                resolvedAt: FieldValue.serverTimestamp()
            });

            await db.collection("notifications").add({
                userId: uid,
                title: "Archivos ajustados al plan",
                body: `El periodo de gracia terminó. Se eliminaron ${result.deletedVideos} vídeos y ${result.deletedPdfs} PDFs para ajustarte a tu suscripción actual.`,
                severity: "warning",
                read: false,
                createdAt: new Date().toISOString()
            });

            console.log(`[Subscription Enforcement] Deleted excess assets for ${uid}:`, result);
        } catch(e) {
            console.error(`Error deleting excess assets for ${uid}`, e);
            await doc.ref.update({ status: 'PENDING_ASSET_DELETION' }); // Safe retry structure
        }
    }
});

// Trigger: Downgrade detection when Stripe updates the user's subscription record
export const onSubscriptionChange = onDocumentWritten(
    { document: "customers/{uid}/subscriptions/{subscriptionId}", region: "europe-west1" },
    async (event) => {
        const uid = event.params.uid;
        const userRef = db.collection("users").doc(uid);
        const userSnap = await userRef.get();
        const userData = userSnap.exists ? userSnap.data() : {};
        const tier = await resolveUserTier(uid);

        await userRef.set({
            currentPlanId: tier,
            profile: {
                ...(userData?.profile || {}),
                subscriptionTier: tier,
            },
            subscriptionTierUpdatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        // After Stripe webhook has modified the record, assess stored assets and start grace period if out-of-bounds.
        console.log(`[Subscription Trigger] Evaluating quota compliance for UID: ${uid}`);
        await evaluateVideoQuotaCompliance(uid);
    }
);

// Resolve who pays the quota for a direct-write upload. The client-supplied
// uploadedByCoachId is only honored when that coach really has an accepted
// relationship with the profile owner — otherwise a forged value would bill
// an arbitrary victim's quota.
const resolveQuotaPayer = async (ownerUid: string, uploadedByCoachId: unknown): Promise<string> => {
    if (typeof uploadedByCoachId !== 'string' || !uploadedByCoachId || uploadedByCoachId === ownerUid) return ownerUid;
    const relSnap = await db.collection('requests').doc(`${uploadedByCoachId}_${ownerUid}`).get();
    return relSnap.exists && relSnap.data()?.status === 'accepted' ? uploadedByCoachId : ownerUid;
};

// Trigger: count direct-write fallback video uploads when callable flow was unavailable
export const onVideoCreatedFallback = onDocumentWritten(
    { document: "userdata/{uid}/videos/{videoId}", region: "europe-west1" },
    async (event) => {
        if (!event.data?.after.exists || event.data?.before.exists) return;

        const uid = event.params.uid;
        const createdData = event.data.after.data();
        // Only docs the server itself marked as counted are exempt. Anything a
        // client writes directly (with or without the flag) must be counted —
        // rules forbid clients from setting quotaCounted:true themselves.
        if (createdData?.quotaCounted === true) return;

        const quotaPayer = await resolveQuotaPayer(uid, createdData?.uploadedByCoachId);

        try {
            await consumeMonthlyQuota(quotaPayer, undefined, 'videos');
        } catch (error) {
            await deleteStorageObjectForAsset({ id: event.params.videoId, data: createdData, ref: event.data.after.ref }, `videos/${uid}/`);
            await event.data.after.ref.delete();
            await db.collection("notifications").add({
                userId: quotaPayer,
                title: "Límite mensual alcanzado",
                body: "Se ha bloqueado una subida de vídeo porque tu suscripción ya alcanzó el límite mensual.",
                severity: "warning",
                read: false,
                createdAt: new Date().toISOString()
            });
            console.warn(`[Video Fallback Trigger] Removed over-limit direct-write upload for UID: ${quotaPayer}`, error);
            return;
        }

        await event.data.after.ref.set({
            quotaCounted: true,
            fallbackCountedAt: FieldValue.serverTimestamp()
        }, { merge: true });

        console.log(`[Video Fallback Trigger] Counted direct-write upload for UID: ${quotaPayer}`);
        await evaluateVideoQuotaCompliance(quotaPayer);
    }
);

// Trigger: count direct-write fallback PDF uploads when callable flow was unavailable
export const onPdfCreatedFallback = onDocumentWritten(
    { document: "userdata/{uid}/plans/{planId}", region: "europe-west1" },
    async (event) => {
        if (!event.data?.after.exists || event.data?.before.exists) return;

        const uid = event.params.uid;
        const createdData = event.data.after.data();
        if (createdData?.quotaCounted === true) return;

        const quotaPayer = await resolveQuotaPayer(uid, createdData?.uploadedByCoachId);

        try {
            await consumeMonthlyQuota(quotaPayer, undefined, 'pdfs');
        } catch (error) {
            await deleteStorageObjectForAsset({ id: event.params.planId, data: createdData, ref: event.data.after.ref }, `plans/${uid}/`);
            await event.data.after.ref.delete();
            await db.collection("notifications").add({
                userId: quotaPayer,
                title: "Límite mensual alcanzado",
                body: "Se ha bloqueado una subida de PDF porque tu suscripción ya alcanzó el límite mensual.",
                severity: "warning",
                read: false,
                createdAt: new Date().toISOString()
            });
            console.warn(`[PDF Fallback Trigger] Removed over-limit direct-write upload for UID: ${quotaPayer}`, error);
            return;
        }

        await event.data.after.ref.set({
            quotaCounted: true,
            fallbackCountedAt: FieldValue.serverTimestamp()
        }, { merge: true });

        console.log(`[PDF Fallback Trigger] Counted direct-write upload for UID: ${quotaPayer}`);
    }
);

// Trigger: Video deletion check
export const onVideoDeletion = onDocumentWritten(
    { document: "userdata/{uid}/videos/{videoId}", region: "europe-west1" },
    async (event) => {
        const uid = event.params.uid;
        // Only run on deletes to clear/update grace periods. Monthly upload counters are never decremented.
        if (!event.data?.after.exists) {
            const deletedData = event.data?.before.data();
            if (deletedData?.quotaCounted === false) {
                return;
            }
            // Determine who "paid" for this video: the coach who uploaded it, or the profile owner
            const quotaPayer = deletedData?.uploadedByCoachId || uid;

            console.log(`[Video Deletion Trigger] Re-evaluating stored asset compliance for UID: ${quotaPayer}`);
            await evaluateVideoQuotaCompliance(quotaPayer);
        }
    }
);

// Trigger: PDF deletion check. Monthly upload counters are never decremented.
export const onPdfDeletion = onDocumentWritten(
    { document: "userdata/{uid}/plans/{planId}", region: "europe-west1" },
    async (event) => {
        const uid = event.params.uid;
        if (!event.data?.after.exists) {
            const deletedData = event.data?.before.data();
            if (deletedData?.quotaCounted === false) {
                return;
            }
            const quotaPayer = deletedData?.uploadedByCoachId || uid;

            console.log(`[PDF Deletion Trigger] Re-evaluating stored asset compliance for UID: ${quotaPayer}`);
            await evaluateVideoQuotaCompliance(quotaPayer);
        }
    }
);

const indexAssetEntriesById = (value: unknown): Map<string, any> => {
    const entries = new Map<string, any>();
    if (!Array.isArray(value)) return entries;
    value.forEach((entry: any) => {
        const id = String(entry?.id ?? '');
        if (id) entries.set(id, entry);
    });
    return entries;
};

// Trigger: the root userdata doc is client-writable, and the gallery and the
// enforcement jobs treat its videos/plans arrays as real assets. Every
// legitimate addition is registered first (registerVideoInGallery /
// registerPdfInGallery write the subcollection doc with quotaCounted: true and
// charge the monthly quota), so an id added to the array without a
// quota-counted subcollection doc skipped the quota: strip it. Existence alone
// proves nothing: clients may create subcollection docs directly, and the
// fallback trigger deletes them when over the limit without touching this
// array. Entries already present before the write (legacy assets from before
// the subcollections) are left alone.
export const onUserDataAssetsWritten = onDocumentWritten(
    { document: "userdata/{uid}", region: "europe-west1" },
    async (event) => {
        const after = event.data?.after.exists ? event.data.after.data() : null;
        if (!after) return;
        const before = event.data?.before.exists ? event.data.before.data() : undefined;
        const uid = event.params.uid;
        const rootRef = db.collection("userdata").doc(uid);

        const unregisteredByKind: Partial<Record<StoredAssetKind, Set<string>>> = {};
        for (const kind of ['videos', 'plans'] as const) {
            const previousIds = indexAssetEntriesById(before?.[kind]);
            const addedIds = Array.from(indexAssetEntriesById(after[kind]).keys())
                .filter((id) => !previousIds.has(id));
            if (addedIds.length === 0) continue;

            const subSnaps = await db.getAll(...addedIds.map((id) => rootRef.collection(kind).doc(id)));
            const unregistered = subSnaps
                .filter((snap) => snap.data()?.quotaCounted !== true)
                .map((snap) => snap.id);
            if (unregistered.length > 0) unregisteredByKind[kind] = new Set(unregistered);
        }

        if (!unregisteredByKind.videos && !unregisteredByKind.plans) return;

        await db.runTransaction(async (t) => {
            const current = await t.get(rootRef);
            if (!current.exists) return;
            const update: Record<string, any[]> = {};
            for (const kind of ['videos', 'plans'] as const) {
                const strip = unregisteredByKind[kind];
                const list = current.data()?.[kind];
                if (!strip || !Array.isArray(list)) continue;
                update[kind] = list.filter((entry: any) => !strip.has(String(entry?.id ?? '')));
            }
            if (Object.keys(update).length > 0) t.set(rootRef, update, { merge: true });
        });

        console.warn(`[Asset Mirror Trigger] Stripped unregistered assets for UID: ${uid}`, {
            videos: Array.from(unregisteredByKind.videos ?? []),
            plans: Array.from(unregisteredByKind.plans ?? []),
        });
    }
);
