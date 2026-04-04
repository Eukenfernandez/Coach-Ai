import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRetrievalTrace,
  buildWindowRange,
  cosineSimilarity,
  formatStructuredAnswer,
  pickKeyMomentsForQuestion,
  rankSegmentsForQuestion,
} from '../lib/video-intelligence/core.js';

const segments = [
  {
    id: 'approach',
    startTimeSeconds: 0,
    endTimeSeconds: 1.2,
    representativeTimeSeconds: 0.6,
    phaseLabel: 'Approach',
    summary: 'Athlete accelerates with stable posture.',
    visibleObservations: ['Stable trunk'],
    technicalFocus: ['Cadence'],
    probableErrors: [],
    coachingCues: ['Stay tall'],
    confidence: 'high',
    embedding: [1, 0, 0],
  },
  {
    id: 'impulse',
    startTimeSeconds: 1.2,
    endTimeSeconds: 2.2,
    representativeTimeSeconds: 1.7,
    phaseLabel: 'Impulse stride',
    summary: 'Hip leads while the throw arm stays long.',
    visibleObservations: ['Hip leads shoulder'],
    technicalFocus: ['Hip-shoulder separation'],
    probableErrors: ['Front side opens early'],
    coachingCues: ['Delay the arm'],
    confidence: 'high',
    embedding: [0, 1, 0],
  },
  {
    id: 'delivery',
    startTimeSeconds: 2.2,
    endTimeSeconds: 3,
    representativeTimeSeconds: 2.6,
    phaseLabel: 'Delivery',
    summary: 'Block leg braces and the implement is projected forward.',
    visibleObservations: ['Rigid block'],
    technicalFocus: ['Block timing'],
    probableErrors: ['Late block'],
    coachingCues: ['Brace the front side'],
    confidence: 'medium',
    embedding: [0, 0, 1],
  },
];

const keyMoments = [
  { id: 'm1', timestampSeconds: 0.7, label: 'Run-up', note: 'Rhythm builds.', confidence: 'medium' },
  { id: 'm2', timestampSeconds: 1.75, label: 'Impulse', note: 'Hip leads the action.', confidence: 'high' },
  { id: 'm3', timestampSeconds: 2.55, label: 'Block', note: 'Front side braces.', confidence: 'high' },
];

test('cosine similarity returns 1 for identical vectors', () => {
  assert.equal(Number(cosineSimilarity([1, 2, 3], [1, 2, 3]).toFixed(6)), 1);
});

test('rankSegmentsForQuestion prioritizes active and semantically aligned segments', () => {
  const ranked = rankSegmentsForQuestion({
    segments,
    questionEmbedding: [0, 1, 0],
    activeTimeSeconds: 1.8,
  });

  assert.equal(ranked.activeSegment?.id, 'impulse');
  assert.deepEqual(ranked.adjacentSegments.map((segment) => segment.id), ['approach', 'delivery']);
  assert.equal(ranked.semanticSegments[0]?.id, 'delivery');
});

test('window range is clamped around the active timestamp', () => {
  assert.deepEqual(buildWindowRange(0.2, 3, 'frame'), { start: 0, end: 1 });
  assert.deepEqual(buildWindowRange(2.8, 3, 'range'), { start: 1.6, end: 3 });
});

test('key moment picker returns the closest moments to the timestamp', () => {
  const selected = pickKeyMomentsForQuestion({
    keyMoments,
    activeTimeSeconds: 1.8,
  });

  assert.deepEqual(selected.map((moment) => moment.id), ['m2', 'm3', 'm1']);
});

test('retrieval trace exposes the active segment and context sources', () => {
  const trace = buildRetrievalTrace({
    processingStatus: 'ready',
    mode: 'frame',
    activeTimeSeconds: 1.8,
    durationSeconds: 3,
    activeSegment: segments[1],
    adjacentSegments: [segments[0], segments[2]],
    semanticSegments: [segments[2]],
    keyMoments: [keyMoments[1]],
    hasWindowFrames: true,
    hasCurrentFrame: true,
    hasChatHistory: true,
    hasBiomechanicsRules: true,
    hasPoseSnapshot: false,
  });

  assert.equal(trace.activeSegmentId, 'impulse');
  assert.deepEqual(trace.adjacentSegmentIds, ['approach', 'delivery']);
  assert.ok(trace.contextSources.includes('window_frames'));
  assert.ok(trace.contextSummaryLabel.includes('frame'));
});

test('structured answer formatter preserves the required sections', () => {
  const text = formatStructuredAnswer({
    momentOfGesture: 'Pre-release instant',
    phase: 'Impulse stride',
    visibleObservations: ['Hip is entering before the shoulder.'],
    technicalEvaluation: ['This supports a better proximal-to-distal sequence.'],
    probableErrorsOrRisks: ['Front side could still open slightly early.'],
    recommendations: ['Keep the throwing arm back a fraction longer.'],
    confidence: 'medium',
    visualLimitations: ['Single camera angle hides the left foot contact details.'],
    probableInferences: ['Timing looks close to the delivery transition.'],
  }, 'ing');

  assert.match(text, /Moment of the action/);
  assert.match(text, /What is visible/);
  assert.match(text, /Technical evaluation/);
  assert.match(text, /Visual limitations/);
});
