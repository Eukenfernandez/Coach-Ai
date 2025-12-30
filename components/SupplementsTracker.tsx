
import React, { useState } from 'react';
import { SupplementItem, Language } from '../types';
import { Plus, Check, RefreshCw, Pill, X } from 'lucide-react';

interface SupplementsTrackerProps {
  supplements: SupplementItem[];
  onUpdate: (items: SupplementItem[]) => void;
  language: Language;
}

const TEXTS = {
  es: {
    title: 'Suplementación',
    subtitle: 'Control diario',
    add: 'Añadir',
    namePlaceholder: 'Suplemento...',
    dosagePlaceholder: 'Dosis...',
    reset: 'Reiniciar Día',
    empty: 'Añade tus suplementos aquí arriba.',
    progress: 'Progreso',
    resetTooltip: 'Desmarcar todo para un nuevo día'
  },
  ing: {
    title: 'Supplementation',
    subtitle: 'Daily tracking',
    add: 'Add',
    namePlaceholder: 'Supplement...',
    dosagePlaceholder: 'Dose...',
    reset: 'Reset Day',
    empty: 'Add your supplements above.',
    progress: 'Progress',
    resetTooltip: 'Uncheck all for a new day'
  },
  eus: {
    title: 'Osagarriak',
    subtitle: 'Eguneroko kontrola',
    add: 'Gehitu',
    namePlaceholder: 'Osagarria...',
    dosagePlaceholder: 'Dosia...',
    reset: 'Eguna Berrasi',
    empty: 'Gehitu zure osagarriak hemen goian.',
    progress: 'Aurrerapena',
    resetTooltip: 'Dena desmarkatu egun berrirako'
  }
};

export const SupplementsTracker: React.FC<SupplementsTrackerProps> = ({ supplements, onUpdate, language }) => {
  const t = TEXTS[language] || TEXTS.es;
  const [newName, setNewName] = useState('');
  const [newDosage, setNewDosage] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const newItem: SupplementItem = {
      id: Date.now().toString(),
      name: newName.trim(),
      dosage: newDosage.trim(),
      taken: false
    };

    onUpdate([...supplements, newItem]);
    setNewName('');
    setNewDosage('');
  };

  const toggleItem = (id: string) => {
    const updated = supplements.map(item => 
      item.id === id ? { ...item, taken: !item.taken } : item
    );
    onUpdate(updated);
  };

  const deleteItem = (id: string) => {
    onUpdate(supplements.filter(item => item.id !== id));
  };

  const resetDay = () => {
    // Immediate action: Set all 'taken' to false
    const updated = supplements.map(item => ({ ...item, taken: false }));
    onUpdate(updated);
  };

  const completedCount = supplements.filter(s => s.taken).length;
  const progress = supplements.length > 0 ? (completedCount / supplements.length) * 100 : 0;

  return (
    <div className="h-full bg-gray-50 dark:bg-neutral-950 p-4 md:p-8 overflow-y-auto transition-colors duration-300">
      <div className="max-w-2xl mx-auto">
        
        {/* Header & Reset Button */}
        <div className="flex justify-between items-center mb-6">
           <div>
              <h1 className="text-xl md:text-2xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                 <Pill className="text-orange-600 dark:text-orange-500" size={24} />
                 {t.title}
              </h1>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium ml-8">{t.subtitle}</p>
           </div>
           
           {supplements.length > 0 && (
              <button 
                 onClick={resetDay}
                 className="flex items-center gap-2 text-xs font-bold bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 px-3 py-2 rounded-lg transition-all active:scale-95 border border-transparent hover:border-neutral-400 dark:hover:border-neutral-600"
                 title={t.resetTooltip}
              >
                 <RefreshCw size={14} />
                 <span className="hidden sm:inline">{t.reset}</span>
              </button>
           )}
        </div>

        {/* Top Input Form */}
        <form onSubmit={handleAdd} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-2 rounded-xl shadow-sm mb-6 flex gap-2 items-center">
           <input 
              type="text" 
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t.namePlaceholder}
              className="flex-grow bg-transparent border-none px-3 py-2 text-sm text-neutral-900 dark:text-white focus:outline-none font-medium placeholder-neutral-400"
           />
           <div className="w-px h-6 bg-neutral-200 dark:bg-neutral-800"></div>
           <input 
              type="text" 
              value={newDosage}
              onChange={(e) => setNewDosage(e.target.value)}
              placeholder={t.dosagePlaceholder}
              className="w-20 sm:w-24 bg-transparent border-none px-3 py-2 text-sm text-neutral-500 dark:text-neutral-400 focus:outline-none text-right placeholder-neutral-400"
           />
           <button 
              type="submit"
              disabled={!newName.trim()}
              className="bg-neutral-900 dark:bg-white text-white dark:text-black p-2 rounded-lg hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors disabled:opacity-50"
           >
              <Plus size={18} />
           </button>
        </form>

        {/* Progress Bar */}
        {supplements.length > 0 && (
           <div className="mb-6">
              <div className="flex justify-between items-center mb-1.5 px-1">
                 <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">{t.progress}</span>
                 <span className="text-xs font-bold text-orange-600 dark:text-orange-500">{Math.round(progress)}%</span>
              </div>
              <div className="h-1.5 bg-gray-200 dark:bg-neutral-800 rounded-full overflow-hidden">
                 <div 
                    className="h-full bg-orange-600 transition-all duration-500 ease-out rounded-full"
                    style={{ width: `${progress}%` }}
                 ></div>
              </div>
           </div>
        )}

        {/* List */}
        <div className="space-y-2">
           {supplements.length === 0 ? (
              <div className="text-center py-8 text-neutral-400 text-sm italic">
                 {t.empty}
              </div>
           ) : (
              supplements.map(item => (
                 <div 
                    key={item.id}
                    onClick={() => toggleItem(item.id)}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all duration-200 group select-none ${
                       item.taken 
                       ? 'bg-orange-50/50 dark:bg-orange-900/10 border-orange-200/50 dark:border-orange-900/30' 
                       : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'
                    }`}
                 >
                    <div className="flex items-center gap-3 overflow-hidden">
                       
                       {/* Custom Square Checkbox with Neon Glow */}
                       <div className={`w-6 h-6 flex-shrink-0 rounded-md border-2 flex items-center justify-center transition-all duration-300 ${
                          item.taken
                          ? 'bg-orange-600 border-orange-600 shadow-[0_0_12px_rgba(249,115,22,0.6)] scale-105' // Orange Fill + Glow
                          : 'bg-transparent border-neutral-300 dark:border-neutral-600 group-hover:border-orange-400'
                       }`}>
                          <Check 
                             size={14} 
                             className={`text-white transition-transform duration-200 ${item.taken ? 'scale-100' : 'scale-0'}`} 
                             strokeWidth={4} 
                          />
                       </div>

                       <div className="flex flex-col min-w-0">
                          <span className={`font-semibold text-sm transition-all truncate ${item.taken ? 'text-neutral-400 line-through decoration-neutral-300 dark:decoration-neutral-700' : 'text-neutral-800 dark:text-neutral-200'}`}>
                             {item.name}
                          </span>
                       </div>
                    </div>
                    
                    <div className="flex items-center gap-3 flex-shrink-0">
                       {item.dosage && (
                          <span className={`text-xs font-mono px-2 py-0.5 rounded ${item.taken ? 'bg-transparent text-neutral-400' : 'bg-gray-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400'}`}>
                             {item.dosage}
                          </span>
                       )}
                       <button 
                          onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
                          className="text-neutral-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-1"
                       >
                          <X size={16} />
                       </button>
                    </div>
                 </div>
              ))
           )}
        </div>

      </div>
    </div>
  );
};
