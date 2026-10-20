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
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import {
    extractSubscriptionPriceId,
    getExpiredGraceDeletionCount,
    getPlanLimits,
    isAuthEmailTrusted,
    resolveAllowedModelForTier,
    resolveSubscriptionContext,
    resolveTierForPrice,
    toMillis,
    type PremiumEmailSource,
} from './subscriptionPolicy.js';
import {
    MARKETING_CONSENT_VERSION,
    MARKETING_FREE_MONTHS,
    MARKETING_FREE_MONTH_PROMOTION_CODE_ID,
    MARKETING_TRIAL_OFFER_ID,
    MARKETING_TRIAL_OFFER_VERSION,
    getMarketingTrialPlan,
    hasCurrentMarketingTrialDismissal,
    hasMarketingTrialMetadata,
    isAdultProfile,
    isAllowedCheckoutReturnUrl,
    isTestModeStripeCustomerLink,
} from './marketingTrial.js';
export { askVideoQuestion, upsertVideoContext } from './videoContext.js';

if (!getApps().length) {
    initializeApp();
}
const db = getFirestore();

// La API Key se guarda de forma segura en Firebase Secrets
const geminiApiKey = defineSecret("GEMINI_API_KEY");
const callableSecurityOptions = {
    enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true',
};

// Delay helper para retry
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getVerifiedAuthEmail = (request: any) => ({
    userEmail: typeof request.auth?.token?.email === 'string' ? request.auth.token.email : undefined,
    emailVerified: request.auth?.token?.email_verified === true,
});

const requireBoundedText = (
    value: unknown,
    fieldName: string,
    maxLength: number,
    fallback = '',
) => {
    const text = typeof value === 'string' ? value.trim() : fallback;
    if (!text && !fallback) {
        throw new HttpsError('invalid-argument', `El campo ${fieldName} es obligatorio.`);
    }
    if (text.length > maxLength) {
        throw new HttpsError('invalid-argument', `El campo ${fieldName} es demasiado largo.`);
    }
    return text;
};

const normalizeSimpleHistory = (value: unknown, maxItems: number, maxTextLength: number) => {
    if (!Array.isArray(value)) return [] as string[];
    return value.slice(-maxItems).map((item) => {
        const rawText = typeof item === 'string' ? item : (item as any)?.text;
        const text = typeof rawText === 'string' ? rawText.trim() : '';
        return text.slice(0, maxTextLength);
    }).filter(Boolean);
};

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
        ...callableSecurityOptions,
        secrets: [geminiApiKey],
        region: "europe-west1",
        maxInstances: 10
    },
    async (request) => {
        // Validar que el usuario está autenticado
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
        }

        const { base64Image, promptText, chatHistory, language } = request.data || {};
        const uid = request.auth.uid;

        if (typeof base64Image !== 'string' || !base64Image) {
            throw new HttpsError("invalid-argument", "Se requiere una imagen.");
        }
        if (base64Image.length > 10_500_000) {
            throw new HttpsError('invalid-argument', 'La imagen supera el tamaño permitido.');
        }

        const safePrompt = typeof promptText === 'string'
            ? requireBoundedText(promptText, 'promptText', 4_000)
            : 'Analiza estrictamente lo visible en esta imagen';
        const safeHistory = normalizeSimpleHistory(chatHistory, 2, 4_000);
        const authIdentity = getVerifiedAuthEmail(request);

        const quota = await consumeMonthlyQuota(uid, authIdentity.userEmail, 'chats', authIdentity.emailVerified);
        const tier = quota.tier;

        const modelName = resolveAllowedModelForTier(tier);

        const genAI = new GoogleGenerativeAI(geminiApiKey.value());
        const systemContext = getSystemPromptForLang(language || 'es', 'frame');
        const fullPrompt = `${systemContext}\n\nContexto previo: ${safeHistory.join('\n')}\n\nPregunta del usuario: ${safePrompt}`;

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
        } catch (error: any) {
            await releaseMonthlyQuota(uid, 'chats', quota.period).catch((releaseError) => {
                console.error('[analizarFrame] No se pudo restituir la cuota fallida:', releaseError);
            });
            console.error("[analizarFrame] Error:", error?.message, "| status:", error?.status);
            throw new HttpsError("internal", "Error al analizar la imagen y extraer contexto.");
        }
    }
);

// ========== FUNCIÓN: CHAT CON ENTRENADOR ==========
export const chatWithCoach = onCall(
    {
        ...callableSecurityOptions,
        secrets: [geminiApiKey],
        region: "europe-west1",
        maxInstances: 10
    },
    async (request) => {
        // Validar que el usuario está autenticado
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
        }

        const { message, history, language } = request.data || {};
        const uid = request.auth.uid;

        const safeMessage = requireBoundedText(message, 'message', 4_000);
        const safeHistory = Array.isArray(history)
            ? history.slice(-8).map((item: any) => ({
                role: item?.role === 'model' || item?.role === 'assistant' ? 'Entrenador' : 'Usuario',
                text: typeof item?.text === 'string' ? item.text.trim().slice(0, 4_000) : '',
            })).filter((item: { text: string }) => item.text)
            : [];
        const authIdentity = getVerifiedAuthEmail(request);

        const quota = await consumeMonthlyQuota(uid, authIdentity.userEmail, 'chats', authIdentity.emailVerified);
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
            
            const historyContext = safeHistory
                .map((item: { role: string; text: string }) => `${item.role}: ${item.text}`)
                .join('\n');
            const result = await model.generateContent(
                `${historyContext ? `Conversación reciente:\n${historyContext}\n\n` : ''}Usuario: ${safeMessage}`,
            );
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
            await releaseMonthlyQuota(uid, 'chats', quota.period).catch((releaseError) => {
                console.error('[chatWithCoach] No se pudo restituir la cuota fallida:', releaseError);
            });
            console.error("[chatWithCoach] Error:", error?.message, "| status:", error?.status);
            throw new HttpsError("internal", "Error al conectar con el entrenador.");
        }
    }
);

// ========== SUBSCRIPTION ENFORCEMENT ==========

type CounterKind = 'videos' | 'pdfs' | 'chats';
type MonthlyCounters = {
    videos: number;
    pdfs: number;
    chats: number;
};

type StoredAssetKind = 'videos' | 'plans';
type UploadKind = StoredAssetKind;

type StoredAssetRecord = {
    id: string;
    data: any;
    ref?: FirebaseFirestore.DocumentReference;
};

const getServerMonthKey = (date = new Date()) =>
    `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

const isLegacyUsageInPeriod = (
    legacyUsage: any,
    period: string,
    periodStartMs: number,
    periodEndMs: number,
) => {
    const explicitPeriod = legacyUsage?.period || legacyUsage?.monthKey || legacyUsage?.monthlyPeriod;
    if (explicitPeriod) return String(explicitPeriod) === period;
    const resetMs = toMillis(legacyUsage?.lastAnalysisReset || legacyUsage?.lastChatReset);
    return resetMs >= periodStartMs && resetMs < periodEndMs;
};

const getAssetTimestamp = (asset: any) =>
    toMillis(asset?.uploadedAt) ||
    toMillis(asset?.createdAt) ||
    toMillis(asset?.date) ||
    (/^\d+$/.test(String(asset?.id || '')) ? Number(asset.id) : 0);

// Background callers (triggers, crons, another user's context) have no ID
// token: the allow-list is resolved from the Firebase Auth record, never from
// client-written users-doc email/username fields.
const resolveUserTier = async (
    uid: string,
    transaction?: FirebaseFirestore.Transaction,
): Promise<string> => (await resolveSubscriptionContext({
    db,
    uid,
    emailSource: 'authRecord',
    transaction,
})).tier;

const normalizeMonthlyCounters = (
    rawCounters: any,
    period: string,
    periodStartMs: number,
    periodEndMs: number,
    legacyUsage?: any,
): MonthlyCounters => {
    const legacyCalendarPeriod = typeof rawCounters?.period === 'string'
        && /^\d{4}-\d{2}$/.test(rawCounters.period)
        && rawCounters.period === getServerMonthKey();
    const legacyOrCurrent = !rawCounters?.period || rawCounters.period === period || legacyCalendarPeriod;
    if (!legacyOrCurrent) {
        return { videos: 0, pdfs: 0, chats: 0 };
    }

    // First deployment after the old client counters may find quota_counters
    // without a period. Seed the new monthly cloud counter from legacy cloud
    // usage once, then future months are governed by the server period.
    const shouldMergeLegacy = isLegacyUsageInPeriod(legacyUsage, period, periodStartMs, periodEndMs) || !rawCounters?.period;
    const legacyVideos = shouldMergeLegacy ? Number(legacyUsage?.analysisCount ?? 0) || 0 : 0;
    const legacyPdfs = shouldMergeLegacy ? Number(legacyUsage?.plansCount ?? 0) || 0 : 0;
    const legacyChats = shouldMergeLegacy ? Number(legacyUsage?.chatCount ?? 0) || 0 : 0;

    return {
        videos: Math.max(Number(rawCounters?.videosMonthly ?? rawCounters?.videosGlobal ?? 0) || 0, legacyVideos),
        pdfs: Math.max(Number(rawCounters?.pdfsMonthly ?? rawCounters?.pdfsGlobal ?? 0) || 0, legacyPdfs),
        chats: Math.max(Number(rawCounters?.chatsMonthly ?? rawCounters?.chatCount ?? 0) || 0, legacyChats),
    };
};

const buildCounterUpdate = (
    period: string,
    periodStartMs: number,
    periodEndMs: number,
    counters: MonthlyCounters,
) => ({
    period,
    periodStart: Timestamp.fromMillis(periodStartMs),
    periodEnd: Timestamp.fromMillis(periodEndMs),
    videosMonthly: counters.videos,
    pdfsMonthly: counters.pdfs,
    chatsMonthly: counters.chats,
    // Backwards-compatible aliases for existing client reads and migrations.
    videosGlobal: counters.videos,
    pdfsGlobal: counters.pdfs,
    chatCount: counters.chats,
    lastUpdated: FieldValue.serverTimestamp(),
});

const consumeMonthlyQuota = async (
    uid: string,
    userEmail: string | undefined,
    kind: CounterKind,
    emailVerified = false,
    emailSource: PremiumEmailSource = 'token',
): Promise<{ count: number; limit: number | 'unlimited'; tier: string; period: string }> => {
    return db.runTransaction(async (transaction) => {
        const context = await resolveSubscriptionContext({
            db,
            uid,
            userEmail,
            emailVerified,
            emailSource,
            transaction,
        });
        const { tier, period, periodStartMs, periodEndMs } = context;
        const limits = getPlanLimits(tier);
        const limit =
            kind === 'videos' ? limits.monthlyVideoUploads :
            kind === 'pdfs' ? limits.monthlyPdfUploads :
            limits.monthlyAiMessages;

        const counterRef = db.collection("quota_counters").doc(uid);
        const userDataRef = db.collection("userdata").doc(uid);
        const [counterSnap, userDataSnap] = await Promise.all([
            transaction.get(counterRef),
            transaction.get(userDataRef),
        ]);
        const counters = normalizeMonthlyCounters(
            counterSnap.exists ? counterSnap.data() : {},
            period,
            periodStartMs,
            periodEndMs,
            userDataSnap.exists ? userDataSnap.data()?.usage : undefined,
        );
        const current =
            kind === 'videos' ? counters.videos :
            kind === 'pdfs' ? counters.pdfs :
            counters.chats;

        if (limit !== 'unlimited' && current >= limit) {
            const label = kind === 'videos' ? 'vídeos' : kind === 'pdfs' ? 'PDFs' : 'mensajes de IA';
            throw new HttpsError(
                "resource-exhausted",
                `Has alcanzado el límite de ${label} de tu ciclo de facturación.`
            );
        }

        const nextCounters = {
            ...counters,
            [kind]: current + 1,
        } as MonthlyCounters;

        transaction.set(
            counterRef,
            buildCounterUpdate(period, periodStartMs, periodEndMs, nextCounters),
            { merge: true },
        );

        return { count: current + 1, limit, tier, period };
    });
};

const releaseMonthlyQuota = async (uid: string, kind: CounterKind, period: string) => {
    const counterRef = db.collection('quota_counters').doc(uid);
    await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(counterRef);
        if (!snapshot.exists || snapshot.data()?.period !== period) return;

        const data = snapshot.data() || {};
        const primaryField = kind === 'videos'
            ? 'videosMonthly'
            : kind === 'pdfs'
                ? 'pdfsMonthly'
                : 'chatsMonthly';
        const aliasField = kind === 'videos'
            ? 'videosGlobal'
            : kind === 'pdfs'
                ? 'pdfsGlobal'
                : 'chatCount';
        const current = Math.max(0, Number(data[primaryField] ?? data[aliasField] ?? 0) || 0);
        const next = Math.max(0, current - 1);
        transaction.update(counterRef, {
            [primaryField]: next,
            [aliasField]: next,
            lastUpdated: FieldValue.serverTimestamp(),
        });
    });
};

const countMergedStoredAssets = (
    rootSnap: FirebaseFirestore.DocumentSnapshot,
    subSnap: FirebaseFirestore.QuerySnapshot,
    kind: StoredAssetKind,
) => {
    const ids = new Set(subSnap.docs.map((doc) => doc.id));
    const legacyAssets = Array.isArray(rootSnap.data()?.[kind]) ? rootSnap.data()?.[kind] : [];
    legacyAssets.forEach((asset: any) => {
        if (asset?.id) ids.add(String(asset.id));
    });
    return ids.size;
};

const assertNoActiveEnforcement = async (
    transaction: FirebaseFirestore.Transaction,
    userIds: string[],
    assetLabel: 'vídeos' | 'PDFs',
) => {
    const uniqueIds = Array.from(new Set(userIds));
    const snapshots = await Promise.all(uniqueIds.map((userId) =>
        transaction.get(db.collection('account_enforcement').doc(userId))
    ));
    const blocked = snapshots.some((snapshot) => snapshot.exists && [
        'OVER_LIMIT_GRACE_PERIOD',
        'PENDING_ASSET_DELETION',
        'ASSET_DELETION_IN_PROGRESS',
        'PENDING_ACCOUNT_DELETION',
        'DELETION_IN_PROGRESS',
    ].includes(snapshot.data()?.status));

    if (blocked) {
        throw new HttpsError(
            'failed-precondition',
            `No puedes subir ${assetLabel} durante el periodo de gracia. Reduce la galería al límite del plan o mejora la suscripción.`,
        );
    }
};

const MAX_UPLOAD_BYTES: Record<UploadKind, number> = {
    videos: 512 * 1024 * 1024,
    plans: 50 * 1024 * 1024,
};
const UPLOAD_AUTHORIZATION_TTL_MS = 2 * 60 * 60 * 1000;

const requireSafeIdentifier = (value: unknown, label: string) => {
    const identifier = typeof value === 'string' ? value.trim() : '';
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(identifier)) {
        throw new HttpsError('invalid-argument', `${label} no válido.`);
    }
    return identifier;
};

const requireUploadKind = (value: unknown): UploadKind => {
    if (value !== 'videos' && value !== 'plans') {
        throw new HttpsError('invalid-argument', 'Tipo de archivo no válido.');
    }
    return value;
};

const requireValidUploadDescriptor = (data: any) => {
    const kind = requireUploadKind(data?.kind);
    const targetUserId = requireSafeIdentifier(data?.targetUserId, 'Usuario de destino');
    const assetId = requireSafeIdentifier(data?.assetId, 'Identificador del archivo');
    const storagePath = typeof data?.storagePath === 'string' ? data.storagePath.trim() : '';
    const expectedPrefix = `${kind}/${targetUserId}/${assetId}_`;
    if (
        !storagePath.startsWith(expectedPrefix)
        || storagePath.length > expectedPrefix.length + 180
        || storagePath.slice(expectedPrefix.length).includes('/')
    ) {
        throw new HttpsError('invalid-argument', 'La ruta del archivo no es válida.');
    }

    const size = Number(data?.size);
    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_UPLOAD_BYTES[kind]) {
        throw new HttpsError('invalid-argument', 'El tamaño del archivo no es válido.');
    }

    const contentType = typeof data?.contentType === 'string'
        ? data.contentType.trim().toLowerCase()
        : '';
    const validContentType = kind === 'videos'
        ? /^video\/[a-z0-9.+-]+$/i.test(contentType)
        : contentType === 'application/pdf';
    if (!validContentType || contentType.length > 100) {
        throw new HttpsError('invalid-argument', 'El tipo del archivo no está permitido.');
    }

    return { kind, targetUserId, assetId, storagePath, size, contentType };
};

const getUploadAuthorizationRef = (uploaderId: string, kind: UploadKind) =>
    db.collection('upload_authorizations').doc(`${uploaderId}_${kind}`);

const assertUploadQuotaAvailable = async (
    transaction: FirebaseFirestore.Transaction,
    uploaderId: string,
    targetUserId: string,
    kind: UploadKind,
    userEmail?: string,
    emailVerified = false,
) => {
    await validateTargetAccess(transaction, uploaderId, targetUserId);
    await assertNoActiveEnforcement(
        transaction,
        [uploaderId, targetUserId],
        kind === 'videos' ? 'vídeos' : 'PDFs',
    );

    const payerContext = await resolveSubscriptionContext({
        db,
        uid: uploaderId,
        userEmail,
        emailVerified,
        transaction,
    });
    const targetContext = uploaderId === targetUserId
        ? payerContext
        : await resolveSubscriptionContext({
            db,
            uid: targetUserId,
            emailSource: 'authRecord',
            transaction,
        });
    const payerLimits = getPlanLimits(payerContext.tier);
    const targetLimits = getPlanLimits(targetContext.tier);
    const counterRef = db.collection('quota_counters').doc(uploaderId);
    const payerDataRef = db.collection('userdata').doc(uploaderId);
    const targetDataRef = db.collection('userdata').doc(targetUserId);
    const targetAssetsRef = targetDataRef.collection(kind);
    const [counterSnap, payerDataSnap, targetDataSnap, targetAssetsSnap] = await Promise.all([
        transaction.get(counterRef),
        transaction.get(payerDataRef),
        transaction.get(targetDataRef),
        transaction.get(targetAssetsRef),
    ]);
    const counters = normalizeMonthlyCounters(
        counterSnap.exists ? counterSnap.data() : {},
        payerContext.period,
        payerContext.periodStartMs,
        payerContext.periodEndMs,
        payerDataSnap.exists ? payerDataSnap.data()?.usage : undefined,
    );
    const monthlyCount = kind === 'videos' ? counters.videos : counters.pdfs;
    const monthlyLimit = kind === 'videos'
        ? payerLimits.monthlyVideoUploads
        : payerLimits.monthlyPdfUploads;
    const storedCount = countMergedStoredAssets(targetDataSnap, targetAssetsSnap, kind);
    const storedLimit = kind === 'videos' ? targetLimits.storedVideos : targetLimits.storedPdfs;

    if (monthlyCount >= monthlyLimit) {
        throw new HttpsError(
            'resource-exhausted',
            `Has alcanzado el límite de subidas de ${kind === 'videos' ? 'vídeos' : 'PDF'} de este ciclo.`,
        );
    }
    if (storedCount >= storedLimit) {
        throw new HttpsError(
            'failed-precondition',
            `La galería ya contiene ${storedCount} ${kind === 'videos' ? 'vídeos' : 'PDF'} y su plan permite ${storedLimit}.`,
        );
    }

    return {
        payerContext,
        payerLimits,
        targetLimits,
        counterRef,
        counters,
        monthlyCount,
        storedCount,
    };
};

const getVerifiedStoredObject = async (
    kind: UploadKind,
    targetUserId: string,
    assetId: string,
    storagePath: string,
) => {
    const expectedPrefix = `${kind}/${targetUserId}/${assetId}_`;
    if (!storagePath.startsWith(expectedPrefix) || storagePath.slice(expectedPrefix.length).includes('/')) {
        throw new HttpsError('invalid-argument', 'La ruta registrada no corresponde al archivo.');
    }

    try {
        const file = getStorage().bucket().file(storagePath);
        const [metadata] = await file.getMetadata();
        const size = Number(metadata.size || 0);
        const contentType = String(metadata.contentType || '').toLowerCase();
        const validType = kind === 'videos'
            ? contentType.startsWith('video/')
            : contentType === 'application/pdf';
        if (!validType || size <= 0 || size > MAX_UPLOAD_BYTES[kind]) {
            throw new HttpsError('failed-precondition', 'El archivo almacenado no cumple los requisitos de seguridad.');
        }
        return { size, contentType };
    } catch (error: any) {
        if (error instanceof HttpsError) throw error;
        if (Number(error?.code) === 404) {
            throw new HttpsError('not-found', 'El archivo no existe en Firebase Storage.');
        }
        throw new HttpsError('internal', 'No se pudo verificar el archivo almacenado.');
    }
};

const boundedOptionalString = (value: unknown, maxLength: number) =>
    typeof value === 'string' && value.trim()
        ? value.trim().slice(0, maxLength)
        : undefined;

const buildSafeAssetRecord = (
    rawData: any,
    kind: UploadKind,
    targetUserId: string,
    uploaderId: string,
    verifiedObject: { size: number; contentType: string },
) => {
    const id = requireSafeIdentifier(rawData?.id, 'Identificador del archivo');
    const storagePath = typeof rawData?.storagePath === 'string' ? rawData.storagePath.trim() : '';
    const name = requireBoundedText(rawData?.name, 'nombre', 255);
    const baseRecord = {
        id,
        name,
        date: boundedOptionalString(rawData?.date, 40) || new Date().toISOString().slice(0, 10),
        storagePath,
        contentType: verifiedObject.contentType,
        size: verifiedObject.size,
        ownerId: targetUserId,
        status: 'ready',
        uploadedByCoachId: uploaderId !== targetUserId ? uploaderId : null,
        uploadedAt: FieldValue.serverTimestamp(),
        quotaCounted: true,
    };

    if (kind === 'plans') return baseRecord;
    const videoRecord: Record<string, unknown> = {
        ...baseRecord,
        playbackStatus: ['unknown', 'playable', 'unplayable'].includes(rawData?.playbackStatus)
            ? rawData.playbackStatus
            : 'unknown',
    };
    const thumbnail = boundedOptionalString(rawData?.thumbnail, 600_000);
    const duration = boundedOptionalString(rawData?.duration, 40);
    if (thumbnail) videoRecord.thumbnail = thumbnail;
    if (duration) videoRecord.duration = duration;
    return videoRecord;
};

// Validate that caller has access to the target user profile
const validateTargetAccess = async (t: FirebaseFirestore.Transaction, callerId: string, targetUserId: string): Promise<void> => {
    if (callerId === targetUserId) return; // Own profile, always allowed

    // Check canonical request document
    const reqRef = db.collection('requests').doc(`${callerId}_${targetUserId}`);
    const reqSnap = await t.get(reqRef);
    const relation = reqSnap.data() || {};
    if (
        !reqSnap.exists
        || relation.coachId !== callerId
        || relation.athleteId !== targetUserId
        || relation.status !== 'accepted'
    ) {
        throw new HttpsError('permission-denied', `No tienes acceso al perfil del atleta ${targetUserId}. La relación debe ser aceptada.`);
    }
};

const deleteGalleryAssetMetadata = async (
    callerId: string,
    targetUserId: string,
    assetId: string,
    kind: StoredAssetKind,
) => {
    if (!assetId) throw new HttpsError('invalid-argument', 'Falta el identificador del archivo.');

    return db.runTransaction(async (transaction) => {
        await validateTargetAccess(transaction, callerId, targetUserId);
        const rootRef = db.collection('userdata').doc(targetUserId);
        const assetRef = rootRef.collection(kind).doc(assetId);
        const rootSnap = await transaction.get(rootRef);
        const legacyAssets = Array.isArray(rootSnap.data()?.[kind]) ? rootSnap.data()?.[kind] : [];

        transaction.delete(assetRef);
        transaction.set(rootRef, {
            [kind]: legacyAssets.filter((asset: any) => String(asset?.id || '') !== assetId),
        }, { merge: true });

        return { success: true };
    });
};

const isAdminAuth = (authContext: any) => Boolean(
    authContext
    && (authContext.uid === 'MASTER_GOD_EUKEN' || authContext.token?.admin === true)
);

const deleteQueryDocuments = async (query: FirebaseFirestore.Query) => {
    const snapshot = await query.get();
    for (let index = 0; index < snapshot.docs.length; index += 400) {
        const batch = db.batch();
        snapshot.docs.slice(index, index + 400).forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
    }
};

const assertAccountCanBeDeleted = async (uid: string) => {
    const activeSubscriptions = await db.collection('customers').doc(uid).collection('subscriptions')
        .where('status', 'in', ['active', 'trialing'])
        .get();
    const stillRenewing = activeSubscriptions.docs.some((doc) => {
        const data = doc.data() || {};
        return data.cancel_at_period_end !== true && data.cancelAtPeriodEnd !== true;
    });
    if (stillRenewing) {
        throw new HttpsError(
            'failed-precondition',
            'Cancela primero la renovación de tu suscripción desde el portal de facturación y vuelve a eliminar la cuenta.',
        );
    }
};

const cleanupAccountData = async (uid: string) => {
    await assertAccountCanBeDeleted(uid);

    const [coachRelations, athleteRelations] = await Promise.all([
        db.collection('requests').where('coachId', '==', uid).get(),
        db.collection('requests').where('athleteId', '==', uid).get(),
    ]);
    const relations = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    [...coachRelations.docs, ...athleteRelations.docs].forEach((doc) => relations.set(doc.id, doc));
    for (const relationDoc of relations.values()) {
        const relation = relationDoc.data() || {};
        if (relation.coachId && relation.coachId !== uid && relation.athleteId === uid) {
            await db.collection('users').doc(relation.coachId).update({
                'profile.managedAthletes': FieldValue.arrayRemove(uid),
            }).catch(() => undefined);
        }
        if (relation.athleteId && relation.athleteId !== uid && relation.coachId === uid) {
            await db.collection('users').doc(relation.athleteId).update({
                'profile.coaches': FieldValue.arrayRemove(uid),
            }).catch(() => undefined);
        }
        await relationDoc.ref.delete();
    }

    const [uploadedAuthorizations, targetedAuthorizations] = await Promise.all([
        db.collection('upload_authorizations').where('uploaderId', '==', uid).get(),
        db.collection('upload_authorizations').where('targetUserId', '==', uid).get(),
    ]);
    const authorizationDocs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    [...uploadedAuthorizations.docs, ...targetedAuthorizations.docs]
        .forEach((doc) => authorizationDocs.set(doc.id, doc));
    for (const authorizationDoc of authorizationDocs.values()) {
        const authorization = authorizationDoc.data() || {};
        const storagePath = authorization.storagePath;
        const kind = authorization.kind === 'videos' || authorization.kind === 'plans'
            ? authorization.kind
            : '';
        const targetUserId = typeof authorization.targetUserId === 'string'
            ? authorization.targetUserId
            : '';
        const expectedPrefix = kind && targetUserId ? `${kind}/${targetUserId}/` : '';
        if (
            typeof storagePath === 'string'
            && expectedPrefix
            && storagePath.startsWith(expectedPrefix)
            && !storagePath.slice(expectedPrefix.length).includes('/')
        ) {
            await getStorage().bucket().file(storagePath)
                .delete({ ignoreNotFound: true } as any)
                .catch(() => undefined);
        }
        await authorizationDoc.ref.delete();
    }

    await Promise.all([
        deleteQueryDocuments(db.collection('notifications').where('userId', '==', uid)),
        deleteQueryDocuments(db.collection('ai_analysis_logs').where('userId', '==', uid)),
        getStorage().bucket().deleteFiles({ prefix: `videos/${uid}/`, force: true }).catch(() => undefined),
        getStorage().bucket().deleteFiles({ prefix: `plans/${uid}/`, force: true }).catch(() => undefined),
    ]);

    await db.recursiveDelete(db.collection('userdata').doc(uid));
    await Promise.all([
        db.collection('quota_counters').doc(uid).delete(),
        db.collection('account_enforcement').doc(uid).delete(),
        db.collection('users').doc(uid).delete(),
    ]);
    await getAuth().deleteUser(uid).catch((error: any) => {
        if (error?.code !== 'auth/user-not-found') throw error;
    });
};

export const deleteCurrentAccount = onCall(
    { ...callableSecurityOptions, region: 'europe-west1', maxInstances: 5 },
    async (request) => {
        if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
        await cleanupAccountData(request.auth.uid);
        return { success: true };
    },
);

export const adminDeleteUser = onCall(
    { ...callableSecurityOptions, region: 'europe-west1', maxInstances: 5 },
    async (request) => {
        if (!isAdminAuth(request.auth)) {
            throw new HttpsError('permission-denied', 'Solo un administrador puede eliminar otra cuenta.');
        }
        const userId = requireSafeIdentifier(request.data?.userId, 'Usuario');
        if (userId === request.auth!.uid) {
            throw new HttpsError('failed-precondition', 'Usa la eliminación de cuenta personal.');
        }
        await cleanupAccountData(userId);
        return { success: true };
    },
);

export const authorizeAssetUpload = onCall(
    { ...callableSecurityOptions, region: 'europe-west1', maxInstances: 10 },
    async (request) => {
        if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
        const descriptor = requireValidUploadDescriptor(request.data);
        const uploaderId = request.auth.uid;
        const authIdentity = getVerifiedAuthEmail(request);
        const authorizationRef = getUploadAuthorizationRef(uploaderId, descriptor.kind);
        const expiresAtMs = Date.now() + UPLOAD_AUTHORIZATION_TTL_MS;

        const transactionResult = await db.runTransaction(async (transaction) => {
            const existingSnap = await transaction.get(authorizationRef);
            const existing = existingSnap.exists ? existingSnap.data() || {} : {};
            const existingExpiryMs = toMillis(existing.expiresAt);
            const sameUpload = existing.storagePath === descriptor.storagePath
                && existing.targetUserId === descriptor.targetUserId
                && existing.assetId === descriptor.assetId
                && existing.expectedSize === descriptor.size
                && existing.expectedContentType === descriptor.contentType;

            if (existingSnap.exists && existingExpiryMs > Date.now() && !sameUpload) {
                throw new HttpsError(
                    'failed-precondition',
                    'Ya hay otra subida en curso. Espera a que termine antes de iniciar una nueva.',
                );
            }

            await assertUploadQuotaAvailable(
                transaction,
                uploaderId,
                descriptor.targetUserId,
                descriptor.kind,
                authIdentity.userEmail,
                authIdentity.emailVerified,
            );

            transaction.set(authorizationRef, {
                uploaderId,
                targetUserId: descriptor.targetUserId,
                assetId: descriptor.assetId,
                kind: descriptor.kind,
                storagePath: descriptor.storagePath,
                expectedSize: descriptor.size,
                expectedContentType: descriptor.contentType,
                createdAt: FieldValue.serverTimestamp(),
                expiresAt: Timestamp.fromMillis(expiresAtMs),
            });

            return {
                oldStoragePath: existingSnap.exists && !sameUpload
                    ? boundedOptionalString(existing.storagePath, 500)
                    : undefined,
            };
        });

        if (transactionResult.oldStoragePath) {
            await getStorage().bucket().file(transactionResult.oldStoragePath)
                .delete({ ignoreNotFound: true } as any)
                .catch((error) => console.warn('[Upload Authorization] No se pudo limpiar el archivo anterior.', error));
        }

        return { success: true, expiresAtMs };
    },
);

export const cancelAssetUpload = onCall(
    { ...callableSecurityOptions, region: 'europe-west1', maxInstances: 10 },
    async (request) => {
        if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
        const kind = requireUploadKind(request.data?.kind);
        const storagePath = typeof request.data?.storagePath === 'string'
            ? request.data.storagePath.trim()
            : '';
        const authorizationRef = getUploadAuthorizationRef(request.auth.uid, kind);

        const pathToDelete = await db.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(authorizationRef);
            if (!snapshot.exists) return '';
            const authorization = snapshot.data() || {};
            if (authorization.uploaderId !== request.auth!.uid) {
                throw new HttpsError('permission-denied', 'La autorización no pertenece a tu cuenta.');
            }
            if (storagePath && authorization.storagePath !== storagePath) {
                throw new HttpsError('failed-precondition', 'La autorización corresponde a otro archivo.');
            }
            transaction.delete(authorizationRef);
            return boundedOptionalString(authorization.storagePath, 500) || '';
        });

        if (pathToDelete) {
            await getStorage().bucket().file(pathToDelete).delete({ ignoreNotFound: true } as any);
        }
        return { success: true };
    },
);

const COACH_INVITE_PENDING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const getManagedAthleteLimit = (tier: string) => {
    const limit = getPlanLimits(tier).managedAthletes;
    return limit === 'unlimited' ? Infinity : Math.max(0, Number(limit) || 0);
};

const getCoachRequestsQuery = (coachId: string) =>
    db.collection('requests').where('coachId', '==', coachId);

// Access checks (rules + validateTargetAccess) only honour the canonical
// `${coachId}_${athleteId}` document, so limits count only those.
const isCanonicalCoachRelation = (
    doc: FirebaseFirestore.QueryDocumentSnapshot,
    coachId: string,
) => {
    const relation = doc.data() || {};
    return relation.coachId === coachId
        && typeof relation.athleteId === 'string'
        && relation.athleteId.length > 0
        && doc.id === `${coachId}_${relation.athleteId}`;
};

const getRelationOrderMs = (relation: any) =>
    toMillis(relation?.acceptedAt) || toMillis(relation?.createdAt);

// Keeps a coach's active athletes within the plan limit: the oldest accepted
// relations stay 'accepted', the rest become 'suspended' (no access in rules or
// callables) and are restored automatically when the plan allows them again.
// The tier is resolved here, and transient failures propagate to the caller.
const rebalanceCoachAthletes = async (coachId: string) => {
    const coachRef = db.collection('users').doc(coachId);

    return db.runTransaction(async (transaction) => {
        // Resolve the tier inside the transaction: concurrent triggers (Stripe
        // writes in bursts) must not commit a decision based on a stale tier.
        const coachContext = await resolveSubscriptionContext({
            db,
            uid: coachId,
            emailSource: 'authRecord',
            transaction,
        });
        const athleteLimit = getManagedAthleteLimit(coachContext.tier);
        const [coachSnap, relationsSnap] = await Promise.all([
            transaction.get(coachRef),
            transaction.get(getCoachRequestsQuery(coachId)),
        ]);
        const relations = relationsSnap.docs
            .filter((doc) => isCanonicalCoachRelation(doc, coachId)
                && ['accepted', 'suspended'].includes(doc.data()?.status))
            .sort((a, b) =>
                (getRelationOrderMs(a.data()) - getRelationOrderMs(b.data())) || a.id.localeCompare(b.id));
        if (relations.length === 0) {
            return { tier: coachContext.tier, accepted: 0, suspended: 0, changed: 0 };
        }

        const athleteSnaps = await transaction.getAll(
            ...relations.map((doc) => db.collection('users').doc(String(doc.data().athleteId))),
        );

        // Relations accepted before limits were enforced have no acceptedAt (only
        // respondToCoachRequest sets it) and are kept as they are: the owner chose
        // not to cut off existing coach-athlete pairs. They still use up plan
        // slots, so newer relations only stay active if the plan has room left.
        const isGrandfathered = (relation: any) => relation?.status === 'accepted' && !relation?.acceptedAt;
        let freeSlots = Math.max(0, athleteLimit - relations.filter((doc) => isGrandfathered(doc.data())).length);

        // All reads are done; only writes from here on.
        const activeAthleteIds = new Set<string>();
        const suspendedAthleteIds = new Set<string>();
        let changed = 0;
        relations.forEach((doc, index) => {
            const relation = doc.data() || {};
            const athleteId = String(relation.athleteId);
            let keepActive = isGrandfathered(relation);
            if (!keepActive && freeSlots > 0) {
                keepActive = true;
                freeSlots -= 1;
            }
            (keepActive ? activeAthleteIds : suspendedAthleteIds).add(athleteId);

            if (keepActive && relation.status !== 'accepted') {
                transaction.update(doc.ref, { status: 'accepted', suspendedAt: FieldValue.delete() });
                changed += 1;
            } else if (!keepActive && relation.status !== 'suspended') {
                transaction.update(doc.ref, { status: 'suspended', suspendedAt: FieldValue.serverTimestamp() });
                changed += 1;
            }

            const athleteSnap = athleteSnaps[index];
            if (!athleteSnap.exists) return;
            const athleteCoaches = Array.isArray(athleteSnap.data()?.profile?.coaches)
                ? athleteSnap.data()?.profile?.coaches
                : [];
            const listsCoach = athleteCoaches.includes(coachId);
            if (keepActive && !listsCoach) {
                transaction.update(athleteSnap.ref, { 'profile.coaches': FieldValue.arrayUnion(coachId) });
            } else if (!keepActive && listsCoach) {
                transaction.update(athleteSnap.ref, { 'profile.coaches': FieldValue.arrayRemove(coachId) });
            }
        });

        if (coachSnap.exists) {
            const managedAthletes: unknown[] = Array.isArray(coachSnap.data()?.profile?.managedAthletes)
                ? coachSnap.data()?.profile?.managedAthletes
                : [];
            const nextManagedAthletes = [
                ...managedAthletes.filter((id) => !suspendedAthleteIds.has(String(id))),
                ...Array.from(activeAthleteIds).filter((id) => !managedAthletes.includes(id)),
            ];
            const managedChanged = nextManagedAthletes.length !== managedAthletes.length
                || nextManagedAthletes.some((id, index) => id !== managedAthletes[index]);
            if (managedChanged) {
                transaction.update(coachRef, { 'profile.managedAthletes': nextManagedAthletes });
            }
        }

        return {
            tier: coachContext.tier,
            accepted: activeAthleteIds.size,
            suspended: suspendedAthleteIds.size,
            changed,
        };
    });
};

const rebalanceCoachAthletesSafely = async (coachId: string, logLabel: string) => {
    try {
        await rebalanceCoachAthletes(coachId);
    } catch (error: any) {
        console.error(`[${logLabel}] No se pudo reequilibrar los atletas del entrenador ${coachId}:`, error?.message);
    }
};

export const sendCoachRequest = onCall(
    { ...callableSecurityOptions, region: 'europe-west1', maxInstances: 10 },
    async (request) => {
        if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
        const coachId = request.auth.uid;
        const athleteEmail = requireBoundedText(request.data?.athleteEmail, 'correo', 254).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(athleteEmail)) {
            throw new HttpsError('invalid-argument', 'El correo del atleta no es válido.');
        }

        const coachSnap = await db.collection('users').doc(coachId).get();
        if (!coachSnap.exists) throw new HttpsError('not-found', 'No existe tu perfil.');
        const coachData = coachSnap.data() || {};
        if (!['coach', 'admin'].includes(coachData.profile?.role)) {
            throw new HttpsError('permission-denied', 'Solo los entrenadores pueden invitar atletas.');
        }

        const coachContext = await resolveSubscriptionContext({
            db,
            uid: coachId,
            ...getVerifiedAuthEmail(request),
        });
        const athleteLimit = getManagedAthleteLimit(coachContext.tier);
        if (athleteLimit <= 0) {
            throw new HttpsError(
                'permission-denied',
                'Tu plan actual no permite gestionar atletas. Mejora tu suscripción de entrenador para enviar invitaciones.',
            );
        }

        // Resolve the athlete through Firebase Auth, never through the
        // client-written users.email/username fields.
        const athleteAuth = await getAuth().getUserByEmail(athleteEmail).catch((error: any) => {
            if (error?.code === 'auth/user-not-found') {
                throw new HttpsError('not-found', 'Atleta no encontrado.');
            }
            if (error?.code === 'auth/invalid-email') {
                throw new HttpsError('invalid-argument', 'El correo del atleta no es válido.');
            }
            console.error('[sendCoachRequest] Auth lookup failed:', error?.code, error?.message);
            throw new HttpsError('unavailable', 'No se pudo comprobar la cuenta del atleta. Inténtalo de nuevo.');
        });
        const athleteId = athleteAuth.uid;
        if (athleteId === coachId) {
            throw new HttpsError('failed-precondition', 'No puedes invitarte a ti mismo.');
        }
        if (!isAuthEmailTrusted(athleteAuth)) {
            throw new HttpsError(
                'failed-precondition',
                'Este atleta aún no ha verificado su email. Pídele que abra el enlace de verificación que recibió al registrarse.',
            );
        }

        const athleteSnap = await db.collection('users').doc(athleteId).get();
        if (!athleteSnap.exists) throw new HttpsError('not-found', 'Atleta no encontrado.');
        const athleteData = athleteSnap.data() || {};
        if (athleteData.profile?.role !== 'athlete') {
            throw new HttpsError('failed-precondition', 'La cuenta indicada no es de atleta.');
        }
        const verifiedAthleteEmail = String(athleteAuth.email || athleteEmail).trim().toLowerCase();

        const requestRef = db.collection('requests').doc(`${coachId}_${athleteId}`);
        await db.runTransaction(async (transaction) => {
            const [existing, coachRequestsSnap] = await Promise.all([
                transaction.get(requestRef),
                transaction.get(getCoachRequestsQuery(coachId)),
            ]);
            if (existing.exists && existing.data()?.status === 'accepted') {
                throw new HttpsError('already-exists', 'Este atleta ya forma parte de tu equipo.');
            }
            // A suspended relation comes back on its own when the plan allows it;
            // overwriting it with a fresh invite would drop its acceptedAt priority.
            if (existing.exists && existing.data()?.status === 'suspended') {
                throw new HttpsError('already-exists', 'Este atleta está suspendido por el límite de tu plan; se reactivará cuando tengas hueco.');
            }

            const pendingCutoffMs = Date.now() - COACH_INVITE_PENDING_WINDOW_MS;
            let acceptedCount = 0;
            let pendingCount = 0;
            coachRequestsSnap.docs.forEach((doc) => {
                if (doc.id === requestRef.id || !isCanonicalCoachRelation(doc, coachId)) return;
                const relation = doc.data() || {};
                if (relation.status === 'accepted') {
                    acceptedCount += 1;
                } else if (relation.status === 'pending' && toMillis(relation.createdAt) >= pendingCutoffMs) {
                    pendingCount += 1;
                }
            });
            if (acceptedCount + pendingCount >= athleteLimit) {
                throw new HttpsError(
                    'resource-exhausted',
                    `Tu plan permite ${athleteLimit} atletas y ya tienes ${acceptedCount} aceptados y ${pendingCount} invitaciones pendientes de los últimos 30 días. Cancela alguna invitación pendiente o mejora tu plan.`,
                );
            }

            transaction.set(requestRef, {
                coachId,
                coachName: `${coachData.profile?.firstName || ''} ${coachData.profile?.lastName || ''}`.trim().slice(0, 160),
                athleteId,
                athleteEmail: verifiedAthleteEmail,
                athleteName: `${athleteData.profile?.firstName || ''} ${athleteData.profile?.lastName || ''}`.trim().slice(0, 160),
                athleteDiscipline: String(athleteData.profile?.discipline || 'Atleta').slice(0, 120),
                status: 'pending',
                createdAt: FieldValue.serverTimestamp(),
            });
        });

        return { success: true };
    },
);

export const respondToCoachRequest = onCall(
    { ...callableSecurityOptions, region: 'europe-west1', maxInstances: 10 },
    async (request) => {
        if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
        const athleteId = request.auth.uid;
        const requestId = String(request.data?.requestId || '');
        // Explicit boolean only: a missing field must not read as "revoke".
        if (typeof request.data?.accept !== 'boolean') {
            throw new HttpsError('invalid-argument', 'Indica si aceptas o rechazas la solicitud.');
        }
        const accept: boolean = request.data.accept;
        if (!requestId) throw new HttpsError('invalid-argument', 'Falta la solicitud.');
        if (!/^[A-Za-z0-9_-]{3,257}$/.test(requestId)) {
            throw new HttpsError('invalid-argument', 'Solicitud no válida.');
        }

        const outcome = await db.runTransaction(async (transaction) => {
            const requestRef = db.collection('requests').doc(requestId);
            const requestSnap = await transaction.get(requestRef);
            if (!requestSnap.exists) throw new HttpsError('not-found', 'La solicitud ya no existe.');
            const relation = requestSnap.data() || {};
            if (
                relation.athleteId !== athleteId
                || requestId !== `${relation.coachId}_${relation.athleteId}`
            ) {
                throw new HttpsError('permission-denied', 'Solo el atleta invitado puede responder.');
            }

            const coachId = String(relation.coachId || '');
            const coachRef = db.collection('users').doc(coachId);
            const athleteRef = db.collection('users').doc(athleteId);

            if (!accept) {
                if (relation.status === 'pending') {
                    transaction.update(requestRef, { status: 'rejected' });
                    return { response: { success: true, status: 'rejected' }, rebalanceCoachId: '' };
                }
                if (relation.status === 'accepted' || relation.status === 'suspended') {
                    // The athlete leaves an existing relationship: revoke the
                    // coach's access and unlink both profiles atomically.
                    const [coachSnap, athleteSnap] = await Promise.all([
                        transaction.get(coachRef),
                        transaction.get(athleteRef),
                    ]);
                    transaction.update(requestRef, { status: 'rejected' });
                    if (coachSnap.exists) {
                        transaction.set(coachRef, {
                            profile: { managedAthletes: FieldValue.arrayRemove(athleteId) },
                        }, { merge: true });
                    }
                    if (athleteSnap.exists) {
                        transaction.set(athleteRef, {
                            profile: { coaches: FieldValue.arrayRemove(coachId) },
                        }, { merge: true });
                    }
                    return { response: { success: true, status: 'rejected' }, rebalanceCoachId: coachId };
                }
                throw new HttpsError('failed-precondition', 'Esta solicitud ya fue respondida.');
            }

            if (relation.status !== 'pending') {
                throw new HttpsError('failed-precondition', 'Esta solicitud ya fue respondida.');
            }

            // The coach is not the caller: resolve their plan from the Auth
            // record, never from a client-supplied email.
            const coachContext = await resolveSubscriptionContext({
                db,
                uid: coachId,
                emailSource: 'authRecord',
                transaction,
            });
            const coachLimits = getPlanLimits(coachContext.tier);
            const athleteLimit = getManagedAthleteLimit(coachContext.tier);
            const [coachSnap, coachRequestsSnap] = await Promise.all([
                transaction.get(coachRef),
                transaction.get(getCoachRequestsQuery(coachId)),
            ]);
            const managedAthletes: unknown[] = Array.isArray(coachSnap.data()?.profile?.managedAthletes)
                ? coachSnap.data()?.profile?.managedAthletes
                : [];
            const otherManagedCount = managedAthletes.filter((id) => id !== athleteId).length;
            const otherAcceptedCount = coachRequestsSnap.docs.filter((doc) =>
                doc.id !== requestRef.id
                && isCanonicalCoachRelation(doc, coachId)
                && doc.data()?.status === 'accepted').length;
            const currentCount = Math.max(otherAcceptedCount, otherManagedCount);

            if (currentCount >= athleteLimit) {
                throw new HttpsError(
                    'resource-exhausted',
                    `El entrenador ha alcanzado el límite de ${coachLimits.managedAthletes} atletas de su suscripción.`,
                );
            }

            transaction.update(requestRef, {
                status: 'accepted',
                acceptedAt: FieldValue.serverTimestamp(),
            });
            transaction.update(coachRef, {
                'profile.managedAthletes': FieldValue.arrayUnion(athleteId),
            });
            transaction.update(athleteRef, {
                'profile.coaches': FieldValue.arrayUnion(coachId),
            });

            return {
                response: {
                    success: true,
                    status: 'accepted',
                    managedAthletes: currentCount + 1,
                    limit: coachLimits.managedAthletes,
                    tier: coachContext.tier,
                },
                rebalanceCoachId: '',
            };
        });

        if (outcome.rebalanceCoachId) {
            await rebalanceCoachAthletesSafely(outcome.rebalanceCoachId, 'respondToCoachRequest');
        }
        return outcome.response;
    },
);

export const removeAthleteFromCoach = onCall(
    { ...callableSecurityOptions, region: 'europe-west1', maxInstances: 10 },
    async (request) => {
        if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
        const coachId = request.auth.uid;
        if (!request.data?.athleteId) throw new HttpsError('invalid-argument', 'Falta el atleta.');
        const athleteId = requireSafeIdentifier(request.data?.athleteId, 'Atleta');

        const requestRef = db.collection('requests').doc(`${coachId}_${athleteId}`);
        const coachRef = db.collection('users').doc(coachId);
        const athleteRef = db.collection('users').doc(athleteId);
        await db.runTransaction(async (transaction) => {
            const [relationSnap, coachSnap, athleteSnap] = await Promise.all([
                transaction.get(requestRef),
                transaction.get(coachRef),
                transaction.get(athleteRef),
            ]);
            const relation = relationSnap.data() || {};
            if (
                !relationSnap.exists
                || relation.coachId !== coachId
                || relation.athleteId !== athleteId
                || !['accepted', 'pending', 'suspended'].includes(relation.status)
            ) {
                throw new HttpsError('permission-denied', 'No existe una relación ni una invitación pendiente con este atleta.');
            }
            if (coachSnap.exists) {
                transaction.update(coachRef, {
                    'profile.managedAthletes': FieldValue.arrayRemove(athleteId),
                });
            }
            if (athleteSnap.exists) {
                transaction.update(athleteRef, {
                    'profile.coaches': FieldValue.arrayRemove(coachId),
                });
            }
            transaction.update(requestRef, { status: 'rejected' });
        });

        await rebalanceCoachAthletesSafely(coachId, 'removeAthleteFromCoach');
        return { success: true };
    },
);

export const deleteVideoFromGallery = onCall(
    { ...callableSecurityOptions, region: 'europe-west1', maxInstances: 10 },
    async (request) => {
        if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
        const targetUserId = requireSafeIdentifier(request.data?.targetUserId || request.auth.uid, 'Usuario de destino');
        const assetId = requireSafeIdentifier(request.data?.assetId, 'Identificador del archivo');
        return deleteGalleryAssetMetadata(request.auth.uid, targetUserId, assetId, 'videos');
    },
);

export const deletePdfFromGallery = onCall(
    { ...callableSecurityOptions, region: 'europe-west1', maxInstances: 10 },
    async (request) => {
        if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
        const targetUserId = requireSafeIdentifier(request.data?.targetUserId || request.auth.uid, 'Usuario de destino');
        const assetId = requireSafeIdentifier(request.data?.assetId, 'Identificador del archivo');
        return deleteGalleryAssetMetadata(request.auth.uid, targetUserId, assetId, 'plans');
    },
);

const registerAssetInGallery = async (request: any, kind: UploadKind) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const uploaderId = request.auth.uid;
    const rawData = kind === 'videos' ? request.data?.videoData : request.data?.pdfData;
    const targetUserId = requireSafeIdentifier(
        request.data?.targetUserId || uploaderId,
        'Usuario de destino',
    );
    const assetId = requireSafeIdentifier(rawData?.id, 'Identificador del archivo');
    const storagePath = typeof rawData?.storagePath === 'string' ? rawData.storagePath.trim() : '';
    const verifiedObject = await getVerifiedStoredObject(
        kind,
        targetUserId,
        assetId,
        storagePath,
    );
    const authIdentity = getVerifiedAuthEmail(request);

    return db.runTransaction(async (transaction) => {
        const quota = await assertUploadQuotaAvailable(
            transaction,
            uploaderId,
            targetUserId,
            kind,
            authIdentity.userEmail,
            authIdentity.emailVerified,
        );
        const authorizationRef = getUploadAuthorizationRef(uploaderId, kind);
        const authorizationSnap = await transaction.get(authorizationRef);
        const authorization = authorizationSnap.data() || {};
        if (
            !authorizationSnap.exists
            || authorization.uploaderId !== uploaderId
            || authorization.targetUserId !== targetUserId
            || authorization.assetId !== assetId
            || authorization.kind !== kind
            || authorization.storagePath !== storagePath
            || Number(authorization.expectedSize) !== verifiedObject.size
            || String(authorization.expectedContentType || '').toLowerCase() !== verifiedObject.contentType
            || toMillis(authorization.expiresAt) <= Date.now()
        ) {
            throw new HttpsError('permission-denied', 'La autorización de subida no es válida o ha caducado.');
        }

        const newAssetRef = db.collection('userdata').doc(targetUserId).collection(kind).doc(assetId);
        const existingAssetSnap = await transaction.get(newAssetRef);
        if (existingAssetSnap.exists) {
            throw new HttpsError('already-exists', 'Este archivo ya está registrado.');
        }

        const safeRecord = buildSafeAssetRecord(
            rawData,
            kind,
            targetUserId,
            uploaderId,
            verifiedObject,
        );
        const { payerContext, payerLimits, targetLimits, counterRef, counters, monthlyCount, storedCount } = quota;
        const nextCounters = {
            ...counters,
            [kind === 'videos' ? 'videos' : 'pdfs']: monthlyCount + 1,
        } as MonthlyCounters;

        transaction.set(newAssetRef, safeRecord);
        transaction.set(
            counterRef,
            buildCounterUpdate(
                payerContext.period,
                payerContext.periodStartMs,
                payerContext.periodEndMs,
                nextCounters,
            ),
            { merge: true },
        );
        transaction.delete(authorizationRef);

        return {
            success: true,
            count: monthlyCount + 1,
            limit: kind === 'videos' ? payerLimits.monthlyVideoUploads : payerLimits.monthlyPdfUploads,
            storedCount: storedCount + 1,
            storedLimit: kind === 'videos' ? targetLimits.storedVideos : targetLimits.storedPdfs,
            period: payerContext.period,
            periodStartMs: payerContext.periodStartMs,
            periodEndMs: payerContext.periodEndMs,
            tier: payerContext.tier,
        };
    });
};

export const registerVideoInGallery = onCall(
    { ...callableSecurityOptions, region: 'europe-west1', maxInstances: 10 },
    async (request) => registerAssetInGallery(request, 'videos'),
);

export const registerPdfInGallery = onCall(
    { ...callableSecurityOptions, region: 'europe-west1', maxInstances: 10 },
    async (request) => registerAssetInGallery(request, 'plans'),
);

export const getSubscriptionState = onCall(
    { ...callableSecurityOptions, region: 'europe-west1', maxInstances: 10 },
    async (request) => {
        if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
        const uid = request.auth.uid;
        const authIdentity = getVerifiedAuthEmail(request);

        // The verification mirror and the tier resolution don't depend on each
        // other: run them together so the write doesn't add a round trip.
        const recordVerifiedEmail = authIdentity.emailVerified && authIdentity.userEmail
            ? db.collection('users').doc(uid).set({
                emailVerified: true,
                verifiedEmail: authIdentity.userEmail.trim().toLowerCase(),
                emailVerifiedAt: FieldValue.serverTimestamp(),
            }, { merge: true })
            : Promise.resolve();

        const [, context] = await Promise.all([
            recordVerifiedEmail,
            resolveSubscriptionContext({
                db,
                uid,
                userEmail: authIdentity.userEmail,
                emailVerified: authIdentity.emailVerified,
            }),
        ]);
        return {
            tier: context.tier,
            role: context.role,
            period: context.period,
            periodStartMs: context.periodStartMs,
            periodEndMs: context.periodEndMs,
            cancelAtPeriodEnd: context.cancelAtPeriodEnd || false,
            limits: getPlanLimits(context.tier),
        };
    },
);

const MARKETING_TRIAL_CHECKOUT_REUSE_MS = 30 * 60 * 1_000;
const MARKETING_TRIAL_SOURCES = new Set(['onboarding', 'existing_user_offer']);
const MARKETING_TRIAL_LANGUAGES = new Set(['es', 'ing', 'eus']);

const normalizeMarketingTrialSource = (value: unknown) => {
    const source = typeof value === 'string' ? value.trim() : '';
    if (!MARKETING_TRIAL_SOURCES.has(source)) {
        throw new HttpsError('invalid-argument', 'El origen de la oferta no es válido.');
    }
    return source;
};

const normalizeMarketingTrialLanguage = (value: unknown) => {
    const language = typeof value === 'string' ? value.trim() : 'es';
    return MARKETING_TRIAL_LANGUAGES.has(language) ? language : 'es';
};

const repairTestModeStripeCustomerMapping = async (uid: string) => {
    const customerRef = db.collection('customers').doc(uid);
    const customerSnap = await customerRef.get();
    if (!customerSnap.exists) return false;

    const customerData = customerSnap.data() || {};
    if (!isTestModeStripeCustomerLink(customerData.stripeLink)) return false;

    // Some early CoachAI accounts were linked while the Stripe extension used
    // a test key. Removing only that obsolete mapping lets the extension create
    // a live customer on the next checkout without touching the Firebase user,
    // profile, assets, consent, or subscription history.
    await customerRef.set({
        stripeId: FieldValue.delete(),
        stripeLink: FieldValue.delete(),
        stripeTestMappingResetAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    console.warn(`[Stripe repair] Removed test-mode customer mapping for UID ${uid}.`);
    return true;
};

export const getMarketingTrialOffer = onCall(
    { ...callableSecurityOptions, region: 'europe-west1', maxInstances: 10 },
    async (request) => {
        if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');

        const uid = request.auth.uid;
        const userSnap = await db.collection('users').doc(uid).get();
        if (!userSnap.exists) {
            return { show: false, eligible: false, reason: 'profile_missing' };
        }

        const userData = userSnap.data() || {};
        const profile = userData.profile;
        if (!profile || !['athlete', 'coach'].includes(String(profile.role))) {
            return { show: false, eligible: false, reason: 'profile_incomplete' };
        }
        if (!isAdultProfile(profile)) {
            return { show: false, eligible: false, reason: 'adult_only' };
        }

        const context = await resolveSubscriptionContext({
            db,
            uid,
            ...getVerifiedAuthEmail(request),
        });
        const plan = getMarketingTrialPlan(context.role);
        const hasClaimed = Boolean(userData.marketingTrialClaimedAt);
        const dismissed = hasCurrentMarketingTrialDismissal(userData);
        const eligible = context.tier === 'FREE' && !hasClaimed;

        return {
            show: eligible && !dismissed,
            eligible,
            reason: !eligible
                ? (context.tier !== 'FREE' ? 'subscription_active' : 'already_claimed')
                : (dismissed ? 'dismissed' : null),
            role: plan.role,
            planName: plan.planName,
            monthlyAmountCents: plan.monthlyAmountCents,
            monthlyPriceLabel: plan.monthlyPriceLabel,
            freeMonths: MARKETING_FREE_MONTHS,
        };
    },
);

export const dismissMarketingTrialOffer = onCall(
    { ...callableSecurityOptions, region: 'europe-west1', maxInstances: 10 },
    async (request) => {
        if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
        const source = normalizeMarketingTrialSource(request.data?.source);
        await db.collection('users').doc(request.auth.uid).set({
            marketingTrialOfferDismissedAt: FieldValue.serverTimestamp(),
            marketingTrialOfferDismissedSource: source,
            marketingTrialOfferDismissedVersion: MARKETING_TRIAL_OFFER_VERSION,
        }, { merge: true });
        return { success: true };
    },
);

export const createMarketingTrialCheckout = onCall(
    { ...callableSecurityOptions, region: 'europe-west1', maxInstances: 10 },
    async (request) => {
        if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
        if (request.data?.acceptedMarketing !== true) {
            throw new HttpsError('failed-precondition', 'Debes aceptar expresamente las comunicaciones de CoachAI.');
        }

        const successUrl = request.data?.successUrl;
        const cancelUrl = request.data?.cancelUrl;
        if (!isAllowedCheckoutReturnUrl(successUrl) || !isAllowedCheckoutReturnUrl(cancelUrl)) {
            throw new HttpsError('invalid-argument', 'La URL de retorno de Stripe no está permitida.');
        }

        const source = normalizeMarketingTrialSource(request.data?.source);
        const language = normalizeMarketingTrialLanguage(request.data?.language);
        const uid = request.auth.uid;
        const authIdentity = getVerifiedAuthEmail(request);

        await repairTestModeStripeCustomerMapping(uid);

        const result = await db.runTransaction(async (transaction) => {
            const userRef = db.collection('users').doc(uid);
            const userSnap = await transaction.get(userRef);
            if (!userSnap.exists) {
                throw new HttpsError('failed-precondition', 'Completa tu perfil antes de activar el primer mes gratis.');
            }

            const userData = userSnap.data() || {};
            const profile = userData.profile;
            if (!profile || !['athlete', 'coach'].includes(String(profile.role))) {
                throw new HttpsError('failed-precondition', 'Completa tu perfil antes de activar el primer mes gratis.');
            }
            if (!isAdultProfile(profile)) {
                throw new HttpsError('permission-denied', 'El primer mes gratis con renovación automática solo está disponible para mayores de 18 años.');
            }
            if (userData.marketingTrialClaimedAt) {
                throw new HttpsError('already-exists', 'Esta cuenta ya ha utilizado el primer mes gratis.');
            }

            const context = await resolveSubscriptionContext({
                db,
                uid,
                userEmail: authIdentity.userEmail,
                emailVerified: authIdentity.emailVerified,
                transaction,
            });
            if (context.tier !== 'FREE') {
                throw new HttpsError('failed-precondition', 'Ya tienes una suscripción activa.');
            }

            const existingCheckoutId = typeof userData.marketingTrialCheckoutDocId === 'string'
                ? userData.marketingTrialCheckoutDocId
                : '';
            const existingCheckoutCreatedMs = toMillis(userData.marketingTrialCheckoutCreatedAt);
            if (
                existingCheckoutId
                && existingCheckoutCreatedMs > Date.now() - MARKETING_TRIAL_CHECKOUT_REUSE_MS
            ) {
                const existingCheckoutRef = db.collection('customers').doc(uid)
                    .collection('checkout_sessions').doc(existingCheckoutId);
                const existingCheckoutSnap = await transaction.get(existingCheckoutRef);
                if (
                    existingCheckoutSnap.exists
                    && !existingCheckoutSnap.data()?.error
                    && existingCheckoutSnap.data()?.promotion_code === MARKETING_FREE_MONTH_PROMOTION_CODE_ID
                ) {
                    return { checkoutSessionId: existingCheckoutId, reused: true };
                }
            }

            const plan = getMarketingTrialPlan(context.role);
            const checkoutRef = db.collection('customers').doc(uid)
                .collection('checkout_sessions').doc();
            transaction.set(checkoutRef, {
                price: plan.priceId,
                mode: 'subscription',
                success_url: successUrl,
                cancel_url: cancelUrl,
                payment_method_collection: 'always',
                promotion_code: MARKETING_FREE_MONTH_PROMOTION_CODE_ID,
                locale: language === 'ing' ? 'en' : language === 'es' ? 'es' : 'auto',
                client_reference_id: uid,
                metadata: {
                    coachai_offer: MARKETING_TRIAL_OFFER_ID,
                    coachai_uid: uid,
                    marketing_consent_version: MARKETING_CONSENT_VERSION,
                },
                created: new Date().toISOString(),
            });
            transaction.set(userRef, {
                marketingConsentPending: true,
                marketingConsentPendingAt: FieldValue.serverTimestamp(),
                marketingConsentPendingVersion: MARKETING_CONSENT_VERSION,
                marketingConsentPendingSource: source,
                marketingConsentPendingLanguage: language,
                marketingTrialCheckoutCreatedAt: FieldValue.serverTimestamp(),
                marketingTrialCheckoutDocId: checkoutRef.id,
                marketingTrialOfferDismissedAt: FieldValue.delete(),
                marketingTrialOfferDismissedSource: FieldValue.delete(),
                marketingTrialOfferDismissedVersion: FieldValue.delete(),
            }, { merge: true });

            return { checkoutSessionId: checkoutRef.id, reused: false };
        });

        return result;
    },
);

// Callable: Get coach's global quota usage
export const getCoachQuotaUsage = onCall(
    { ...callableSecurityOptions, region: "europe-west1", maxInstances: 10 },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
        const uid = request.auth.uid;

        const context = await resolveSubscriptionContext({
            db,
            uid,
            ...getVerifiedAuthEmail(request),
        });
        const { period, periodStartMs, periodEndMs, tier } = context;
        const [counterSnap, userDataSnap] = await Promise.all([
            db.collection("quota_counters").doc(uid).get(),
            db.collection("userdata").doc(uid).get(),
        ]);
        const counters = normalizeMonthlyCounters(
            counterSnap.exists ? counterSnap.data()! : {},
            period,
            periodStartMs,
            periodEndMs,
            userDataSnap.exists ? userDataSnap.data()?.usage : undefined,
        );

        const limits = getPlanLimits(tier);

        return {
            videosUsed: counters.videos,
            videosLimit: limits.monthlyVideoUploads,
            videosStoredLimit: limits.storedVideos,
            pdfsUsed: counters.pdfs,
            pdfsLimit: limits.monthlyPdfUploads,
            pdfsStoredLimit: limits.storedPdfs,
            chatsUsed: counters.chats,
            chatsLimit: limits.monthlyAiMessages,
            period,
            periodStartMs,
            periodEndMs,
            tier
        };
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

const deleteStorageObjectForAsset = async (
    asset: StoredAssetRecord,
    ownerId: string,
    kind: StoredAssetKind,
) => {
    const storagePath = typeof asset.data?.storagePath === 'string' ? asset.data.storagePath : '';
    const expectedPrefix = `${kind}/${ownerId}/`;
    if (!storagePath.startsWith(expectedPrefix) || storagePath.slice(expectedPrefix.length).includes('/')) return;
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
    await Promise.all(remove.map((asset) => deleteStorageObjectForAsset(asset, uid, kind)));
    return remove.length;
};

const enforceStoredAssetLimits = async (uid: string) => {
    const tier = await resolveUserTier(uid);
    const limits = getPlanLimits(tier);

    const [videoAssets, pdfAssets] = await Promise.all([
        readStoredAssets(uid, 'videos'),
        readStoredAssets(uid, 'plans'),
    ]);

    const videosToDelete = getExpiredGraceDeletionCount(videoAssets.length, limits.storedVideos);
    const pdfsToDelete = getExpiredGraceDeletionCount(pdfAssets.length, limits.storedPdfs);
    const deletedVideos = videosToDelete > 0
        ? await deleteExcessStoredAssets(uid, 'videos', 0)
        : 0;
    const deletedPdfs = pdfsToDelete > 0
        ? await deleteExcessStoredAssets(uid, 'plans', 0)
        : 0;

    return { tier, limits, deletedVideos, deletedPdfs };
};

// Helper Centralizado: revisa el cumplimiento de vídeos/PDFs guardados tras borrar o cambiar de tier.
export const evaluateVideoQuotaCompliance = async (uid: string) => {
    const tier = await resolveUserTier(uid);
    const limits = getPlanLimits(tier);

    const [videoAssets, pdfAssets] = await Promise.all([
        readStoredAssets(uid, 'videos'),
        readStoredAssets(uid, 'plans'),
    ]);

    const videoCount = videoAssets.length;
    const pdfCount = pdfAssets.length;
    const isVideoOver = videoCount > limits.storedVideos;
    const isPdfOver = pdfCount > limits.storedPdfs;

    const enforcementRef = db.collection("account_enforcement").doc(uid);
    const enforcSnap = await enforcementRef.get();

    if (!isVideoOver && !isPdfOver) {
        // COMPLIANT -> Levantar restricciones
        if (enforcSnap.exists && ['OVER_LIMIT_GRACE_PERIOD', 'PENDING_ASSET_DELETION', 'ASSET_DELETION_IN_PROGRESS', 'PENDING_ACCOUNT_DELETION'].includes(enforcSnap.data()?.status)) {
            const wasAutomaticDeletion = ['PENDING_ASSET_DELETION', 'ASSET_DELETION_IN_PROGRESS', 'PENDING_ACCOUNT_DELETION']
                .includes(enforcSnap.data()?.status);
            await enforcementRef.update({
                status: 'COMPLIANT',
                gracePeriodEndsAt: null,
                currentVideoCount: videoCount,
                allowedVideoLimit: limits.storedVideos,
                currentPdfCount: pdfCount,
                allowedPdfLimit: limits.storedPdfs,
                lastEvaluatedAt: FieldValue.serverTimestamp()
            });

            if (!wasAutomaticDeletion) {
                await db.collection("notifications").add({
                    userId: uid, title: "Límite restituido",
                    body: "¡Genial! Has vuelto dentro de los márgenes de tu plan y desaparecen las restricciones.",
                    severity: "info", read: false, createdAt: new Date().toISOString()
                });
            }
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
                allowedVideoLimit: limits.storedVideos,
                currentVideoCount: videoCount,
                allowedPdfLimit: limits.storedPdfs,
                currentPdfCount: pdfCount,
                overVideoLimit: isVideoOver,
                overPdfLimit: isPdfOver,
                gracePeriodEndsAt: Timestamp.fromDate(endLimitTime),
                lastEvaluatedAt: FieldValue.serverTimestamp()
            }, { merge: true });

            const overParts = [
                isVideoOver ? `${videoCount} vídeos (límite ${limits.storedVideos})` : '',
                isPdfOver ? `${pdfCount} PDFs (límite ${limits.storedPdfs})` : '',
            ].filter(Boolean).join(' y ');

            await db.collection("notifications").add({
                userId: uid, title: "¡Límite excedido por Downgrade!",
                body: `Tu plan actual tiene menos capacidad: tienes ${overParts}. Tienes 3 días para elegir qué conservar y reducir cada galería a su límite. Si no lo haces, se eliminarán todos los vídeos y/o todos los PDF de las categorías que sigan excedidas.`,
                severity: "critical", read: false, createdAt: new Date().toISOString()
            });
        } else if (enforcSnap.exists && enforcSnap.data()?.status === 'OVER_LIMIT_GRACE_PERIOD') {
            await enforcementRef.set({
                allowedVideoLimit: limits.storedVideos,
                currentVideoCount: videoCount,
                allowedPdfLimit: limits.storedPdfs,
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

    const expiredUploadAuthorizations = await db.collection('upload_authorizations')
        .where('expiresAt', '<=', now)
        .limit(50)
        .get();
    for (const authorizationDoc of expiredUploadAuthorizations.docs) {
        const authorization = authorizationDoc.data() || {};
        const kind = authorization.kind === 'videos' || authorization.kind === 'plans'
            ? authorization.kind as UploadKind
            : null;
        const targetUserId = typeof authorization.targetUserId === 'string' ? authorization.targetUserId : '';
        const storagePath = typeof authorization.storagePath === 'string' ? authorization.storagePath : '';
        const expectedPrefix = kind && targetUserId ? `${kind}/${targetUserId}/` : '';
        if (
            expectedPrefix
            && storagePath.startsWith(expectedPrefix)
            && !storagePath.slice(expectedPrefix.length).includes('/')
        ) {
            await getStorage().bucket().file(storagePath)
                .delete({ ignoreNotFound: true } as any)
                .catch((error) => console.warn('[Upload Authorization] Error limpiando archivo huérfano.', error));
        }
        await authorizationDoc.ref.delete();
    }

    // Some Stripe sync configurations remove the subscription document as soon
    // as cancellation is requested. Expire the server-side paid-access fallback
    // only when the already-paid billing period has actually finished.
    const expiredAccessSnap = await db.collection("users")
        .where("subscriptionAccessUntil", "<=", now)
        .limit(25)
        .get();

    for (const expiredUserDoc of expiredAccessSnap.docs) {
        const expiredUid = expiredUserDoc.id;
        // One user's failure (e.g. a transient Auth error) must not abort the
        // whole run, and the access fields are cleared only after the tier was
        // resolved and written, so a failed user is picked up again next run.
        try {
            const currentUserSnap = await expiredUserDoc.ref.get();
            if (!currentUserSnap.exists) continue;

            const context = await resolveSubscriptionContext({
                db,
                uid: expiredUid,
                emailSource: 'authRecord',
            });

            // Merge only the tier leaf: re-writing the whole profile snapshot
            // could clobber server-managed relationship arrays updated meanwhile.
            await expiredUserDoc.ref.set({
                currentPlanId: context.tier,
                profile: { subscriptionTier: context.tier },
                subscriptionTierUpdatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });

            await db.runTransaction(async transaction => {
                const freshUserSnap = await transaction.get(expiredUserDoc.ref);
                if (!freshUserSnap.exists) return;
                const accessUntilMs = toMillis(freshUserSnap.data()?.subscriptionAccessUntil);
                if (!accessUntilMs || accessUntilMs > now.toMillis()) return;
                transaction.update(expiredUserDoc.ref, {
                    subscriptionAccessTier: FieldValue.delete(),
                    subscriptionAccessUntil: FieldValue.delete(),
                    subscriptionAccessPeriodStart: FieldValue.delete(),
                });
            });

            await rebalanceCoachAthletesSafely(expiredUid, 'enforcementCronJob');
            await evaluateVideoQuotaCompliance(expiredUid);
        } catch (error: any) {
            console.error(`[Enforcement Cron] Skipping ${expiredUid} until the next run:`, error?.message || error);
        }
    }

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
                title: "Galerías eliminadas por límite vencido",
                body: `El periodo de gracia terminó sin que las galerías se ajustaran. Se eliminaron ${result.deletedVideos} vídeos y ${result.deletedPdfs} PDF.`,
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
    // retry: its writes are idempotent, and a transient Auth/Firestore error
    // must not leave the tier, athlete limit and asset checks unapplied.
    { document: "customers/{uid}/subscriptions/{subscriptionId}", region: "europe-west1", retry: true },
    async (event) => {
        const uid = event.params.uid;
        const userRef = db.collection("users").doc(uid);
        const userSnap = await userRef.get();
        const userData = userSnap.exists ? userSnap.data() : {};
        const beforeData = event.data?.before.exists ? event.data.before.data() : undefined;
        const afterData = event.data?.after.exists ? event.data.after.data() : undefined;
        const role = userData?.profile?.role === 'coach' || userData?.profile?.role === 'admin'
            ? 'coach'
            : 'athlete';
        const activeStatuses = ['active', 'trialing'];

        if (afterData && activeStatuses.includes(String(afterData.status))) {
            let isMarketingTrialSubscription = hasMarketingTrialMetadata(afterData.metadata);
            const pendingCheckoutId = typeof userData?.marketingTrialCheckoutDocId === 'string'
                ? userData.marketingTrialCheckoutDocId
                : '';

            if (!isMarketingTrialSubscription && pendingCheckoutId) {
                const checkoutSnap = await db.collection('customers').doc(uid)
                    .collection('checkout_sessions').doc(pendingCheckoutId).get();
                const checkoutSubscription = checkoutSnap.data()?.subscription;
                const checkoutSubscriptionId = typeof checkoutSubscription === 'string'
                    ? checkoutSubscription
                    : checkoutSubscription?.id;
                isMarketingTrialSubscription = checkoutSubscriptionId === event.params.subscriptionId;
            }

            const activeSubscriptionUpdate: Record<string, unknown> = {
                subscriptionAccessTier: FieldValue.delete(),
                subscriptionAccessUntil: FieldValue.delete(),
                subscriptionAccessPeriodStart: FieldValue.delete(),
            };

            if (isMarketingTrialSubscription) {
                const trialEndsAtMs = toMillis(
                    afterData.trial_end
                    || afterData.trialEnd
                    || afterData.current_period_end
                    || afterData.currentPeriodEnd,
                );
                activeSubscriptionUpdate.marketingTrialClaimedAt = userData?.marketingTrialClaimedAt
                    || FieldValue.serverTimestamp();
                activeSubscriptionUpdate.marketingTrialSubscriptionId = event.params.subscriptionId;
                activeSubscriptionUpdate.marketingTrialEndsAt = trialEndsAtMs > Date.now()
                    ? Timestamp.fromMillis(trialEndsAtMs)
                    : FieldValue.delete();
                activeSubscriptionUpdate.marketingTrialCheckoutDocId = FieldValue.delete();
                activeSubscriptionUpdate.marketingTrialCheckoutCreatedAt = FieldValue.delete();
                activeSubscriptionUpdate.marketingConsent = true;
                activeSubscriptionUpdate.marketingConsentGrantedAt = userData?.marketingConsentGrantedAt
                    || userData?.marketingConsentPendingAt
                    || FieldValue.serverTimestamp();
                activeSubscriptionUpdate.marketingConsentUpdatedAt = FieldValue.serverTimestamp();
                activeSubscriptionUpdate.marketingConsentVersion = userData?.marketingConsentPendingVersion
                    || MARKETING_CONSENT_VERSION;
                activeSubscriptionUpdate.marketingConsentSource = userData?.marketingConsentPendingSource
                    || 'existing_user_offer';
                activeSubscriptionUpdate.marketingConsentLanguage = userData?.marketingConsentPendingLanguage
                    || 'es';
                activeSubscriptionUpdate.marketingConsentPending = FieldValue.delete();
                activeSubscriptionUpdate.marketingConsentPendingAt = FieldValue.delete();
                activeSubscriptionUpdate.marketingConsentPendingVersion = FieldValue.delete();
                activeSubscriptionUpdate.marketingConsentPendingSource = FieldValue.delete();
                activeSubscriptionUpdate.marketingConsentPendingLanguage = FieldValue.delete();
            }

            await userRef.set(activeSubscriptionUpdate, { merge: true });
        } else if (beforeData && activeStatuses.includes(String(beforeData.status))) {
            // Retain benefits until the end of the paid period even if the Stripe
            // document disappears immediately after cancellation.
            const paidAccessSource = afterData || beforeData;
            const paidAccessTier = resolveTierForPrice(
                extractSubscriptionPriceId(paidAccessSource),
                role,
            );
            const firstItem = paidAccessSource?.items?.data?.[0] || paidAccessSource?.items?.[0] || {};
            const periodStartMs = toMillis(
                paidAccessSource?.current_period_start
                || paidAccessSource?.currentPeriodStart
                || firstItem?.current_period_start,
            );
            const periodEndMs = toMillis(
                paidAccessSource?.current_period_end
                || paidAccessSource?.currentPeriodEnd
                || firstItem?.current_period_end,
            );

            if (paidAccessTier && periodEndMs > Date.now()) {
                await userRef.set({
                    subscriptionAccessTier: paidAccessTier,
                    subscriptionAccessUntil: Timestamp.fromMillis(periodEndMs),
                    subscriptionAccessPeriodStart: periodStartMs > 0
                        ? Timestamp.fromMillis(periodStartMs)
                        : FieldValue.delete(),
                }, { merge: true });
            }
        }

        const tier = await resolveUserTier(uid);

        // Merge only the tier leaf: re-writing the profile snapshot read at the
        // start of the trigger could clobber relationship arrays updated since.
        await userRef.set({
            currentPlanId: tier,
            profile: { subscriptionTier: tier },
            subscriptionTierUpdatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        // Suspend (or restore) coached athletes beyond the plan's athlete limit.
        await rebalanceCoachAthletesSafely(uid, 'Subscription Trigger');

        // After Stripe webhook has modified the record, assess stored assets and start grace period if out-of-bounds.
        console.log(`[Subscription Trigger] Evaluating quota compliance for UID: ${uid}`);
        await evaluateVideoQuotaCompliance(uid);
    }
);

// Trigger: count direct-write fallback video uploads when callable flow was unavailable
export const onVideoCreatedFallback = onDocumentWritten(
    { document: "userdata/{uid}/videos/{videoId}", region: "europe-west1" },
    async (event) => {
        if (!event.data?.after.exists || event.data?.before.exists) return;

        const uid = event.params.uid;
        const createdData = event.data.after.data();
        // Only server-registered records (registerAssetInGallery) are already
        // billed. Anything else is billed to the gallery owner: client-written
        // fields such as uploadedByCoachId never choose who pays.
        if (createdData?.quotaCounted === true) return;

        const quotaPayer = uid;

        try {
            await consumeMonthlyQuota(quotaPayer, undefined, 'videos', false, 'authRecord');
        } catch (error) {
            // Only an exhausted quota removes the upload; transient failures
            // (e.g. resolving the plan) must never delete user content.
            if (!(error instanceof HttpsError) || error.code !== 'resource-exhausted') throw error;
            await deleteStorageObjectForAsset(
                { id: event.params.videoId, data: createdData, ref: event.data.after.ref },
                uid,
                'videos',
            );
            await event.data.after.ref.delete();
            await db.collection("notifications").add({
                userId: quotaPayer,
                title: "Límite del ciclo alcanzado",
                body: "Se ha bloqueado una subida de vídeo porque tu suscripción ya alcanzó el límite del ciclo actual.",
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
        await evaluateVideoQuotaCompliance(uid);
    }
);

// Trigger: count direct-write fallback PDF uploads when callable flow was unavailable
export const onPdfCreatedFallback = onDocumentWritten(
    { document: "userdata/{uid}/plans/{planId}", region: "europe-west1" },
    async (event) => {
        if (!event.data?.after.exists || event.data?.before.exists) return;

        const uid = event.params.uid;
        const createdData = event.data.after.data();
        // Only server-registered records (registerAssetInGallery) are already
        // billed. Anything else is billed to the gallery owner: client-written
        // fields such as uploadedByCoachId never choose who pays.
        if (createdData?.quotaCounted === true) return;

        const quotaPayer = uid;

        try {
            await consumeMonthlyQuota(quotaPayer, undefined, 'pdfs', false, 'authRecord');
        } catch (error) {
            // Only an exhausted quota removes the upload; transient failures
            // (e.g. resolving the plan) must never delete user content.
            if (!(error instanceof HttpsError) || error.code !== 'resource-exhausted') throw error;
            await deleteStorageObjectForAsset(
                { id: event.params.planId, data: createdData, ref: event.data.after.ref },
                uid,
                'plans',
            );
            await event.data.after.ref.delete();
            await db.collection("notifications").add({
                userId: quotaPayer,
                title: "Límite del ciclo alcanzado",
                body: "Se ha bloqueado una subida de PDF porque tu suscripción ya alcanzó el límite del ciclo actual.",
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
            console.log(`[Video Deletion Trigger] Re-evaluating stored asset compliance for gallery owner: ${uid}`);
            await evaluateVideoQuotaCompliance(uid);
        }
    }
);

// Trigger: PDF deletion check. Monthly upload counters are never decremented.
export const onPdfDeletion = onDocumentWritten(
    { document: "userdata/{uid}/plans/{planId}", region: "europe-west1" },
    async (event) => {
        const uid = event.params.uid;
        if (!event.data?.after.exists) {
            console.log(`[PDF Deletion Trigger] Re-evaluating stored asset compliance for gallery owner: ${uid}`);
            await evaluateVideoQuotaCompliance(uid);
        }
    }
);
