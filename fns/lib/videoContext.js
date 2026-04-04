import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { GoogleGenerativeAI, TaskType } from '@google/generative-ai';
import { buildRetrievalTrace, formatCompactStructuredAnswer, pickKeyMomentsForQuestion, rankSegmentsForQuestion, } from './video-intelligence/core.js';
import { buildVideoContextProcessingPrompt, buildVideoQuestionPrompt, VIDEO_ANSWER_SCHEMA, VIDEO_CONTEXT_SCHEMA, } from './video-intelligence/prompts.js';
if (!getApps().length) {
    initializeApp();
}
const db = getFirestore();
const geminiApiKey = defineSecret('GEMINI_API_KEY');
const PREMIUM_EMAILS = [
    'alejandrosanchez@gmail.com',
    'peioetxabe@hotmail.com',
    'fernandezeuken@gmail.com',
    'julianweber@gmail.com',
];
const PROCESSING_VERSION = 'video-context-v1';
const MAX_SAMPLE_FRAMES = 12;
const MAX_QUERY_FRAMES = 7;
const resolveUserTier = (uid, userEmail, userData) => {
    if (userEmail && PREMIUM_EMAILS.includes(String(userEmail).toLowerCase()))
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
const normalizeLanguage = (value) => value === 'ing' || value === 'eus' ? value : 'es';
const normalizeConfidence = (value) => {
    const normalized = String(value || '').toLowerCase();
    if (normalized.includes('high') || normalized.includes('alta') || normalized.includes('handia'))
        return 'high';
    if (normalized.includes('low') || normalized.includes('baja') || normalized.includes('txiki'))
        return 'low';
    return 'medium';
};
const sanitizeText = (value, fallback = '') => {
    if (typeof value !== 'string')
        return fallback;
    return value.trim();
};
const ensureStringArray = (value) => {
    if (!Array.isArray(value))
        return [];
    return value
        .map((item) => sanitizeText(item))
        .filter(Boolean)
        .slice(0, 6);
};
const clampNumber = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed))
        return min;
    return Number(Math.min(max, Math.max(min, parsed)).toFixed(3));
};
const parseJsonResponse = (rawText) => {
    const cleaned = rawText
        .trim()
        .replace(/^```json/i, '')
        .replace(/^```/, '')
        .replace(/```$/, '')
        .trim();
    return JSON.parse(cleaned);
};
const getUserTier = async (uid, email) => {
    const userSnap = await db.collection('users').doc(uid).get();
    const userData = userSnap.exists ? userSnap.data() : {};
    return resolveUserTier(uid, email, userData);
};
const validateTargetAccess = async (callerId, targetUserId) => {
    if (callerId === targetUserId)
        return;
    const relationSnap = await db.collection('requests').doc(`${callerId}_${targetUserId}`).get();
    if (!relationSnap.exists || relationSnap.data()?.status !== 'accepted') {
        throw new HttpsError('permission-denied', `No tienes acceso a los datos del usuario ${targetUserId}.`);
    }
};
const getContextRef = (userId, videoId) => db.collection('userdata').doc(userId).collection('videoContexts').doc(videoId);
const getSegmentsRef = (userId, videoId) => getContextRef(userId, videoId).collection('segments');
const getSessionsRef = (userId, videoId) => getContextRef(userId, videoId).collection('chatSessions');
const buildGenerationParts = (prompt, frames) => {
    const parts = [{ text: prompt }];
    frames.forEach((frame, index) => {
        parts.push({
            text: `Frame ${index + 1}: ${frame.label} at ${frame.timestampSeconds.toFixed(3)}s.`,
        });
        parts.push({
            inlineData: {
                mimeType: 'image/jpeg',
                data: frame.base64Jpeg,
            },
        });
    });
    return parts;
};
const embedText = async (genAI, text, taskType) => {
    if (!text.trim())
        return [];
    const embedModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
    const result = await embedModel.embedContent({
        content: {
            role: 'user',
            parts: [{ text }],
        },
        taskType,
    });
    return result.embedding.values || [];
};
const persistSegments = async (userId, videoId, segments) => {
    const batch = db.batch();
    const segmentsRef = getSegmentsRef(userId, videoId);
    const existing = await segmentsRef.get();
    existing.docs.forEach((doc) => batch.delete(doc.ref));
    segments.forEach((segment) => batch.set(segmentsRef.doc(segment.id), segment));
    await batch.commit();
};
const normalizeSegments = (rawSegments, segmentPlan, durationSeconds) => {
    const fallbackSegments = rawSegments.length > 0 ? rawSegments : segmentPlan;
    return fallbackSegments.map((rawSegment, index) => {
        const fallback = segmentPlan[index] || segmentPlan[segmentPlan.length - 1];
        const startTimeSeconds = clampNumber(rawSegment?.startTimeSeconds ?? fallback?.startTimeSeconds ?? 0, 0, durationSeconds);
        const endTimeSeconds = clampNumber(rawSegment?.endTimeSeconds ?? fallback?.endTimeSeconds ?? durationSeconds, startTimeSeconds, durationSeconds);
        const representativeTimeSeconds = clampNumber(rawSegment?.representativeTimeSeconds ??
            fallback?.representativeTimeSeconds ??
            (startTimeSeconds + endTimeSeconds) / 2, startTimeSeconds, endTimeSeconds);
        const segment = {
            id: sanitizeText(rawSegment?.segmentId, fallback?.id || `segment_${index + 1}`),
            startTimeSeconds,
            endTimeSeconds,
            representativeTimeSeconds,
            phaseLabel: sanitizeText(rawSegment?.phaseLabel, fallback?.label || `Segment ${index + 1}`),
            summary: sanitizeText(rawSegment?.summary, 'No hay suficiente información visual para resumir este tramo con más precisión.'),
            visibleObservations: ensureStringArray(rawSegment?.visibleObservations),
            technicalFocus: ensureStringArray(rawSegment?.technicalFocus),
            probableErrors: ensureStringArray(rawSegment?.probableErrors),
            coachingCues: ensureStringArray(rawSegment?.coachingCues),
            confidence: normalizeConfidence(rawSegment?.confidence),
            embedding: [],
        };
        return segment;
    });
};
const normalizeKeyMoments = (rawKeyMoments, segments, durationSeconds) => {
    if (!Array.isArray(rawKeyMoments) || rawKeyMoments.length === 0) {
        return segments.slice(0, 3).map((segment) => ({
            id: `moment_${segment.id}`,
            timestampSeconds: segment.representativeTimeSeconds,
            label: segment.phaseLabel,
            note: segment.summary,
            phaseLabel: segment.phaseLabel,
            confidence: segment.confidence,
        }));
    }
    return rawKeyMoments.slice(0, 5).map((rawMoment, index) => ({
        id: `moment_${index + 1}`,
        timestampSeconds: clampNumber(rawMoment?.timestampSeconds, 0, durationSeconds),
        label: sanitizeText(rawMoment?.label, `Momento ${index + 1}`),
        note: sanitizeText(rawMoment?.note, 'Momento relevante detectado en el gesto.'),
        phaseLabel: sanitizeText(rawMoment?.phaseLabel),
        confidence: normalizeConfidence(rawMoment?.confidence),
    }));
};
const enrichSegmentsWithEmbeddings = async (genAI, segments) => {
    const embeddings = await Promise.all(segments.map((segment) => embedText(genAI, [segment.phaseLabel, segment.summary, ...segment.technicalFocus, ...segment.probableErrors]
        .filter(Boolean)
        .join('\n'), TaskType.RETRIEVAL_DOCUMENT).catch(() => [])));
    return segments.map((segment, index) => ({
        ...segment,
        embedding: embeddings[index],
    }));
};
const readPersistedSegments = async (userId, videoId) => {
    const snapshot = await getSegmentsRef(userId, videoId).orderBy('startTimeSeconds').get();
    return snapshot.docs.map((doc) => doc.data());
};
export const upsertVideoContext = onCall({
    region: 'europe-west1',
    maxInstances: 10,
    secrets: [geminiApiKey],
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }
    const callerId = request.auth.uid;
    const targetUserId = sanitizeText(request.data?.targetUserId, callerId);
    const videoId = sanitizeText(request.data?.videoId);
    const videoName = sanitizeText(request.data?.videoName);
    const metadata = (request.data?.metadata || {});
    const segmentPlan = Array.isArray(request.data?.segments)
        ? request.data.segments.slice(0, MAX_SAMPLE_FRAMES)
        : [];
    const sampleFrames = Array.isArray(request.data?.sampleFrames)
        ? request.data.sampleFrames.slice(0, MAX_SAMPLE_FRAMES)
        : [];
    const samplingProfile = sanitizeText(request.data?.samplingProfile, 'standard');
    const language = normalizeLanguage(request.data?.language);
    const sportContext = (request.data?.sportContext || {});
    if (!videoId || sampleFrames.length === 0) {
        throw new HttpsError('invalid-argument', 'Faltan artefactos de muestreo del vídeo.');
    }
    await validateTargetAccess(callerId, targetUserId);
    const contextRef = getContextRef(targetUserId, videoId);
    await contextRef.set({
        videoId,
        userId: targetUserId,
        status: 'summarizing',
        processingStage: 'summarizing',
        processingVersion: PROCESSING_VERSION,
        sampledFrameTimestamps: sampleFrames.map((frame) => frame.timestampSeconds),
        metadata,
        sport: sportContext.sport || '',
        discipline: sportContext.discipline || '',
        lastError: null,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    const tier = await getUserTier(callerId, request.auth.token.email);
    const modelName = resolveAllowedModelForTier(tier);
    const genAI = new GoogleGenerativeAI(geminiApiKey.value());
    const processingModel = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
            temperature: 0.25,
            responseMimeType: 'application/json',
            responseSchema: VIDEO_CONTEXT_SCHEMA,
        },
    });
    try {
        const prompt = buildVideoContextProcessingPrompt({
            language,
            sport: sportContext.sport,
            discipline: sportContext.discipline,
            metadata,
            segments: segmentPlan,
        });
        const generation = await processingModel.generateContent(buildGenerationParts(prompt, sampleFrames));
        const parsed = parseJsonResponse(generation.response.text());
        let normalizedSegments = normalizeSegments(Array.isArray(parsed.segments) ? parsed.segments : [], segmentPlan, metadata.durationSeconds || 0);
        normalizedSegments = await enrichSegmentsWithEmbeddings(genAI, normalizedSegments);
        const keyMoments = normalizeKeyMoments(Array.isArray(parsed.keyMoments) ? parsed.keyMoments : [], normalizedSegments, metadata.durationSeconds || 0);
        const usedFallbacks = !Array.isArray(parsed.segments) ||
            parsed.segments.length === 0 ||
            !sanitizeText(parsed.globalTechnicalAssessment);
        await persistSegments(targetUserId, videoId, normalizedSegments);
        await contextRef.set({
            videoId,
            userId: targetUserId,
            status: (usedFallbacks ? 'partial' : 'ready'),
            processingStage: usedFallbacks ? 'partial_context_ready' : 'complete_context_ready',
            processingVersion: PROCESSING_VERSION,
            videoName,
            samplingProfile,
            metadata,
            sport: sportContext.sport || '',
            discipline: sportContext.discipline || '',
            globalSummary: sanitizeText(parsed.globalSummary),
            globalTechnicalAssessment: sanitizeText(parsed.globalTechnicalAssessment),
            timelineSummary: ensureStringArray(parsed.timelineSummary),
            keyMoments,
            segmentCount: normalizedSegments.length,
            sampledFrameTimestamps: sampleFrames.map((frame) => frame.timestampSeconds),
            recommendedQuestions: ensureStringArray(parsed.recommendedQuestions),
            lastError: null,
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return {
            status: usedFallbacks ? 'partial' : 'ready',
            segmentCount: normalizedSegments.length,
            keyMomentCount: keyMoments.length,
        };
    }
    catch (error) {
        console.error('[upsertVideoContext] Error:', error);
        await contextRef.set({
            status: 'failed',
            processingStage: 'failed',
            lastError: error?.message || 'Video context processing failed.',
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        throw new HttpsError('internal', 'No se pudo procesar el contexto del vídeo.');
    }
});
export const askVideoQuestion = onCall({
    region: 'europe-west1',
    maxInstances: 20,
    secrets: [geminiApiKey],
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }
    const callerId = request.auth.uid;
    const targetUserId = sanitizeText(request.data?.targetUserId, callerId);
    const videoId = sanitizeText(request.data?.videoId);
    const message = sanitizeText(request.data?.message);
    const sessionId = sanitizeText(request.data?.sessionId);
    const currentTimeSeconds = request.data?.currentTimeSeconds === null || request.data?.currentTimeSeconds === undefined
        ? null
        : clampNumber(request.data?.currentTimeSeconds);
    const durationSeconds = request.data?.durationSeconds === null || request.data?.durationSeconds === undefined
        ? null
        : clampNumber(request.data?.durationSeconds);
    const mode = sanitizeText(request.data?.mode, 'frame');
    const language = normalizeLanguage(request.data?.language);
    const sportContext = (request.data?.sportContext || {});
    const poseSnapshot = (request.data?.poseSnapshot || null);
    const history = Array.isArray(request.data?.history)
        ? request.data.history.slice(-6)
        : [];
    const currentFrame = request.data?.currentFrame
        ? request.data.currentFrame
        : null;
    const windowFrames = Array.isArray(request.data?.windowFrames)
        ? request.data.windowFrames.slice(0, MAX_QUERY_FRAMES)
        : [];
    if (!videoId || !message) {
        throw new HttpsError('invalid-argument', 'Faltan datos de la consulta.');
    }
    await validateTargetAccess(callerId, targetUserId);
    const contextRef = getContextRef(targetUserId, videoId);
    const contextSnap = await contextRef.get();
    const contextData = contextSnap.exists ? contextSnap.data() : {};
    const processingStatus = (contextData?.status || 'not_started');
    const segments = await readPersistedSegments(targetUserId, videoId);
    const keyMoments = Array.isArray(contextData?.keyMoments)
        ? contextData?.keyMoments
        : [];
    const tier = await getUserTier(callerId, request.auth.token.email);
    const modelName = resolveAllowedModelForTier(tier);
    const genAI = new GoogleGenerativeAI(geminiApiKey.value());
    let questionEmbedding = [];
    if (segments.some((segment) => Array.isArray(segment.embedding) && segment.embedding.length > 0)) {
        try {
            questionEmbedding = await embedText(genAI, message, TaskType.RETRIEVAL_QUERY);
        }
        catch (error) {
            console.warn('[askVideoQuestion] embedText fallback:', error);
        }
    }
    const ranked = rankSegmentsForQuestion({
        segments,
        questionEmbedding,
        activeTimeSeconds: currentTimeSeconds,
    });
    const relevantKeyMoments = pickKeyMomentsForQuestion({
        keyMoments,
        activeTimeSeconds: currentTimeSeconds,
    });
    const retrievalPayload = {
        processingStatus,
        globalSummary: sanitizeText(contextData?.globalSummary),
        globalTechnicalAssessment: sanitizeText(contextData?.globalTechnicalAssessment),
        timelineSummary: Array.isArray(contextData?.timelineSummary) ? contextData?.timelineSummary : [],
        activeSegment: ranked.activeSegment,
        adjacentSegments: ranked.adjacentSegments,
        semanticSegments: ranked.semanticSegments,
        keyMoments: relevantKeyMoments,
        currentTimeSeconds,
        mode,
        metadata: contextData?.metadata || null,
        poseSnapshot,
    };
    const prompt = buildVideoQuestionPrompt({
        language,
        sport: sportContext.sport,
        discipline: sportContext.discipline,
        question: message,
        currentTimeSeconds,
        mode,
        retrievalPayload,
        history,
        processingStatus,
    });
    const answerModel = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
            responseSchema: VIDEO_ANSWER_SCHEMA,
        },
    });
    const framesForPrompt = [
        ...(currentFrame ? [currentFrame] : []),
        ...windowFrames.filter((frame) => !currentFrame ||
            Math.abs(frame.timestampSeconds - currentFrame.timestampSeconds) > 0.001),
    ];
    const generation = await answerModel.generateContent(buildGenerationParts(prompt, framesForPrompt));
    const parsed = parseJsonResponse(generation.response.text());
    const structured = {
        momentOfGesture: sanitizeText(parsed.momentOfGesture, currentTimeSeconds !== null && currentTimeSeconds !== undefined
            ? `Instante ${currentTimeSeconds.toFixed(2)}s`
            : 'Resumen general del gesto'),
        phase: sanitizeText(parsed.phase, ranked.activeSegment?.phaseLabel || 'Fase no concluyente'),
        visibleObservations: ensureStringArray(parsed.visibleObservations),
        technicalEvaluation: ensureStringArray(parsed.technicalEvaluation),
        probableErrorsOrRisks: ensureStringArray(parsed.probableErrorsOrRisks),
        recommendations: ensureStringArray(parsed.recommendations),
        confidence: normalizeConfidence(parsed.confidence),
        visualLimitations: ensureStringArray(parsed.visualLimitations),
        probableInferences: ensureStringArray(parsed.probableInferences),
    };
    const trace = buildRetrievalTrace({
        processingStatus,
        mode,
        activeTimeSeconds: currentTimeSeconds,
        durationSeconds: durationSeconds || contextData?.metadata?.durationSeconds || null,
        activeSegment: ranked.activeSegment,
        adjacentSegments: ranked.adjacentSegments,
        semanticSegments: ranked.semanticSegments,
        keyMoments: relevantKeyMoments,
        hasWindowFrames: windowFrames.length > 0,
        hasCurrentFrame: !!currentFrame,
        hasChatHistory: history.length > 0,
        hasBiomechanicsRules: Boolean(sportContext.sport || sportContext.discipline),
        hasPoseSnapshot: Boolean(poseSnapshot),
    });
    trace.windowFrameTimestamps = windowFrames.map((frame) => frame.timestampSeconds);
    const answer = formatCompactStructuredAnswer(structured, language);
    const sessionsRef = getSessionsRef(targetUserId, videoId);
    const sessionRef = sessionId ? sessionsRef.doc(sessionId) : sessionsRef.doc();
    const userMessageRef = sessionRef.collection('messages').doc();
    const assistantMessageRef = sessionRef.collection('messages').doc();
    const batch = db.batch();
    batch.set(sessionRef, {
        videoId,
        userId: targetUserId,
        mode,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        lastQueriedTimestampSeconds: currentTimeSeconds,
        lastContextSummaryLabel: trace.contextSummaryLabel,
    }, { merge: true });
    batch.set(userMessageRef, {
        role: 'user',
        text: message,
        createdAt: FieldValue.serverTimestamp(),
        activeTimestampSeconds: currentTimeSeconds,
        mode,
    });
    batch.set(assistantMessageRef, {
        role: 'model',
        text: answer,
        createdAt: FieldValue.serverTimestamp(),
        activeTimestampSeconds: currentTimeSeconds,
        mode,
        structured,
        trace,
        modelName,
        processingStatus,
    });
    batch.set(contextRef, {
        updatedAt: FieldValue.serverTimestamp(),
        lastQuestionAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await batch.commit();
    return {
        sessionId: sessionRef.id,
        answer,
        structured,
        trace,
    };
});
