
import React, { useState } from 'react';
import { ThrowRecord, UserProfile, Language, isTimeBased as checkTimeBased, getMetricUnit } from '../types';
import { MapPin, Trash2, Target, StopCircle } from 'lucide-react';

interface TrainingTrackerProps {
  profile: UserProfile;
  records: ThrowRecord[];
  onAddRecord: (record: Omit<ThrowRecord, 'id'>) => void;
  onDeleteRecord: (id: string) => void;
  language: Language;
}

const TEXTS = {
  es: {
    title: 'Práctica Técnica',
    subtitle: 'Entrenamientos',
    best: 'Mejor Entrenamiento',
    consistency: 'Consistencia',
    add: 'Añadir',
    location: 'Ubicación / Notas',
    date: 'Fecha',
    save: 'Guardar',
    session: 'Registros de Sesión',
    empty: 'No hay entrenamientos registrados.',
    graphEmpty: 'Añade al menos 2 registros para ver la gráfica.',
    time: 'Tiempo',
    mark: 'Marca'
  },
  ing: {
    title: 'Technical Practice',
    subtitle: 'Workouts',
    best: 'Best Workout',
    consistency: 'Consistency',
    add: 'Add',
    location: 'Location / Notes',
    date: 'Date',
    save: 'Save',
    session: 'Session Logs',
    empty: 'No workouts registered.',
    graphEmpty: 'Add at least 2 records to see the graph.',
    time: 'Time',
    mark: 'Mark'
  },
  eus: {
    title: 'Praktika Teknikoa',
    subtitle: 'Entrenamenduak',
    best: 'Entrenamendu Onena',
    consistency: 'Koherentzia',
    add: 'Gehitu',
    location: 'Kokalekua / Oharrak',
    date: 'Data',
    save: 'Gorde',
    session: 'Saio Erregistroak',
    empty: 'Ez dago entrenamendurik erregistratuta.',
    graphEmpty: 'Gehitu gutxienez 2 erregistro grafikoa ikusteko.',
    time: 'Denbora',
    mark: 'Marka'
  }
};

export const TrainingTracker: React.FC<TrainingTrackerProps> = ({ profile, records, onAddRecord, onDeleteRecord, language }) => {
  const t = TEXTS[language] || TEXTS.es;
  const [value, setValue] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // Adapt to sport discipline using helper functions
  const isTimeBasedDiscipline = checkTimeBased(profile.discipline || '');
  const unit = getMetricUnit(profile.discipline || '');
  const label = isTimeBasedDiscipline ? t.time : t.mark;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value || !date) return;
    onAddRecord({
      distance: parseFloat(value),
      location: location || 'Entrenamiento',
      date
    });
    setValue('');
    setLocation('');
  };

  const sortedRecords = [...records].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const bestRecord = records.length > 0
    ? (isTimeBasedDiscipline
      ? Math.min(...records.map(r => r.distance))
      : Math.max(...records.map(r => r.distance)))
    : 0;

  // Simple Graph Calculation
  const renderGraph = () => {
    if (sortedRecords.length < 2) return <div className="h-48 md:h-64 flex items-center justify-center text-neutral-500 text-sm bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800">{t.graphEmpty}</div>;

    const height = 300;
    const width = 800;
    const padding = 40;

    const minVal = Math.min(...sortedRecords.map(r => r.distance));
    const maxVal = Math.max(...sortedRecords.map(r => r.distance));

    let rangeY = maxVal - minVal;
    if (rangeY === 0) rangeY = 1;

    const viewMin = minVal - (rangeY * 0.1);
    const viewMax = maxVal + (rangeY * 0.1);
    const viewRange = viewMax - viewMin;

    const points = sortedRecords.map((rec, i) => {
      const x = padding + (i / (sortedRecords.length - 1)) * (width - padding * 2);
      const y = height - padding - ((rec.distance - viewMin) / viewRange) * (height - padding * 2);
      return `${x},${y}`;
    }).join(' ');

    return (
      <div className="w-full pb-4">
        <div className="w-full aspect-[2/1] md:aspect-[3/1]">
          <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="bg-white dark:bg-neutral-900/50 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm dark:shadow-none transition-colors">
            {/* Grid Lines */}
            <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" className="text-neutral-500" />
            <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" className="text-neutral-500" />

            {/* Path */}
            <polyline points={points} fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

            {/* Dots */}
            {sortedRecords.map((rec, i) => {
              const x = padding + (i / (sortedRecords.length - 1)) * (width - padding * 2);
              const y = height - padding - ((rec.distance - viewMin) / viewRange) * (height - padding * 2);
              return (
                <g key={rec.id} className="group">
                  <circle cx={x} cy={y} r="5" className="fill-white dark:fill-neutral-900 stroke-emerald-500 stroke-2 md:group-hover:r-7 transition-all cursor-pointer" />
                  <rect x={x - 30} y={y - 40} width="60" height="25" rx="4" fill="#333" className="hidden md:block opacity-0 group-hover:opacity-100 transition-opacity" />
                  <text x={x} y={y - 23} textAnchor="middle" fill="white" fontSize="10" className="hidden md:block opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                    {rec.distance}{unit}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full bg-gray-50 dark:bg-neutral-950 p-4 md:p-10 overflow-y-auto transition-colors duration-300">
      <div className="max-w-5xl mx-auto">

        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
          <div>
            <h1 className="text-xl md:text-3xl font-bold text-neutral-900 dark:text-white mb-1 md:mb-2">{t.title}</h1>
            <p className="text-sm md:text-base text-neutral-500 dark:text-neutral-400">{profile.discipline} - {t.subtitle}</p>
          </div>
          <div className="bg-white dark:bg-neutral-900 px-4 py-3 md:px-6 md:py-3 rounded-xl border border-emerald-500/20 shadow-sm dark:shadow-none w-full md:w-auto transition-colors">
            <span className="block text-[10px] md:text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1">{t.best}</span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl md:text-3xl font-bold text-emerald-600 dark:text-emerald-500">{bestRecord}</span>
              <span className="text-lg md:text-xl text-emerald-600/80 dark:text-emerald-500/80">{unit}</span>
            </div>
          </div>
        </div>

        {/* Graph Section */}
        <div className="mb-8 md:mb-10">
          <h3 className="text-neutral-900 dark:text-white font-semibold mb-3 md:mb-4 flex items-center gap-2 text-sm md:text-base">
            <Target size={18} className="text-emerald-500" />
            {t.consistency}
          </h3>
          {renderGraph()}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
          {/* Add Form */}
          <div className="bg-white dark:bg-neutral-900 p-4 md:p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 h-fit shadow-sm dark:shadow-none transition-colors">
            <h3 className="text-neutral-900 dark:text-white font-semibold mb-4 text-sm md:text-base">{t.add} {label}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">{label} ({unit})</label>
                <input
                  type="number"
                  step="0.01"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-neutral-800 text-neutral-900 dark:text-white p-3 rounded-lg border border-neutral-300 dark:border-neutral-700 focus:border-emerald-500 focus:outline-none"
                  placeholder="00.00"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">{t.location}</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-neutral-800 text-neutral-900 dark:text-white p-3 rounded-lg border border-neutral-300 dark:border-neutral-700 focus:border-emerald-500 focus:outline-none"
                  placeholder="Ej. Series cortas"
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">{t.date}</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-neutral-800 text-neutral-900 dark:text-white p-3 rounded-lg border border-neutral-300 dark:border-neutral-700 focus:border-emerald-500 focus:outline-none"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg transition-colors mt-2"
              >
                {t.save}
              </button>
            </form>
          </div>

          {/* List */}
          <div className="lg:col-span-2 space-y-3">
            <h3 className="text-neutral-900 dark:text-white font-semibold mb-3 md:mb-4 text-sm md:text-base">{t.session}</h3>
            {records.length === 0 && <p className="text-neutral-500 text-sm">{t.empty}</p>}
            {[...records].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(record => (
              <div key={record.id} className="flex items-center justify-between bg-white dark:bg-neutral-900 p-3 md:p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 hover:border-emerald-500/30 transition-colors shadow-sm dark:shadow-none">
                <div className="flex items-center gap-3 md:gap-4">
                  <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-500 font-bold shrink-0">
                    {isTimeBasedDiscipline ? <StopCircle size={16} className="md:w-[18px]" /> : 'E'}
                  </div>
                  <div>
                    <div className="flex items-baseline gap-1">
                      <p className="text-neutral-900 dark:text-white font-bold text-base md:text-lg">{record.distance}</p>
                      <span className="text-xs md:text-sm text-neutral-500">{unit}</span>
                    </div>
                    <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-3 text-xs text-neutral-500">
                      <span>{record.date}</span>
                      <span className="hidden md:inline">•</span>
                      <span className="flex items-center gap-1">
                        <MapPin size={10} />
                        <span className="truncate max-w-[150px]">{record.location}</span>
                      </span>
                    </div>
                  </div>
                </div>
                <button onClick={() => onDeleteRecord(record.id)} className="text-neutral-400 hover:text-red-500 p-2">
                  <Trash2 size={16} className="md:w-[18px]" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
