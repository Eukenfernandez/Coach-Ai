import type { StrengthRecord, ThrowRecord } from '../types';

export type PerformancePoint = {
  timestamp: number;
  dateKey: string;
  rawValue: number;
  score: number;
};

export type PerformanceChartData = {
  competition: PerformancePoint[];
  training: PerformancePoint[];
  strength: PerformancePoint[];
  strengthExercise: string | null;
  minTimestamp: number;
  maxTimestamp: number;
  minScore: number;
  maxScore: number;
};

type DatedValue = {
  timestamp: number;
  dateKey: string;
  rawValue: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const buildUtcDate = (year: number, month: number, day: number): number | null => {
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return timestamp;
};

export const parsePerformanceDate = (value: unknown): number | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;

  const isoDate = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|T)/);
  if (isoDate) {
    if (normalized.includes('T')) {
      const timestamp = Date.parse(normalized);
      return Number.isFinite(timestamp) ? timestamp : null;
    }
    return buildUtcDate(Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3]));
  }

  // Legacy records were stored using the Spanish day/month/year format.
  // Parsing the components explicitly avoids Safari treating them as US dates.
  const dayFirstDate = normalized.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (dayFirstDate) {
    return buildUtcDate(Number(dayFirstDate[3]), Number(dayFirstDate[2]), Number(dayFirstDate[1]));
  }

  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const toDateKey = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

const normalizeRecords = <T>(
  records: T[],
  getDate: (record: T) => unknown,
  getValue: (record: T) => unknown,
): DatedValue[] => records
  .map((record) => {
    const timestamp = parsePerformanceDate(getDate(record));
    const rawValue = Number(getValue(record));
    if (timestamp === null || !Number.isFinite(rawValue) || rawValue <= 0) return null;
    return { timestamp, dateKey: toDateKey(timestamp), rawValue };
  })
  .filter((record): record is DatedValue => record !== null)
  .sort((a, b) => a.timestamp - b.timestamp);

const averageByDay = (records: DatedValue[]): DatedValue[] => {
  const grouped = new Map<string, { timestamp: number; values: number[] }>();
  records.forEach((record) => {
    const existing = grouped.get(record.dateKey);
    if (existing) {
      existing.values.push(record.rawValue);
    } else {
      grouped.set(record.dateKey, { timestamp: record.timestamp, values: [record.rawValue] });
    }
  });

  return Array.from(grouped.entries())
    .map(([dateKey, group]) => ({
      timestamp: group.timestamp,
      dateKey,
      rawValue: group.values.reduce((sum, value) => sum + value, 0) / group.values.length,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
};

const toPerformanceScore = (value: number, baseline: number, lowerIsBetter: boolean) => (
  lowerIsBetter ? (baseline / value) * 100 : (value / baseline) * 100
);

const scoreRecords = (
  records: DatedValue[],
  baseline: number,
  lowerIsBetter: boolean,
): PerformancePoint[] => records.map((record) => ({
  ...record,
  score: toPerformanceScore(record.rawValue, baseline, lowerIsBetter),
}));

const findSharedMetricBaseline = (competition: DatedValue[], training: DatedValue[]) => {
  const combined = [...competition, ...training].sort((a, b) => a.timestamp - b.timestamp);
  if (combined.length === 0) return null;
  const firstDateKey = combined[0].dateKey;
  const firstDayValues = combined
    .filter((record) => record.dateKey === firstDateKey)
    .map((record) => record.rawValue);
  return firstDayValues.reduce((sum, value) => sum + value, 0) / firstDayValues.length;
};

const selectStrengthExercise = (records: StrengthRecord[]) => {
  const candidates = new Map<string, { name: string; count: number; firstTimestamp: number }>();
  records.forEach((record) => {
    const name = String(record.exercise || '').trim();
    const timestamp = parsePerformanceDate(record.date);
    const value = Number(record.weight);
    if (!name || timestamp === null || !Number.isFinite(value) || value <= 0) return;

    const key = name.toLocaleLowerCase();
    const existing = candidates.get(key);
    if (existing) {
      existing.count += 1;
      existing.firstTimestamp = Math.min(existing.firstTimestamp, timestamp);
    } else {
      candidates.set(key, { name, count: 1, firstTimestamp: timestamp });
    }
  });

  return Array.from(candidates.values()).sort((a, b) => (
    b.count - a.count
    || a.firstTimestamp - b.firstTimestamp
    || a.name.localeCompare(b.name)
  ))[0]?.name || null;
};

export const buildPerformanceChartData = ({
  competitionRecords,
  trainingRecords,
  strengthRecords,
  lowerMetricIsBetter,
}: {
  competitionRecords: ThrowRecord[];
  trainingRecords: ThrowRecord[];
  strengthRecords: StrengthRecord[];
  lowerMetricIsBetter: boolean;
}): PerformanceChartData => {
  const competitionRaw = averageByDay(normalizeRecords(
    competitionRecords,
    (record) => record.date,
    (record) => record.distance,
  ));
  const trainingRaw = averageByDay(normalizeRecords(
    trainingRecords,
    (record) => record.date,
    (record) => record.distance,
  ));
  const metricBaseline = findSharedMetricBaseline(competitionRaw, trainingRaw);

  const competition = metricBaseline
    ? scoreRecords(competitionRaw, metricBaseline, lowerMetricIsBetter)
    : [];
  const training = metricBaseline
    ? scoreRecords(trainingRaw, metricBaseline, lowerMetricIsBetter)
    : [];

  const strengthExercise = selectStrengthExercise(strengthRecords);
  const normalizedStrengthExercise = strengthExercise?.toLocaleLowerCase() || '';
  const strengthRaw = strengthExercise
    ? averageByDay(normalizeRecords(
        strengthRecords.filter((record) => String(record.exercise || '').trim().toLocaleLowerCase() === normalizedStrengthExercise),
        (record) => record.date,
        (record) => record.weight,
      ))
    : [];
  const strength = strengthRaw.length > 0
    ? scoreRecords(strengthRaw, strengthRaw[0].rawValue, false)
    : [];

  const allPoints = [...competition, ...training, ...strength];
  if (allPoints.length === 0) {
    return {
      competition,
      training,
      strength,
      strengthExercise,
      minTimestamp: 0,
      maxTimestamp: 0,
      minScore: 95,
      maxScore: 105,
    };
  }

  const timestamps = allPoints.map((point) => point.timestamp);
  const scores = allPoints.map((point) => point.score).filter(Number.isFinite);
  const rawMinScore = Math.min(...scores, 100);
  const rawMaxScore = Math.max(...scores, 100);
  const scoreRange = rawMaxScore - rawMinScore;
  const scorePadding = scoreRange === 0 ? 5 : Math.max(2, scoreRange * 0.15);

  return {
    competition,
    training,
    strength,
    strengthExercise,
    minTimestamp: Math.min(...timestamps),
    maxTimestamp: Math.max(...timestamps),
    minScore: Math.max(0, rawMinScore - scorePadding),
    maxScore: rawMaxScore + scorePadding,
  };
};

export const getChartTimeRange = (minTimestamp: number, maxTimestamp: number) => (
  maxTimestamp > minTimestamp ? maxTimestamp - minTimestamp : DAY_MS
);
