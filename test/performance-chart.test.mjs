import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPerformanceChartData,
  parsePerformanceDate,
} from '../utl/performanceChart.ts';

test('parses ISO and legacy Spanish dates without Safari ambiguity', () => {
  assert.equal(
    new Date(parsePerformanceDate('2026-08-03')).toISOString(),
    '2026-08-03T00:00:00.000Z',
  );
  assert.equal(
    new Date(parsePerformanceDate('12/7/2025')).toISOString(),
    '2025-07-12T00:00:00.000Z',
  );
  assert.equal(parsePerformanceDate('31/02/2026'), null);
});

test('competition and training share one baseline and are sorted chronologically', () => {
  const chart = buildPerformanceChartData({
    competitionRecords: [
      { id: 'late', date: '01/02/2026', location: 'B', distance: 12 },
      { id: 'first', date: '01/01/2026', location: 'A', distance: 10 },
    ],
    trainingRecords: [
      { id: 'training', date: '15/01/2026', location: 'T', distance: 11 },
    ],
    strengthRecords: [],
    lowerMetricIsBetter: false,
  });

  assert.deepEqual(chart.competition.map((point) => point.dateKey), ['2026-01-01', '2026-02-01']);
  assert.deepEqual(chart.competition.map((point) => point.score), [100, 120]);
  assert.ok(Math.abs(chart.training[0].score - 110) < 0.000001);
});

test('time-based performance rises when the recorded time falls', () => {
  const chart = buildPerformanceChartData({
    competitionRecords: [
      { id: 'one', date: '2026-01-01', location: 'A', distance: 10 },
      { id: 'two', date: '2026-02-01', location: 'B', distance: 9 },
    ],
    trainingRecords: [],
    strengthRecords: [],
    lowerMetricIsBetter: true,
  });

  assert.equal(chart.competition[0].score, 100);
  assert.ok(chart.competition[1].score > 111 && chart.competition[1].score < 112);
});

test('strength trend uses the most consistently tracked exercise only', () => {
  const chart = buildPerformanceChartData({
    competitionRecords: [],
    trainingRecords: [],
    strengthRecords: [
      { id: 's1', date: '2026-01-01', exercise: 'Sentadilla', weight: 100 },
      { id: 'p1', date: '2026-01-05', exercise: 'Press Banca', weight: 80 },
      { id: 's2', date: '2026-02-01', exercise: 'Sentadilla', weight: 110 },
    ],
    lowerMetricIsBetter: false,
  });

  assert.equal(chart.strengthExercise, 'Sentadilla');
  assert.equal(chart.strength[0].score, 100);
  assert.ok(Math.abs(chart.strength[1].score - 110) < 0.000001);
});

test('invalid dates and non-positive values cannot distort the graph', () => {
  const chart = buildPerformanceChartData({
    competitionRecords: [
      { id: 'bad-date', date: 'not-a-date', location: 'A', distance: 99 },
      { id: 'bad-value', date: '2026-01-01', location: 'B', distance: 0 },
      { id: 'valid', date: '2026-01-02', location: 'C', distance: 50 },
    ],
    trainingRecords: [],
    strengthRecords: [],
    lowerMetricIsBetter: false,
  });

  assert.equal(chart.competition.length, 1);
  assert.equal(chart.competition[0].rawValue, 50);
  assert.equal(chart.competition[0].score, 100);
});
