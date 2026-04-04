export type ConfidenceLevel = 'low' | 'medium' | 'high';
export type VideoContextStatus =
  | 'not_started'
  | 'queued'
  | 'sampling'
  | 'summarizing'
  | 'partial'
  | 'ready'
  | 'failed';

export type VideoQuestionMode = 'frame' | 'range' | 'summary';

export type VideoContextSource =
  | 'global_summary'
  | 'active_segment'
  | 'adjacent_segments'
  | 'semantic_segments'
  | 'key_moments'
  | 'current_frame'
  | 'window_frames'
  | 'chat_history'
  | 'biomechanics_rules'
  | 'pose_snapshot'
  | 'fallback_only';

export interface PersistedSegment {
  id: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  representativeTimeSeconds: number;
  phaseLabel: string;
  summary: string;
  visibleObservations: string[];
  technicalFocus: string[];
  probableErrors: string[];
  coachingCues: string[];
  confidence: ConfidenceLevel;
  embedding?: number[];
}

export interface PersistedKeyMoment {
  id: string;
  timestampSeconds: number;
  label: string;
  note: string;
  phaseLabel?: string;
  confidence: ConfidenceLevel;
}

export interface StructuredVideoAnswer {
  momentOfGesture: string;
  phase: string;
  visibleObservations: string[];
  technicalEvaluation: string[];
  probableErrorsOrRisks: string[];
  recommendations: string[];
  confidence: ConfidenceLevel;
  visualLimitations: string[];
  probableInferences?: string[];
}

export interface VideoResponseTrace {
  processingStatus: VideoContextStatus;
  activeTimestampSeconds?: number | null;
  windowRangeSeconds?: { start: number; end: number } | null;
  windowFrameTimestamps?: number[];
  activeSegmentId?: string | null;
  adjacentSegmentIds?: string[];
  semanticSegmentIds?: string[];
  keyMomentIds?: string[];
  contextSources: VideoContextSource[];
  contextSummaryLabel: string;
}

export interface RankedRetrieval {
  activeSegment: PersistedSegment | null;
  adjacentSegments: PersistedSegment[];
  semanticSegments: PersistedSegment[];
  keyMoments: PersistedKeyMoment[];
}

const roundSeconds = (value: number) => Number(value.toFixed(3));

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const buildWindowRange = (
  activeTimeSeconds: number | null | undefined,
  durationSeconds: number | null | undefined,
  mode: VideoQuestionMode,
) => {
  if (activeTimeSeconds === null || activeTimeSeconds === undefined) return null;
  const duration = durationSeconds && durationSeconds > 0 ? durationSeconds : activeTimeSeconds;
  const halfWindow = mode === 'range' ? 1.2 : 0.8;
  return {
    start: roundSeconds(clamp(activeTimeSeconds - halfWindow, 0, duration)),
    end: roundSeconds(clamp(activeTimeSeconds + halfWindow, 0, duration)),
  };
};

export const cosineSimilarity = (left?: number[] | null, right?: number[] | null) => {
  if (!left || !right || left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dotProduct = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < left.length; index += 1) {
    dotProduct += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }

  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dotProduct / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
};

const timeProximityScore = (segment: PersistedSegment, activeTimeSeconds?: number | null) => {
  if (activeTimeSeconds === null || activeTimeSeconds === undefined) return 0;
  if (activeTimeSeconds >= segment.startTimeSeconds && activeTimeSeconds <= segment.endTimeSeconds) {
    return 1;
  }
  const distance = Math.min(
    Math.abs(activeTimeSeconds - segment.startTimeSeconds),
    Math.abs(activeTimeSeconds - segment.endTimeSeconds),
  );
  return 1 / (1 + distance * 2);
};

export const rankSegmentsForQuestion = ({
  segments,
  questionEmbedding,
  activeTimeSeconds,
}: {
  segments: PersistedSegment[];
  questionEmbedding?: number[] | null;
  activeTimeSeconds?: number | null;
}) => {
  const activeSegment =
    activeTimeSeconds === null || activeTimeSeconds === undefined
      ? null
      : segments.find(
          (segment) =>
            activeTimeSeconds >= segment.startTimeSeconds && activeTimeSeconds <= segment.endTimeSeconds,
        ) || null;

  const activeIndex = activeSegment ? segments.findIndex((segment) => segment.id === activeSegment.id) : -1;
  const adjacentSegments =
    activeIndex >= 0
      ? segments.filter((_, index) => index === activeIndex - 1 || index === activeIndex + 1)
      : [];

  const semanticSegments = [...segments]
    .map((segment) => {
      const semanticScore = cosineSimilarity(segment.embedding, questionEmbedding);
      const temporalScore = timeProximityScore(segment, activeTimeSeconds);
      const blendedScore = semanticScore * 0.65 + temporalScore * 0.35;
      return { segment, blendedScore };
    })
    .sort((left, right) => right.blendedScore - left.blendedScore)
    .map((item) => item.segment)
    .filter((segment) => !activeSegment || segment.id !== activeSegment.id)
    .slice(0, 2);

  return { activeSegment, adjacentSegments, semanticSegments };
};

export const pickKeyMomentsForQuestion = ({
  keyMoments,
  activeTimeSeconds,
}: {
  keyMoments: PersistedKeyMoment[];
  activeTimeSeconds?: number | null;
}) => {
  if (keyMoments.length === 0) return [];
  if (activeTimeSeconds === null || activeTimeSeconds === undefined) {
    return keyMoments.slice(0, 3);
  }

  return [...keyMoments]
    .sort(
      (left, right) =>
        Math.abs(left.timestampSeconds - activeTimeSeconds) - Math.abs(right.timestampSeconds - activeTimeSeconds),
    )
    .slice(0, 3);
};

export const buildRetrievalTrace = ({
  processingStatus,
  mode,
  activeTimeSeconds,
  durationSeconds,
  activeSegment,
  adjacentSegments,
  semanticSegments,
  keyMoments,
  hasWindowFrames,
  hasCurrentFrame,
  hasChatHistory,
  hasBiomechanicsRules,
  hasPoseSnapshot,
}: {
  processingStatus: VideoContextStatus;
  mode: VideoQuestionMode;
  activeTimeSeconds?: number | null;
  durationSeconds?: number | null;
  activeSegment: PersistedSegment | null;
  adjacentSegments: PersistedSegment[];
  semanticSegments: PersistedSegment[];
  keyMoments: PersistedKeyMoment[];
  hasWindowFrames: boolean;
  hasCurrentFrame: boolean;
  hasChatHistory: boolean;
  hasBiomechanicsRules: boolean;
  hasPoseSnapshot: boolean;
}): VideoResponseTrace => {
  const contextSources: VideoContextSource[] = ['global_summary'];
  if (activeSegment) contextSources.push('active_segment');
  if (adjacentSegments.length > 0) contextSources.push('adjacent_segments');
  if (semanticSegments.length > 0) contextSources.push('semantic_segments');
  if (keyMoments.length > 0) contextSources.push('key_moments');
  if (hasCurrentFrame) contextSources.push('current_frame');
  if (hasWindowFrames && mode !== 'summary') contextSources.push('window_frames');
  if (hasChatHistory) contextSources.push('chat_history');
  if (hasBiomechanicsRules) contextSources.push('biomechanics_rules');
  if (hasPoseSnapshot) contextSources.push('pose_snapshot');
  if (contextSources.length === 1 && contextSources[0] === 'global_summary') {
    contextSources.push('fallback_only');
  }

  const label = summarizeContextSources(contextSources);
  const windowRangeSeconds = buildWindowRange(activeTimeSeconds, durationSeconds, mode);

  return {
    processingStatus,
    activeTimestampSeconds: activeTimeSeconds ?? null,
    windowRangeSeconds,
    windowFrameTimestamps:
      windowRangeSeconds && mode !== 'summary'
        ? [windowRangeSeconds.start, roundSeconds((windowRangeSeconds.start + windowRangeSeconds.end) / 2), windowRangeSeconds.end]
        : [],
    activeSegmentId: activeSegment?.id || null,
    adjacentSegmentIds: adjacentSegments.map((segment) => segment.id),
    semanticSegmentIds: semanticSegments.map((segment) => segment.id),
    keyMomentIds: keyMoments.map((moment) => moment.id),
    contextSources,
    contextSummaryLabel: label,
  };
};

export const summarizeContextSources = (sources: VideoContextSource[]) => {
  const labels: string[] = [];
  if (sources.includes('global_summary')) labels.push('resumen global');
  if (sources.includes('active_segment')) labels.push('segmento activo');
  if (sources.includes('adjacent_segments')) labels.push('tramo anterior/posterior');
  if (sources.includes('semantic_segments')) labels.push('segmentos semánticos');
  if (sources.includes('current_frame')) labels.push('frame actual');
  if (sources.includes('window_frames')) labels.push('ventana temporal');
  if (sources.includes('key_moments')) labels.push('momentos clave');
  if (sources.includes('pose_snapshot')) labels.push('pose snapshot');
  return labels.join(' + ');
};

const sectionTitles = {
  es: {
    moment: 'Momento del gesto',
    observations: 'Qué se observa',
    evaluation: 'Evaluación técnica',
    risks: 'Posibles errores o riesgos',
    recommendations: 'Qué mejoraría',
    confidence: 'Nivel de confianza',
    limitations: 'Nota sobre limitaciones visuales',
    inferences: 'Deducciones probables',
  },
  ing: {
    moment: 'Moment of the action',
    observations: 'What is visible',
    evaluation: 'Technical evaluation',
    risks: 'Possible errors or risks',
    recommendations: 'What to improve',
    confidence: 'Confidence level',
    limitations: 'Visual limitations',
    inferences: 'Probable inferences',
  },
  eus: {
    moment: 'Keinuaren unea',
    observations: 'Zer ikusten da',
    evaluation: 'Ebaluazio teknikoa',
    risks: 'Akats edo arrisku posibleak',
    recommendations: 'Zer hobetuko nuke',
    confidence: 'Konfiantza maila',
    limitations: 'Muga bisualen oharra',
    inferences: 'Ondorio probableak',
  },
} as const;

const pushList = (lines: string[], items?: string[]) => {
  if (!items || items.length === 0) {
    lines.push('- No hay evidencia suficiente para ser más específico.');
    return;
  }

  items.forEach((item) => lines.push(`- ${item}`));
};

export const formatStructuredAnswer = (
  structured: StructuredVideoAnswer,
  language: 'es' | 'ing' | 'eus',
) => {
  const titles = sectionTitles[language] || sectionTitles.es;
  const lines: string[] = [];

  lines.push(`${titles.moment}`);
  lines.push(`${structured.momentOfGesture} (${structured.phase})`);
  lines.push('');
  lines.push(`${titles.observations}`);
  pushList(lines, structured.visibleObservations);
  lines.push('');
  lines.push(`${titles.evaluation}`);
  pushList(lines, structured.technicalEvaluation);
  lines.push('');
  lines.push(`${titles.risks}`);
  pushList(lines, structured.probableErrorsOrRisks);
  lines.push('');
  lines.push(`${titles.recommendations}`);
  pushList(lines, structured.recommendations);
  if (structured.probableInferences && structured.probableInferences.length > 0) {
    lines.push('');
    lines.push(`${titles.inferences}`);
    pushList(lines, structured.probableInferences);
  }
  lines.push('');
  lines.push(`${titles.confidence}`);
  lines.push(`- ${structured.confidence}`);
  lines.push('');
  lines.push(`${titles.limitations}`);
  pushList(lines, structured.visualLimitations);

  return lines.join('\n');
};

const normalizeCompactAnswerText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const areCompactIdeasSimilar = (left: string, right: string) => {
  const normalizedLeft = normalizeCompactAnswerText(left);
  const normalizedRight = normalizeCompactAnswerText(right);

  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) return true;

  const leftTokens = new Set(normalizedLeft.split(' ').filter((token) => token.length > 2));
  const rightTokens = new Set(normalizedRight.split(' ').filter((token) => token.length > 2));
  if (leftTokens.size === 0 || rightTokens.size === 0) return false;

  let overlap = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) overlap += 1;
  });

  return overlap / Math.min(leftTokens.size, rightTokens.size) >= 0.7;
};

const dedupeCompactIdeas = (items: string[], limit: number, blocked: string[] = []) => {
  const selected: string[] = [];

  items
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      if (selected.length >= limit) return;
      if (blocked.some((candidate) => areCompactIdeasSimilar(candidate, item))) return;
      if (selected.some((candidate) => areCompactIdeasSimilar(candidate, item))) return;
      selected.push(item);
    });

  return selected;
};

const joinCompactIdeas = (items: string[]) => items.join('; ');

const isCompactMeaningfulLimitation = (item: string) => {
  const normalized = normalizeCompactAnswerText(item);
  if (!normalized) return false;

  return !(
    normalized.includes('sin limitaciones') ||
    normalized.includes('no relevant limitations') ||
    normalized.includes('no hay limitaciones')
  );
};

export const formatCompactStructuredAnswer = (
  structured: StructuredVideoAnswer,
  language: 'es' | 'ing' | 'eus',
) => {
  const observations = dedupeCompactIdeas(structured.visibleObservations || [], 2);
  const technicalPoints = dedupeCompactIdeas(
    [...(structured.technicalEvaluation || []), ...(structured.probableErrorsOrRisks || [])],
    2,
    observations,
  );
  const recommendations = dedupeCompactIdeas(structured.recommendations || [], 2, [
    ...observations,
    ...technicalPoints,
  ]);
  const inferences = dedupeCompactIdeas(structured.probableInferences || [], 1, [
    ...observations,
    ...technicalPoints,
    ...recommendations,
  ]);
  const limitation = dedupeCompactIdeas(
    (structured.visualLimitations || []).filter(isCompactMeaningfulLimitation),
    1,
  )[0];

  if (language === 'ing') {
    const lines: string[] = [`${structured.momentOfGesture} (${structured.phase}).`];
    if (observations.length > 0) lines.push(`Visible: ${joinCompactIdeas(observations)}.`);
    if (technicalPoints.length > 0) lines.push(`Key point: ${joinCompactIdeas(technicalPoints)}.`);
    if (recommendations.length > 0) lines.push(`Main adjustment: ${joinCompactIdeas(recommendations)}.`);
    if (inferences.length > 0 && structured.confidence !== 'high') {
      lines.push(`Probable inference: ${joinCompactIdeas(inferences)}.`);
    }
    if (limitation && structured.confidence !== 'high') {
      lines.push(`Visual limitation: ${limitation}.`);
    }
    return lines.join('\n\n');
  }

  if (language === 'eus') {
    const lines: string[] = [`${structured.momentOfGesture} (${structured.phase}).`];
    if (observations.length > 0) lines.push(`Ikusten dena: ${joinCompactIdeas(observations)}.`);
    if (technicalPoints.length > 0) lines.push(`Gako teknikoa: ${joinCompactIdeas(technicalPoints)}.`);
    if (recommendations.length > 0) lines.push(`Doikuntza nagusia: ${joinCompactIdeas(recommendations)}.`);
    if (inferences.length > 0 && structured.confidence !== 'high') {
      lines.push(`Ondorio probablea: ${joinCompactIdeas(inferences)}.`);
    }
    if (limitation && structured.confidence !== 'high') {
      lines.push(`Muga bisuala: ${limitation}.`);
    }
    return lines.join('\n\n');
  }

  const lines: string[] = [`${structured.momentOfGesture} (${structured.phase}).`];
  if (observations.length > 0) lines.push(`Se ve: ${joinCompactIdeas(observations)}.`);
  if (technicalPoints.length > 0) lines.push(`Clave técnica: ${joinCompactIdeas(technicalPoints)}.`);
  if (recommendations.length > 0) lines.push(`Ajuste principal: ${joinCompactIdeas(recommendations)}.`);
  if (inferences.length > 0 && structured.confidence !== 'high') {
    lines.push(`Inferencia probable: ${joinCompactIdeas(inferences)}.`);
  }
  if (limitation && structured.confidence !== 'high') {
    lines.push(`Límite visual: ${limitation}.`);
  }

  return lines.join('\n\n');
};
