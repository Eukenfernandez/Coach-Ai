
import React, { useRef, useState } from 'react';
import { PlanFile, Language, UserUsage, UserLimits } from '../types';
import { Upload, FileText, Trash2, Cloud, AlertTriangle, Lock } from 'lucide-react';

interface PlanGalleryProps {
  plans: PlanFile[];
  onSelectPlan: (plan: PlanFile) => void;
  onUpload: (file: File) => void;
  onDelete: (id: string) => void;
  language: Language;
  usage: UserUsage | null;
  limits: UserLimits;
  onNavigate: (screen: any) => void;
}

const TEXTS = {
  es: {
    title: 'Entrenamientos',
    subtitle: 'Tus hojas de planificación y rutinas (PDF).',
    emptyTitle: 'Sin planificaciones',
    emptyDesc: 'Sube el archivo PDF de tu entrenador para tenerlo siempre a mano.',
    uploadBtn: 'Subir PDF',
    uploadRoutine: 'Subir Rutina',
    document: 'PDF',
    delete: 'Eliminar',
    cancel: 'Cancelar',
    confirm: 'Eliminar',
    deleteTitle: '¿Eliminar documento?',
    deleteDesc: 'Se borrará permanentemente de tu equipo y de la nube.',
    limitReached: 'Límite de Planes Alcanzado',
    limitDesc: 'Has alcanzado el límite de archivos PDF de tu plan actual. Mejora para subir más.',
    upgradeBtn: 'Mejorar Plan'
  },
  ing: {
    title: 'Training Plans',
    subtitle: 'Your planning sheets and routines (PDF).',
    emptyTitle: 'No Plans',
    emptyDesc: 'Upload your coach\'s PDF file to keep it handy.',
    uploadBtn: 'Upload PDF',
    uploadRoutine: 'Upload Routine',
    document: 'PDF',
    delete: 'Delete',
    cancel: 'Cancel',
    confirm: 'Delete',
    deleteTitle: 'Delete document?',
    deleteDesc: 'It will be permanently deleted from your device and the cloud.',
    limitReached: 'Plan Limit Reached',
    limitDesc: 'You have reached the PDF limit for your current plan. Upgrade to upload more.',
    upgradeBtn: 'Upgrade Plan'
  },
  eus: {
    title: 'Entrenamenduak',
    subtitle: 'Zure plangintza orriak eta errutinak (PDF).',
    emptyTitle: 'Planifikaziorik ez',
    emptyDesc: 'Igo zure entrenatzailearen PDF fitxategia beti eskura izateko.',
    uploadBtn: 'Igo PDF',
    uploadRoutine: 'Igo Errutina',
    document: 'PDF',
    delete: 'Ezabatu',
    cancel: 'Utzi',
    confirm: 'Ezabatu',
    deleteTitle: 'Dokumentua ezabatu?',
    deleteDesc: 'Betiereko ezabatuko da zure gailutik eta hodeitik.',
    limitReached: 'Plan Muga Gaindituta',
    limitDesc: 'Zure planaren PDF muga gainditu duzu. Hobetu gehiago igotzeko.',
    upgradeBtn: 'Plana Hobetu'
  }
};

export const PlanGallery: React.FC<PlanGalleryProps> = ({ plans, onSelectPlan, onUpload, onDelete, language, usage, limits, onNavigate }) => {
  const t = TEXTS[language] || TEXTS.es;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showDeleteId, setShowDeleteId] = useState<string | null>(null);
  const [showLimitModal, setShowLimitModal] = useState(false);

  const isLimitReached = usage ? (usage.plansCount || 0) >= limits.maxPdfUploads : false;

  const handleUploadClick = () => {
    if (isLimitReached) {
      setShowLimitModal(true);
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (isLimitReached) {
         setShowLimitModal(true);
      } else {
         onUpload(file);
      }
    }
    if (event.target) event.target.value = '';
  };

  return (
    <div className="h-full bg-gray-50 dark:bg-neutral-950 p-6 md:p-10 overflow-y-auto relative transition-colors duration-300">
      <div className="flex flex-col items-start mb-8">
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-2">{t.title}</h1>
        <p className="text-neutral-500 dark:text-neutral-400">{t.subtitle}</p>
        
        {usage && limits.tier === 'FREE' && (
           <div className="mt-2 text-xs font-mono text-neutral-500 bg-neutral-200 dark:bg-neutral-900 px-2 py-1 rounded">
              Límite PDF: {usage.plansCount || 0} / {limits.maxPdfUploads}
           </div>
        )}
      </div>

      {plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[60vh] text-center border-2 border-dashed border-neutral-300 dark:border-neutral-800 rounded-3xl transition-colors">
          <div className="w-20 h-20 bg-neutral-200 dark:bg-neutral-900 rounded-full flex items-center justify-center mb-6">
            <FileText size={32} className="text-red-600" />
          </div>
          <h3 className="text-xl font-semibold text-neutral-900 dark:text-white mb-2">{t.emptyTitle}</h3>
          <p className="text-neutral-500 max-w-sm mb-8">{t.emptyDesc}</p>
          <button onClick={handleUploadClick} className="flex items-center gap-2 bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 px-8 rounded-xl transition-colors"><Upload size={20} /><span>{t.uploadBtn}</span></button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4 mb-24">
          {plans.map((plan) => (
            <div 
              key={plan.id} 
              className="group relative aspect-square bg-white dark:bg-neutral-900 rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1 shadow-md hover:shadow-xl border border-neutral-200 dark:border-neutral-800" 
              onClick={() => onSelectPlan(plan)}
            >
              {/* Background Icon */}
              <div className="absolute inset-0 bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center group-hover:bg-neutral-200 dark:group-hover:bg-neutral-700 transition-colors">
                 <div className="flex flex-col items-center gap-1 md:gap-2">
                    <div className="w-12 h-12 md:w-16 md:h-16 bg-red-600 rounded-xl flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform duration-300">
                       <FileText size={32} className="text-white" />
                    </div>
                 </div>
              </div>

              {/* Info Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                <h4 className="text-[11px] md:text-xs text-white font-bold truncate leading-tight">{plan.name}</h4>
                <p className="text-[9px] md:text-[10px] text-neutral-300 mt-0.5">{plan.date}</p>
              </div>

              {/* Cloud Indicator */}
              {plan.isLocal && <div className="absolute top-2 left-2"><Cloud size={10} className="text-neutral-500" /></div>}
              
              {/* Type Badge */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2">
                 <span className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 rounded text-[8px] font-mono border border-red-200 dark:border-red-900">{t.document}</span>
              </div>

              {/* Delete Button */}
              <button 
                onClick={(e) => { e.stopPropagation(); setShowDeleteId(plan.id); }} 
                className="absolute top-0 right-0 p-2 bg-red-600/0 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-all rounded-bl-xl"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {plans.length > 0 && (
        <div className="fixed bottom-8 right-8 z-20">
          <button onClick={handleUploadClick} className="flex items-center justify-center w-14 h-14 md:w-auto md:h-auto md:px-6 md:py-4 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-2xl shadow-[0_8px_30px_rgba(249,115,22,0.3)] transition-all transform hover:scale-105">
            <Upload size={20} /><span className="hidden md:inline ml-2">{t.uploadRoutine}</span>
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteId && (
         <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-6 rounded-3xl max-w-sm w-full shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
               <div className="flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-red-100 dark:bg-red-500/10 rounded-full flex items-center justify-center mb-4"><AlertTriangle size={32} className="text-red-600 dark:text-red-500" /></div>
                  <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">{t.deleteTitle}</h3>
                  <p className="text-neutral-500 dark:text-neutral-400 text-sm mb-6">{t.deleteDesc}</p>
                  <div className="flex gap-3 w-full">
                     <button onClick={() => setShowDeleteId(null)} className="flex-1 py-3 px-4 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-900 dark:text-white font-medium rounded-xl transition-colors">{t.cancel}</button>
                     <button onClick={() => { onDelete(showDeleteId); setShowDeleteId(null); }} className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-500 text-white font-medium rounded-xl transition-colors">{t.confirm}</button>
                  </div>
               </div>
            </div>
         </div>
      )}

      {/* Limit Modal */}
      {showLimitModal && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
               <div className="flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center mb-4">
                     <Lock size={32} className="text-orange-500" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">{t.limitReached}</h3>
                  <p className="text-neutral-400 text-sm mb-6">{t.limitDesc}</p>
                  <button onClick={() => onNavigate('pricing')} className="w-full py-3 px-4 bg-white text-black font-bold rounded-xl hover:bg-neutral-200 transition-colors">
                     {t.upgradeBtn}
                  </button>
                  <button onClick={() => setShowLimitModal(false)} className="mt-3 text-sm text-neutral-500 hover:text-white">
                     Cerrar
                  </button>
               </div>
            </div>
         </div>
      )}

      <input type="file" ref={fileInputRef} className="hidden" accept=".pdf" onChange={handleFileChange} />
    </div>
  );
};
