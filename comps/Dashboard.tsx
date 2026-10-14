
import React, { useMemo } from 'react';
import { VideoFile, StrengthRecord, ThrowRecord, Screen, UserProfile, Language, getMetricUnit, isTimeBased as checkTimeBased } from '../types';
import { Activity, TrendingUp, Video, Trophy, Target, CalendarRange, Timer } from 'lucide-react';
import { getTranslatedDiscipline, getTranslatedExercise } from '../utl/sportTranslations';
import { buildPerformanceChartData, getChartTimeRange, PerformancePoint } from '../utl/performanceChart';

interface DashboardProps {
  userProfile?: UserProfile;
  videos: VideoFile[];
  strengthRecords: StrengthRecord[];
  throwRecords: ThrowRecord[];
  trainingRecords: ThrowRecord[];
  onNavigate: (screen: Screen) => void;
  language: Language;
}

const TEXTS = {
  es: {
    hello: 'Hola',
    athlete: 'Atleta',
    summary: 'Resumen de tu rendimiento en',
    sport: 'tu deporte',
    best: 'MEJOR',
    videos: 'VÍDEOS',
    analyzed: 'analizados',
    strength: 'REGISTROS FUERZA',
    entries: 'entradas',
    progress: 'Progreso de Carrera',
    trend: 'Índice de rendimiento · 100 = referencia inicial',
    emptyGraph: 'Añade registros válidos para ver una evolución precisa.',
    comp: 'Competición',
    train: 'Entreno',
    force: 'Fuerza',
    start: 'INICIO',
    now: 'ÚLTIMO REGISTRO',
    time: 'TIEMPO',
    mark: 'MARCA'
  },
  ing: {
    hello: 'Hello',
    athlete: 'Athlete',
    summary: 'Performance summary in',
    sport: 'your sport',
    best: 'BEST',
    videos: 'VIDEOS',
    analyzed: 'analyzed',
    strength: 'STRENGTH LOGS',
    entries: 'entries',
    progress: 'Career Progress',
    trend: 'Performance index · 100 = initial reference',
    emptyGraph: 'Add valid records to see an accurate progression.',
    comp: 'Competition',
    train: 'Training',
    force: 'Strength',
    start: 'START',
    now: 'LATEST RECORD',
    time: 'TIME',
    mark: 'MARK'
  },
  eus: {
    hello: 'Kaixo',
    athlete: 'Atleta',
    summary: 'Zure errendimenduaren laburpena',
    sport: 'zure kirolean',
    best: 'ONENA',
    videos: 'BIDEOAK',
    analyzed: 'analizatuta',
    strength: 'INDAR ERREGISTROAK',
    entries: 'sarrera',
    progress: 'Karrera Aurrerapena',
    trend: 'Errendimendu-indizea · 100 = hasierako erreferentzia',
    emptyGraph: 'Gehitu baliozko erregistroak bilakaera zehatza ikusteko.',
    comp: 'Txapelketa',
    train: 'Entrenamendua',
    force: 'Indarra',
    start: 'HASIERA',
    now: 'AZKEN ERREGISTROA',
    time: 'DENBORA',
    mark: 'MARKA'
  }
};

export const Dashboard: React.FC<DashboardProps> = ({
  userProfile,
  videos,
  strengthRecords,
  throwRecords,
  trainingRecords,
  onNavigate,
  language
}) => {
  const t = TEXTS[language];

  // Determine metrics based on sport
  const discipline = userProfile?.discipline || '';
  const isTimeBased = Boolean(discipline.trim()) && checkTimeBased(discipline);
  const unit = getMetricUnit(discipline) || (isTimeBased ? 's' : 'm');
  const metricLabel = isTimeBased ? t.time : t.mark;

  // Best Record Logic (Min for time, Max for distance)
  const getBest = (records: ThrowRecord[]) => {
    if (records.length === 0) return 0;
    const values = records.map(r => r.distance);
    return isTimeBased ? Math.min(...values) : Math.max(...values);
  };

  const bestCompetition = getBest(throwRecords);
  const totalLifts = strengthRecords.length;
  const performanceChart = useMemo(() => buildPerformanceChartData({
    competitionRecords: throwRecords,
    trainingRecords,
    strengthRecords,
    lowerMetricIsBetter: isTimeBased,
  }), [isTimeBased, strengthRecords, throwRecords, trainingRecords]);
  const dateLocale = language === 'ing' ? 'en-US' : language === 'eus' ? 'eu-ES' : 'es-ES';
  const formatChartDate = (timestamp: number) => new Intl.DateTimeFormat(dateLocale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(timestamp));

  // --- Graph Data Logic ---
  const renderGlobalGraph = () => {
    const allPoints = [
      ...performanceChart.competition,
      ...performanceChart.training,
      ...performanceChart.strength,
    ];

    if (allPoints.length === 0) {
      return (
        <div className="h-48 md:h-64 flex flex-col items-center justify-center text-neutral-500 bg-neutral-100 dark:bg-neutral-900/50 rounded-2xl border border-neutral-200 dark:border-neutral-800 transition-colors">
          <TrendingUp size={32} className="mb-2 opacity-50" />
          <p className="text-sm">{t.emptyGraph}</p>
        </div>
      );
    }

    const width = 1000;
    const height = 300;
    const paddingX = 60;
    const paddingY = 34;
    const graphW = width - paddingX * 2;
    const graphH = height - paddingY * 2;
    const timeRange = getChartTimeRange(performanceChart.minTimestamp, performanceChart.maxTimestamp);
    const scoreRange = performanceChart.maxScore - performanceChart.minScore;

    const getX = (timestamp: number) => {
      if (performanceChart.maxTimestamp === performanceChart.minTimestamp) return width / 2;
      const percent = (timestamp - performanceChart.minTimestamp) / timeRange;
      return paddingX + percent * graphW;
    };

    const getY = (score: number) => {
      const normalized = scoreRange > 0
        ? (score - performanceChart.minScore) / scoreRange
        : 0.5;
      return height - paddingY - normalized * graphH;
    };

    const makePath = (points: PerformancePoint[]) => {
      if (points.length < 2) return '';
      return points.map((point, index) => (
        `${index === 0 ? 'M' : 'L'} ${getX(point.timestamp)} ${getY(point.score)}`
      )).join(' ');
    };

    const gridScores = Array.from(new Set([
      performanceChart.maxScore,
      100,
      performanceChart.minScore,
    ].map((score) => Number(score.toFixed(4))))).sort((a, b) => b - a);
    const formatRawValue = (value: number) => Number(value.toFixed(2)).toLocaleString(dateLocale);
    const getPointTitle = (point: PerformancePoint, label: string, rawUnit: string) => (
      `${label} · ${formatChartDate(point.timestamp)} · ${formatRawValue(point.rawValue)}${rawUnit ? ` ${rawUnit}` : ''} · índice ${point.score.toFixed(1)}`
    );
    const strengthLabel = performanceChart.strengthExercise
      ? `${t.force} · ${getTranslatedExercise(performanceChart.strengthExercise, language)}`
      : t.force;

    return (
      <div className="w-full overflow-hidden">
        <div className="w-full h-[200px] md:h-[300px] bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 relative shadow-sm dark:shadow-inner overflow-hidden transition-colors">
          {/* Legend Overlay */}
          <div className="absolute top-2 right-2 md:top-4 md:right-4 flex flex-col gap-1 md:gap-2 bg-white/80 dark:bg-neutral-950/80 p-2 md:p-3 rounded-lg md:rounded-xl border border-neutral-200 dark:border-neutral-800 backdrop-blur-sm z-10 text-[10px] md:text-xs">
            {performanceChart.competition.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 md:w-3 md:h-3 bg-orange-500 rounded-full border border-neutral-300 dark:border-black shadow-[0_0_8px_rgba(249,115,22,0.8)]"></div>
                <span className="text-neutral-700 dark:text-orange-200">{t.comp} · {unit}</span>
              </div>
            )}
            {performanceChart.training.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 md:w-3 md:h-3 bg-emerald-500 rounded-full border border-neutral-300 dark:border-black shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
                <span className="text-neutral-700 dark:text-emerald-200">{t.train} · {unit}</span>
              </div>
            )}
            {performanceChart.strength.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 md:w-3 md:h-3 bg-purple-500 rounded-full border border-neutral-300 dark:border-black shadow-[0_0_8px_rgba(168,85,247,0.8)]"></div>
                <span className="max-w-40 truncate text-neutral-700 dark:text-purple-200" title={strengthLabel}>{strengthLabel}</span>
              </div>
            )}
          </div>

          {/* SVG Content */}
          <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="absolute inset-0">
            {/* Grid Guides */}
            {gridScores.map((score) => (
              <line
                key={score}
                x1={paddingX}
                y1={getY(score)}
                x2={width - paddingX}
                y2={getY(score)}
                stroke="currentColor"
                strokeOpacity="0.1"
                strokeWidth="1"
                strokeDasharray="5,5"
                className="text-neutral-500"
              />
            ))}
            {performanceChart.minScore <= 100 && performanceChart.maxScore >= 100 && (
              <line x1={paddingX} y1={getY(100)} x2={width - paddingX} y2={getY(100)} stroke="#f97316" strokeOpacity="0.28" strokeWidth="1.5" strokeDasharray="8,5" />
            )}

            {/* Strength Layer */}
            <path d={makePath(performanceChart.strength)} fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70" />
            {performanceChart.strength.map((point) => (
              <circle key={`s-${point.dateKey}`} cx={getX(point.timestamp)} cy={getY(point.score)} r="4" fill="#a855f7" className="stroke-white dark:stroke-neutral-900 stroke-2">
                <title>{getPointTitle(point, strengthLabel, '')}</title>
              </circle>
            ))}

            {/* Training Layer */}
            <path d={makePath(performanceChart.training)} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-80" />
            {performanceChart.training.map((point) => (
              <circle key={`t-${point.dateKey}`} cx={getX(point.timestamp)} cy={getY(point.score)} r="4" fill="#10b981" className="stroke-white dark:stroke-neutral-900 stroke-2">
                <title>{getPointTitle(point, t.train, unit)}</title>
              </circle>
            ))}

            {/* Competition Layer (Top) */}
            <path d={makePath(performanceChart.competition)} fill="none" stroke="#f97316" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-[0_0_10px_rgba(249,115,22,0.5)]" />
            {performanceChart.competition.map((point) => (
              <circle key={`c-${point.dateKey}`} cx={getX(point.timestamp)} cy={getY(point.score)} r="6" fill="#f97316" className="stroke-white dark:stroke-white stroke-2 shadow-[0_0_10px_rgba(249,115,22,1)]">
                <title>{getPointTitle(point, t.comp, unit)}</title>
              </circle>
            ))}
          </svg>

          <div className="absolute inset-0 text-[9px] text-neutral-500 font-mono pointer-events-none">
            {gridScores.map((score) => (
              <span
                key={score}
                className={score === 100 ? 'text-orange-400/80' : ''}
                style={{ position: 'absolute', left: 8, top: `${(getY(score) / height) * 100}%`, transform: 'translateY(-50%)' }}
              >
                {score.toFixed(1)}
              </span>
            ))}
          </div>

          {/* Axis Label */}
          <div className="absolute bottom-1 left-2 md:bottom-2 md:left-4 text-[9px] md:text-[10px] text-neutral-500 font-mono">
            {formatChartDate(performanceChart.minTimestamp)}
          </div>
          <div className="absolute bottom-1 right-2 md:bottom-2 md:right-4 text-[9px] md:text-[10px] text-neutral-500 font-mono">
            {performanceChart.maxTimestamp > performanceChart.minTimestamp
              ? formatChartDate(performanceChart.maxTimestamp)
              : t.now}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-full bg-gray-50 dark:bg-neutral-950 overflow-y-auto transition-colors duration-300">
      {/* Main Content */}
      <div className="flex-1 p-4 md:p-10">
        <h1 className="text-2xl md:text-3xl font-bold text-neutral-900 dark:text-white mb-1">{t.hello}, {userProfile?.firstName || t.athlete} 👋</h1>
        <p className="text-sm md:text-base text-neutral-500 dark:text-neutral-400 mb-6 md:mb-8">{t.summary} {userProfile?.discipline ? getTranslatedDiscipline(userProfile.discipline, language) : t.sport}.</p>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-8 md:mb-10">

          {/* BEST RECORD CARD */}
          <div onClick={() => onNavigate('competition')} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-4 md:p-6 rounded-2xl hover:border-orange-500/50 transition-colors cursor-pointer group shadow-sm dark:shadow-none">
            <div className="flex justify-between items-start mb-3 md:mb-4">
              <div className="p-2 md:p-3 bg-orange-100 dark:bg-orange-500/10 rounded-lg text-orange-600 dark:text-orange-500 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                {isTimeBased ? <Timer size={20} className="md:w-6 md:h-6" /> : <Trophy size={20} className="md:w-6 md:h-6" />}
              </div>
              <span className="text-[10px] md:text-xs font-mono text-neutral-500 uppercase">{t.best} {metricLabel}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <p className="text-3xl md:text-4xl font-bold text-neutral-900 dark:text-white">{bestCompetition}</p>
              <span className="text-base md:text-lg text-neutral-500 font-normal">{unit}</span>
            </div>
          </div>

          {/* VIDEOS CARD */}
          <div onClick={() => onNavigate('gallery')} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-4 md:p-6 rounded-2xl hover:border-blue-500/50 transition-colors cursor-pointer group shadow-sm dark:shadow-none">
            <div className="flex justify-between items-start mb-3 md:mb-4">
              <div className="p-2 md:p-3 bg-blue-100 dark:bg-blue-500/10 rounded-lg text-blue-600 dark:text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                <Video size={20} className="md:w-6 md:h-6" />
              </div>
              <span className="text-[10px] md:text-xs font-mono text-neutral-500">{t.videos}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <p className="text-3xl md:text-4xl font-bold text-neutral-900 dark:text-white">{videos.length}</p>
              <span className="text-base md:text-lg text-neutral-500 font-normal">{t.analyzed}</span>
            </div>
          </div>

          {/* STRENGTH CARD */}
          <div onClick={() => onNavigate('strength')} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-4 md:p-6 rounded-2xl hover:border-purple-500/50 transition-colors cursor-pointer group shadow-sm dark:shadow-none">
            <div className="flex justify-between items-start mb-3 md:mb-4">
              <div className="p-2 md:p-3 bg-purple-100 dark:bg-purple-500/10 rounded-lg text-purple-600 dark:text-purple-500 group-hover:bg-purple-500 group-hover:text-white transition-colors">
                <Activity size={20} className="md:w-6 md:h-6" />
              </div>
              <span className="text-[10px] md:text-xs font-mono text-neutral-500">{t.strength}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <p className="text-3xl md:text-4xl font-bold text-neutral-900 dark:text-white">{totalLifts}</p>
              <span className="text-base md:text-lg text-neutral-500 font-normal">{t.entries}</span>
            </div>
          </div>
        </div>

        {/* Global Progression Chart */}
        <h3 className="text-lg md:text-xl font-bold text-neutral-900 dark:text-white mb-3 md:mb-4 flex items-center gap-2">
          <CalendarRange size={18} className="text-neutral-500 dark:text-neutral-400" />
          {t.progress}
          <span className="hidden md:inline text-xs font-normal text-neutral-500 bg-neutral-200 dark:bg-neutral-900 px-2 py-1 rounded ml-2">{t.trend}</span>
        </h3>
        <div className="mb-10">
          {renderGlobalGraph()}
        </div>
      </div>

      {/* Copyright - Pushed to the absolute bottom */}
      <div className="mt-auto py-4 text-center flex items-center justify-center gap-2 border-t border-neutral-200 dark:border-neutral-800">
        <div className="w-4 h-4 bg-orange-600 rounded flex items-center justify-center">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </div>
        <span className="text-[10px] text-neutral-400 dark:text-neutral-600">© 2025 Coach AI. All rights reserved.</span>
      </div>
    </div>
  );
};
