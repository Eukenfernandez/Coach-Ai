
import React, { useState, useEffect } from 'react';
import { StrengthRecord, ExerciseDef, Language } from '../types';
import { Plus, Trash2, TrendingUp, Calendar, Settings, X, Save } from 'lucide-react';

interface StrengthTrackerProps {
  records: StrengthRecord[];
  onAddRecord: (record: Omit<StrengthRecord, 'id'>) => void;
  onDeleteRecord: (id: string) => void;
  exercises: ExerciseDef[];
  onUpdateExercises: (exercises: ExerciseDef[]) => void;
  language: Language;
}

const TEXTS = {
  es: {
    title: 'Marcas de Fuerza',
    manage: 'Gestionar Ejercicios',
    edit: 'Editar',
    desc: 'Registra tu progreso en levantamientos y pruebas físicas.',
    emptyConfig: 'No hay ejercicios configurados. Añade uno para empezar.',
    add: 'Añadir Marca',
    exercise: 'Ejercicio / Prueba',
    result: 'Resultado',
    date: 'Fecha',
    save: 'Guardar',
    history: 'Historial',
    emptyHistory: 'No hay registros aún.',
    modalTitle: 'Editar Lista de Ejercicios',
    exName: 'Nombre del Ejercicio',
    unit: 'Unidad de Medida',
    addEx: 'Añadir Ejercicio',
    emptyList: 'La lista está vacía.',
    close: 'Cerrar'
  },
  ing: {
    title: 'Strength Records',
    manage: 'Manage Exercises',
    edit: 'Edit',
    desc: 'Track your progress in lifts and physical tests.',
    emptyConfig: 'No exercises configured. Add one to start.',
    add: 'Add Record',
    exercise: 'Exercise / Test',
    result: 'Result',
    date: 'Date',
    save: 'Save',
    history: 'History',
    emptyHistory: 'No records yet.',
    modalTitle: 'Edit Exercise List',
    exName: 'Exercise Name',
    unit: 'Measurement Unit',
    addEx: 'Add Exercise',
    emptyList: 'List is empty.',
    close: 'Close'
  },
  eus: {
    title: 'Indar Markak',
    manage: 'Ariketak Kudeatu',
    edit: 'Editatu',
    desc: 'Erregistratu zure aurrerapena jasoketa eta proba fisikoetan.',
    emptyConfig: 'Ez dago ariketarik konfiguratuta. Gehitu bat hasteko.',
    add: 'Marka Gehitu',
    exercise: 'Ariketa / Proba',
    result: 'Emaitza',
    date: 'Data',
    save: 'Gorde',
    history: 'Historia',
    emptyHistory: 'Ez dago erregistrorik oraindik.',
    modalTitle: 'Ariketa Zerrenda Editatu',
    exName: 'Ariketaren Izena',
    unit: 'Neurketa Unitatea',
    addEx: 'Ariketa Gehitu',
    emptyList: 'Zerrenda hutsik dago.',
    close: 'Itxi'
  }
};

export const StrengthTracker: React.FC<StrengthTrackerProps> = ({ 
  records, 
  onAddRecord, 
  onDeleteRecord,
  exercises,
  onUpdateExercises,
  language
}) => {
  const t = TEXTS[language] || TEXTS.es;
  const [selectedExerciseName, setSelectedExerciseName] = useState(exercises[0]?.name || '');
  const [weight, setWeight] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // Management Modal State
  const [isManaging, setIsManaging] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState('');
  const [newExerciseUnit, setNewExerciseUnit] = useState('kg');

  const AVAILABLE_UNITS = ['kg', 'lb', 'cm', 'm', 's', 'rep'];

  // Automatically update the "Unit" label based on selected exercise
  const currentUnit = exercises.find(e => e.name === selectedExerciseName)?.unit || 'kg';

  // Update selected exercise if list changes or is empty
  useEffect(() => {
    if (exercises.length > 0 && !exercises.some(e => e.name === selectedExerciseName)) {
      setSelectedExerciseName(exercises[0].name);
    }
  }, [exercises, selectedExerciseName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!weight || !date || !selectedExerciseName) return;
    
    onAddRecord({
      exercise: selectedExerciseName,
      weight: parseFloat(weight),
      date
    });
    setWeight('');
  };

  // Exercise Management
  const handleAddExercise = () => {
    const trimmed = newExerciseName.trim();
    if (trimmed && !exercises.some(e => e.name.toLowerCase() === trimmed.toLowerCase())) {
      onUpdateExercises([...exercises, { name: trimmed, unit: newExerciseUnit }]);
      setNewExerciseName('');
      setNewExerciseUnit('kg'); // Reset to default
    }
  };

  const handleDeleteExercise = (exName: string) => {
    onUpdateExercises(exercises.filter(e => e.name !== exName));
  };

  // Group records by exercise to show maxes (ONLY for current active exercises)
  const maxes = exercises.reduce((acc, ex) => {
    const exRecords = records.filter(r => r.exercise === ex.name);
    const max = exRecords.length > 0 ? Math.max(...exRecords.map(r => r.weight)) : 0;
    acc[ex.name] = max;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="h-full bg-gray-50 dark:bg-neutral-950 p-4 md:p-10 overflow-y-auto relative transition-colors duration-300">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-start mb-2">
           <h1 className="text-xl md:text-3xl font-bold text-neutral-900 dark:text-white">{t.title}</h1>
           <button 
             onClick={() => setIsManaging(true)}
             className="flex items-center gap-2 bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-900 dark:text-white border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 md:px-4 md:py-2 rounded-lg transition-colors text-xs md:text-sm font-medium shadow-sm"
           >
             <Settings size={14} className="md:w-4 md:h-4" />
             <span className="hidden md:inline">{t.manage}</span>
             <span className="md:hidden">{t.edit}</span>
           </button>
        </div>
        <p className="text-sm md:text-base text-neutral-500 dark:text-neutral-400 mb-6 md:mb-8">{t.desc}</p>

        {/* Stats Cards (Only Active Exercises) */}
        {exercises.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 mb-8 md:mb-10">
            {exercises.map(ex => (
              <div key={ex.name} className="bg-white dark:bg-neutral-900 p-3 md:p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 hover:border-orange-500/30 transition-colors shadow-sm dark:shadow-none">
                <p className="text-neutral-500 text-[10px] md:text-sm mb-1 truncate" title={ex.name}>{ex.name}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg md:text-2xl font-bold text-neutral-900 dark:text-white">{maxes[ex.name]}</span>
                  <span className="text-xs md:text-sm text-orange-500 font-medium">
                     {ex.unit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center border border-dashed border-neutral-300 dark:border-neutral-800 rounded-xl mb-10 text-neutral-500 text-sm">
             {t.emptyConfig}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
          {/* Input Form */}
          <div className="bg-white dark:bg-neutral-900 p-4 md:p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 h-fit shadow-sm dark:shadow-none">
            <h2 className="text-base md:text-lg font-semibold text-neutral-900 dark:text-white mb-4 flex items-center gap-2">
              <Plus className="text-orange-500" size={18} />
              {t.add}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">{t.exercise}</label>
                {exercises.length > 0 ? (
                  <select 
                    value={selectedExerciseName}
                    onChange={(e) => setSelectedExerciseName(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-neutral-800 text-neutral-900 dark:text-white p-3 rounded-lg border border-neutral-300 dark:border-neutral-700 focus:border-orange-500 focus:outline-none appearance-none"
                  >
                    {exercises.map(ex => <option key={ex.name} value={ex.name}>{ex.name}</option>)}
                  </select>
                ) : (
                  <div className="p-3 text-sm text-red-500 bg-red-100 dark:bg-red-900/20 rounded-lg">{t.emptyConfig}</div>
                )}
              </div>
              <div>
                <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">{t.result} ({currentUnit})</label>
                <div className="relative">
                  <input 
                    type="number" 
                    step="0.01"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-neutral-800 text-neutral-900 dark:text-white p-3 rounded-lg border border-neutral-300 dark:border-neutral-700 focus:border-orange-500 focus:outline-none"
                    placeholder="0.0"
                    required
                    disabled={exercises.length === 0}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm font-bold">
                    {currentUnit}
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">{t.date}</label>
                <input 
                  type="date" 
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-neutral-800 text-neutral-900 dark:text-white p-3 rounded-lg border border-neutral-300 dark:border-neutral-700 focus:border-orange-500 focus:outline-none"
                  required
                  disabled={exercises.length === 0}
                />
              </div>
              <button 
                type="submit"
                disabled={exercises.length === 0}
                className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 rounded-lg transition-colors mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t.save}
              </button>
            </form>
          </div>

          {/* History List */}
          <div className="lg:col-span-2">
            <h2 className="text-base md:text-lg font-semibold text-neutral-900 dark:text-white mb-4 flex items-center gap-2">
              <TrendingUp className="text-orange-500" size={18} />
              {t.history}
            </h2>
            <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-sm dark:shadow-none">
              {records.length === 0 ? (
                <div className="p-8 text-center text-neutral-500 text-sm">{t.emptyHistory}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-gray-100 dark:bg-neutral-950 text-neutral-500 dark:text-neutral-400 text-xs uppercase border-b border-neutral-200 dark:border-neutral-800">
                      <tr>
                        <th className="p-3 md:p-4">{t.date}</th>
                        <th className="p-3 md:p-4">{t.exercise}</th>
                        <th className="p-3 md:p-4">{t.result}</th>
                        <th className="p-3 md:p-4 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                      {[...records].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(record => {
                        const recUnit = exercises.find(e => e.name === record.exercise)?.unit || 'kg';
                        return (
                          <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors">
                            <td className="p-3 md:p-4 text-neutral-600 dark:text-neutral-300 font-mono text-xs md:text-sm whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                {record.date}
                              </div>
                            </td>
                            <td className="p-3 md:p-4 text-neutral-900 dark:text-white font-medium text-xs md:text-sm">{record.exercise}</td>
                            <td className="p-3 md:p-4 text-orange-600 dark:text-orange-400 font-bold text-sm md:text-base whitespace-nowrap">
                              {record.weight} 
                              <span className="text-[10px] md:text-xs text-neutral-500 font-normal ml-1">
                                  {recUnit}
                              </span>
                            </td>
                            <td className="p-3 md:p-4 text-right">
                              <button 
                                onClick={() => onDeleteRecord(record.id)}
                                className="text-neutral-400 hover:text-red-500 transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Exercise Management Modal */}
      {isManaging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
           <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] transition-colors">
              <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex justify-between items-center bg-gray-50 dark:bg-neutral-950">
                 <h3 className="font-bold text-neutral-900 dark:text-white text-sm md:text-base">{t.modalTitle}</h3>
                 <button onClick={() => setIsManaging(false)} className="text-neutral-500 hover:text-neutral-900 dark:hover:text-white">
                    <X size={20} />
                 </button>
              </div>
              
              <div className="p-4 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 space-y-4">
                 <div className="flex flex-col gap-2">
                    <label className="text-xs text-neutral-500 dark:text-neutral-400">{t.exName}</label>
                    <input 
                       type="text" 
                       value={newExerciseName}
                       onChange={(e) => setNewExerciseName(e.target.value)}
                       placeholder="Ej. Salto Profundo"
                       className="w-full bg-gray-50 dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 text-neutral-900 dark:text-white focus:border-orange-500 focus:outline-none text-sm"
                    />
                 </div>
                 
                 <div>
                    <label className="text-xs text-neutral-500 dark:text-neutral-400 mb-2 block">{t.unit}</label>
                    <div className="flex flex-wrap gap-2">
                       {AVAILABLE_UNITS.map(u => (
                          <button
                             key={u}
                             onClick={() => setNewExerciseUnit(u)}
                             className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                                newExerciseUnit === u 
                                ? 'bg-orange-600 text-white ring-2 ring-orange-500 ring-offset-2 ring-offset-white dark:ring-offset-neutral-900' 
                                : 'bg-gray-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-gray-300 dark:hover:bg-neutral-700'
                             }`}
                          >
                             {u}
                          </button>
                       ))}
                    </div>
                 </div>

                 <button 
                    onClick={handleAddExercise}
                    disabled={!newExerciseName.trim()}
                    className="w-full bg-neutral-900 dark:bg-white hover:bg-neutral-700 dark:hover:bg-neutral-200 disabled:opacity-50 text-white dark:text-black font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2 mt-2"
                 >
                    <Plus size={18} />
                    {t.addEx}
                 </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2">
                 {exercises.length === 0 ? (
                    <p className="text-center text-neutral-500 text-sm py-4">{t.emptyList}</p>
                 ) : (
                    <div className="space-y-1">
                       {exercises.map(ex => (
                          <div key={ex.name} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800 group transition-colors">
                             <div className="flex items-center gap-3">
                                <span className="text-neutral-900 dark:text-neutral-200 font-medium text-sm">{ex.name}</span>
                                <span className="text-[10px] bg-gray-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-500 px-2 py-0.5 rounded border border-neutral-300 dark:border-neutral-700">{ex.unit}</span>
                             </div>
                             <button 
                                onClick={() => handleDeleteExercise(ex.name)}
                                className="text-neutral-400 hover:text-red-500 transition-colors p-1"
                                title="Eliminar de la lista"
                             >
                                <Trash2 size={16} />
                             </button>
                          </div>
                       ))}
                    </div>
                 )}
              </div>

              <div className="p-4 bg-gray-50 dark:bg-neutral-950 border-t border-neutral-200 dark:border-neutral-800">
                 <button 
                    onClick={() => setIsManaging(false)}
                    className="w-full py-2 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white border border-neutral-200 dark:border-neutral-700 font-bold rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors"
                 >
                    {t.close}
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};
