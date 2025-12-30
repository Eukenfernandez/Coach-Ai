
import React from 'react';
import { VideoFile, StrengthRecord, ThrowRecord, Screen, UserProfile, Language } from '../types';
import { Activity, TrendingUp, Video, Trophy, Target, CalendarRange, Timer } from 'lucide-react';

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
    trend: 'Tendencia Normalizada',
    emptyGraph: 'Añade registros para ver tu evolución global.',
    comp: 'Competición',
    train: 'Entreno',
    force: 'Fuerza',
    start: 'INICIO',
    now: 'ACTUALIDAD',
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
    trend: 'Normalized Trend',
    emptyGraph: 'Add records to see global evolution.',
    comp: 'Competition',
    train: 'Training',
    force: 'Strength',
    start: 'START',
    now: 'NOW',
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
    trend: 'Joera Normalizatua',
    emptyGraph: 'Gehitu erregistroak bilakaera ikusteko.',
    comp: 'Txapelketa',
    train: 'Entrenamendua',
    force: 'Indarra',
    start: 'HASIERA',
    now: 'ORAINA',
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
  const isTimeBased = userProfile?.sport === 'sprint' || userProfile?.sport === 'middle_distance';
  const unit = isTimeBased ? 's' : 'm';
  const metricLabel = isTimeBased ? t.time : t.mark;
  
  // Best Record Logic (Min for time, Max for distance)
  const getBest = (records: ThrowRecord[]) => {
    if (records.length === 0) return 0;
    const values = records.map(r => r.distance);
    return isTimeBased ? Math.min(...values) : Math.max(...values);
  };

  const bestCompetition = getBest(throwRecords);
  const totalLifts = strengthRecords.length;

  // --- Graph Data Logic ---
  const renderGlobalGraph = () => {
    // 1. Gather all dates
    const allDates = [
      ...throwRecords.map(r => r.date),
      ...trainingRecords.map(r => r.date),
      ...strengthRecords.map(r => r.date)
    ];
    
    // If absolutely no data, show placeholder
    if (allDates.length === 0) {
      return (
        <div className="h-48 md:h-64 flex flex-col items-center justify-center text-neutral-500 bg-neutral-100 dark:bg-neutral-900/50 rounded-2xl border border-neutral-200 dark:border-neutral-800 transition-colors">
          <TrendingUp size={32} className="mb-2 opacity-50" />
          <p className="text-sm">{t.emptyGraph}</p>
        </div>
      );
    }

    // 2. Sort and find Range
    const uniqueDates = [...new Set(allDates)].sort();
    const minDateObj = new Date(uniqueDates[0]).getTime();
    const maxDateObj = new Date(uniqueDates[uniqueDates.length - 1]).getTime();
    
    let timeRange = maxDateObj - minDateObj;
    if (timeRange === 0) timeRange = 24 * 60 * 60 * 1000; 

    // 3. Find Max Values for Normalization (0-100% scale)
    const maxComp = Math.max(...throwRecords.map(r => r.distance), 1);
    const maxTrain = Math.max(...trainingRecords.map(r => r.distance), 1);
    const maxStrength = Math.max(...strengthRecords.map(r => r.weight), 1);

    const width = 1000;
    const height = 300;
    const padding = 30; 
    const graphW = width - padding * 2;
    const graphH = height - padding * 2;

    const getX = (dateStr: string) => {
      const t = new Date(dateStr).getTime();
      const percent = (t - minDateObj) / timeRange;
      return padding + percent * graphW;
    };

    const getY = (val: number, maxVal: number) => {
      // For simplicity, we keep standard Y axis: High value = High on graph.
      const normalized = val / maxVal; 
      return height - padding - (normalized * graphH);
    };

    // 5. Build Points Data
    const getPoints = (data: any[], valKey: string, maxVal: number) => {
      if (data.length < 1) return [];
      const sorted = [...data].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      const grouped: Record<string, number[]> = {};
      sorted.forEach(item => {
        if (!grouped[item.date]) grouped[item.date] = [];
        grouped[item.date].push(item[valKey]);
      });

      return Object.keys(grouped).sort().map((date) => {
        const vals = grouped[date];
        const avg = vals.reduce((a,b) => a+b, 0) / vals.length;
        return { x: getX(date), y: getY(avg, maxVal), val: avg, date };
      });
    };

    const compPoints = getPoints(throwRecords, 'distance', maxComp);
    const trainPoints = getPoints(trainingRecords, 'distance', maxTrain);
    const strengthPoints = getPoints(strengthRecords, 'weight', maxStrength);

    // Helper to make path string
    const makePath = (points: {x:number, y:number}[]) => {
       if (points.length === 0) return "";
       if (points.length === 1) return ""; 
       return points.map((p, i) => `${i===0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    };

    const compPath = makePath(compPoints);
    const trainPath = makePath(trainPoints);
    const strengthPath = makePath(strengthPoints);

    return (
      <div className="w-full overflow-hidden">
         <div className="w-full h-[200px] md:h-[300px] bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 relative shadow-sm dark:shadow-inner overflow-hidden transition-colors">
            {/* Legend Overlay */}
            <div className="absolute top-2 right-2 md:top-4 md:right-4 flex flex-col gap-1 md:gap-2 bg-white/80 dark:bg-neutral-950/80 p-2 md:p-3 rounded-lg md:rounded-xl border border-neutral-200 dark:border-neutral-800 backdrop-blur-sm z-10 text-[10px] md:text-xs">
               <div className="flex items-center gap-2">
                  <div className="w-2 h-2 md:w-3 md:h-3 bg-orange-500 rounded-full border border-neutral-300 dark:border-black shadow-[0_0_8px_rgba(249,115,22,0.8)]"></div>
                  <span className="text-neutral-700 dark:text-orange-200">{t.comp} ({unit})</span>
               </div>
               <div className="flex items-center gap-2">
                  <div className="w-2 h-2 md:w-3 md:h-3 bg-emerald-500 rounded-full border border-neutral-300 dark:border-black shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
                  <span className="text-neutral-700 dark:text-emerald-200">{t.train} ({unit})</span>
               </div>
               <div className="flex items-center gap-2">
                  <div className="w-2 h-2 md:w-3 md:h-3 bg-purple-500 rounded-full border border-neutral-300 dark:border-black shadow-[0_0_8px_rgba(168,85,247,0.8)]"></div>
                  <span className="text-neutral-700 dark:text-purple-200">{t.force} (kg)</span>
               </div>
            </div>

            {/* SVG Content */}
            <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="absolute inset-0">
               {/* Grid Guides */}
               <line x1="0" y1={height-padding} x2={width} y2={height-padding} stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" className="text-neutral-500" />
               <line x1="0" y1={height/2} x2={width} y2={height/2} stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" strokeDasharray="5,5" className="text-neutral-500" />
               <line x1="0" y1={padding} x2={width} y2={padding} stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" strokeDasharray="5,5" className="text-neutral-500" />
               
               {/* Strength Layer */}
               <path d={strengthPath} fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50" />
               {strengthPoints.map((p, i) => (
                  <circle key={`s-${i}`} cx={p.x} cy={p.y} r="4" fill="#a855f7" className="stroke-white dark:stroke-neutral-900 stroke-2" />
               ))}

               {/* Training Layer */}
               <path d={trainPath} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70" />
               {trainPoints.map((p, i) => (
                  <circle key={`t-${i}`} cx={p.x} cy={p.y} r="4" fill="#10b981" className="stroke-white dark:stroke-neutral-900 stroke-2" />
               ))}

               {/* Competition Layer (Top) */}
               <path d={compPath} fill="none" stroke="#f97316" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-[0_0_10px_rgba(249,115,22,0.5)]" />
               {compPoints.map((p, i) => (
                  <circle key={`c-${i}`} cx={p.x} cy={p.y} r="6" fill="#f97316" className="stroke-white dark:stroke-white stroke-2 shadow-[0_0_10px_rgba(249,115,22,1)]" />
               ))}
            </svg>
            
            {/* Axis Label */}
            <div className="absolute bottom-1 left-2 md:bottom-2 md:left-4 text-[9px] md:text-[10px] text-neutral-500 font-mono">
               {uniqueDates.length > 0 ? new Date(uniqueDates[0]).toLocaleDateString() : t.start}
            </div>
            <div className="absolute bottom-1 right-2 md:bottom-2 md:right-4 text-[9px] md:text-[10px] text-neutral-500 font-mono">
               {t.now}
            </div>
         </div>
      </div>
    );
  };
  
  return (
    <div className="p-4 md:p-10 bg-gray-50 dark:bg-neutral-950 h-full overflow-y-auto transition-colors duration-300">
      <h1 className="text-2xl md:text-3xl font-bold text-neutral-900 dark:text-white mb-1">{t.hello}, {userProfile?.firstName || t.athlete} 👋</h1>
      <p className="text-sm md:text-base text-neutral-500 dark:text-neutral-400 mb-6 md:mb-8">{t.summary} {userProfile?.discipline || t.sport}.</p>

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
  );
};
