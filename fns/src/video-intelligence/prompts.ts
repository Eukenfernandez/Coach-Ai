import { Schema, SchemaType } from '@google/generative-ai';

export const VIDEO_CONTEXT_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    globalSummary: { type: SchemaType.STRING },
    globalTechnicalAssessment: { type: SchemaType.STRING },
    timelineSummary: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    segments: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          segmentId: { type: SchemaType.STRING },
          startTimeSeconds: { type: SchemaType.NUMBER },
          endTimeSeconds: { type: SchemaType.NUMBER },
          representativeTimeSeconds: { type: SchemaType.NUMBER },
          phaseLabel: { type: SchemaType.STRING },
          summary: { type: SchemaType.STRING },
          visibleObservations: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
          technicalFocus: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
          probableErrors: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
          coachingCues: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
          confidence: { type: SchemaType.STRING },
        },
        required: ['phaseLabel', 'summary', 'confidence'],
      },
    },
    keyMoments: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          timestampSeconds: { type: SchemaType.NUMBER },
          label: { type: SchemaType.STRING },
          note: { type: SchemaType.STRING },
          phaseLabel: { type: SchemaType.STRING },
          confidence: { type: SchemaType.STRING },
        },
        required: ['timestampSeconds', 'label', 'note', 'confidence'],
      },
    },
    recommendedQuestions: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
  },
  required: ['globalSummary', 'segments', 'keyMoments'],
};

export const VIDEO_ANSWER_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    momentOfGesture: { type: SchemaType.STRING },
    phase: { type: SchemaType.STRING },
    visibleObservations: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    technicalEvaluation: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    probableErrorsOrRisks: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    recommendations: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    confidence: { type: SchemaType.STRING },
    visualLimitations: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    probableInferences: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
  },
  required: [
    'momentOfGesture',
    'phase',
    'visibleObservations',
    'technicalEvaluation',
    'probableErrorsOrRisks',
    'recommendations',
    'confidence',
    'visualLimitations',
  ],
};

const languageLabels = {
  es: 'español',
  ing: 'English',
  eus: 'Euskara',
} as const;

export const buildVideoContextProcessingPrompt = ({
  language,
  sport,
  discipline,
  metadata,
  segments,
}: {
  language: 'es' | 'ing' | 'eus';
  sport?: string;
  discipline?: string;
  metadata: unknown;
  segments: unknown;
}) => `
You are an elite sports technique analyst building durable context for a coaching chatbot.

Critical rules:
- Reconstruct the movement timeline from the ordered sampled frames plus timestamps.
- Be conservative: sampled frames are sparse evidence, not continuous proof.
- Separate what is clearly visible from what is only probable.
- Prefer sport-technical language over generic coaching clichés.
- If the angle or sampling is insufficient, explicitly acknowledge that uncertainty.
- Output must be in ${languageLabels[language] || languageLabels.es}.

Athlete sport context:
${JSON.stringify({ sport: sport || '', discipline: discipline || '' }, null, 2)}

Video metadata:
${JSON.stringify(metadata, null, 2)}

Suggested temporal scaffold:
${JSON.stringify(segments, null, 2)}

Return a structured multimodal memory for future chat retrieval.
`;

export const buildVideoQuestionPrompt = ({
  language,
  sport,
  discipline,
  question,
  currentTimeSeconds,
  mode,
  retrievalPayload,
  history,
  processingStatus,
}: {
  language: 'es' | 'ing' | 'eus';
  sport?: string;
  discipline?: string;
  question: string;
  currentTimeSeconds?: number | null;
  mode: 'frame' | 'range' | 'summary';
  retrievalPayload: unknown;
  history: unknown;
  processingStatus: string;
}) => `
You are an expert sports biomechanical analyst answering a question about a video.

Response workflow:
1. Determine the temporal context and probable phase.
2. Describe only visible observations first.
3. Evaluate technique using the retrieved video memory plus the current visual window.
4. State probable errors or risks only when supported.
5. Give concise corrections.
6. State confidence and limitations explicitly.

Strict rules:
- Do not invent hidden body positions or contact details that are not visible.
- Distinguish "visible observation" from "probable inference".
- Do not confuse a transition posture with the final outcome of the action.
- If the processing context is partial (${processingStatus}), lower confidence accordingly.
- Avoid generic coaching filler.
- Keep the answer compact for an athlete reading in chat, not as a long report.
- Prioritize the 1-2 most important technical findings and the 1-2 most useful corrections.
- Do not repeat the same idea across visibleObservations, technicalEvaluation, probableErrorsOrRisks, and recommendations.
- Limit each array to a maximum of 2 short items.
- Output must be in ${languageLabels[language] || languageLabels.es}.

Sport context:
${JSON.stringify({ sport: sport || '', discipline: discipline || '' }, null, 2)}

Question mode: ${mode}
Active timestamp: ${currentTimeSeconds ?? null}

Retrieved contextual memory:
${JSON.stringify(retrievalPayload, null, 2)}

Recent chat history:
${JSON.stringify(history, null, 2)}

User question:
${question}
`;
