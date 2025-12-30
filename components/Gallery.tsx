import React, { useRef, useState, useEffect } from 'react';
import { VideoFile, Language, UserUsage, UserLimits, Screen } from '../types';
import { Upload, Film, Trash2, Camera, X, AlertTriangle, Loader2, Info, Lock, RotateCcw } from 'lucide-react';
import { generateVideoThumbnail, CAMERA_CONSTRAINTS } from '../utils/videoUtils';

interface GalleryProps {
  videos: VideoFile[];
  onSelectVideo: (video: VideoFile) => void;
  onUpload: (file: File, thumbnail: string) => void;
  onDelete: (id: string) => void;
  onNavigate: (screen: Screen) => void;
  language: Language;
  usage: UserUsage | null;
  limits: UserLimits;
  onResetUsage?: () => void;
}

const TEXTS = {
  es: {
    title: 'Análisis de Técnica',
    subtitle: 'Sube tus vídeos y utiliza la IA para diseccionar cada movimiento.',
    empty: 'Tu galería está vacía',
    emptySub: 'Sube o graba tu primer lanzamiento para comenzar el análisis.',
    upload: 'Subir Archivo',
    record: 'Grabar (4K)',
    delete: 'Eliminar',
    deleteModalTitle: '¿Eliminar vídeo?',
    deleteModalDesc: 'Esta acción no se puede deshacer. El vídeo se borrará permanentemente.',
    cancel: 'Cancelar',
    confirm: 'Sí, eliminar',
    uploading: 'Subiendo...',
    usageLimit: 'Límite Mensual',
    used: 'usados',
    limitReached: 'Límite alcanzado',
    upgradeAlert: 'Has alcanzado el límite de vídeos de tu plan actual. Mejora a Premium para subir más.',
    upgradeBtn: 'Mejorar Plan',
    unlimited: 'Ilimitado'
  },
  ing: {
    title: 'Technique Analysis',
    subtitle: 'Upload videos and use AI to dissect every movement.',
    empty: 'Your gallery is empty',
    emptySub: 'Upload or record your first throw to start analyzing.',
    upload: 'Upload File',
    record: 'Record (4K)',
    delete: 'Delete',
    deleteModalTitle: 'Delete video?',
    deleteModalDesc: 'This action cannot be undone. The video will be permanently deleted.',
    cancel: 'Cancel',
    confirm: 'Yes, delete',
    uploading: 'Uploading...',
    usageLimit: 'Monthly Limit',
    used: 'used',
    limitReached: 'Limit reached',
    upgradeAlert: 'You have reached the video limit for your current plan. Upgrade to Premium to upload more.',
    upgradeBtn: 'Upgrade Plan',
    unlimited: 'Unlimited'
  },
  eus: {
    title: 'Teknika Analisia',
    subtitle: 'Igo zure bideoak eta erabili IA mugimendu bakoitza aztertzeko.',
    empty: 'Galeria hutsik dago',
    emptySub: 'Igo edo grabatu zure lehen jaurtiketa analisia hasteko.',
    upload: 'Fitxategia Igo',
    record: 'Grabatu (4K)',
    delete: 'Ezabatu',
    deleteModalTitle: 'Bideoa ezabatu?',
    deleteModalDesc: 'Ekintza hau ezin da desegin. Bideoa betirako ezabatuko da.',
    cancel: 'Utzi',
    confirm: 'Bai, ezabatu',
    uploading: 'Igotzen...',
    usageLimit: 'Hileko Muga',
    used: 'erabilita',
    limitReached: 'Muga gaindituta',
    upgradeAlert: 'Zure uneko planaren bideo muga gainditu duzu. Igo Premium-era gehiago igotzeko.',
    upgradeBtn: 'Plana Hobetu',
    unlimited: 'Mugagabea'
  }
};

export const Gallery: React.FC<GalleryProps> = ({ videos, onSelectVideo, onUpload, onDelete, onNavigate, language, usage, limits, onResetUsage }) => {
  const t = TEXTS[language] || TEXTS.es;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const limitVal = limits.maxAnalysisPerMonth;
  // maxAnalysisPerMonth is strictly a number in UserLimits, so no need to check for 'unlimited' string
  const isUnlimited = false;
  const isLimitReached = usage ? usage.analysisCount >= limitVal : false;
  
  // Show usage only if not unlimited
  const showUsage = usage;

  useEffect(() => {
    let interval: any;
    if (isRecording) {
      interval = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } else {
      setRecordingTime(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const handleUploadClick = () => {
    if (isLimitReached) {
      setShowLimitModal(true);
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (isLimitReached) {
         setShowLimitModal(true);
      } else {
         const thumbnail = await generateVideoThumbnail(file);
         onUpload(file, thumbnail);
      }
    }
    if (event.target) event.target.value = '';
  };

  const startCamera = async () => {
    if (isLimitReached) {
       setShowLimitModal(true);
       return;
    }
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
      setStream(mediaStream);
      if (videoRef.current) videoRef.current.srcObject = mediaStream;
      setShowCamera(true);
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("No se pudo acceder a la cámara.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setShowCamera(false);
  };

  const startRecording = () => {
    if (stream) {
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) setRecordedChunks((prev) => [...prev, e.data]);
      };
      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      setIsRecording(false);
      mediaRecorder.onstop = async () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const file = new File([blob], `recording_${Date.now()}.webm`, { type: 'video/webm' });
        const thumbnail = await generateVideoThumbnail(file);
        onUpload(file, thumbnail);
        setRecordedChunks([]);
        stopCamera();
      };
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-full bg-neutral-950 p-6 md:p-10 overflow-y-auto relative transition-colors duration-300">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">{t.title}</h1>
          <p className="text-neutral-400">{t.subtitle}</p>
        </div>
        
        {showUsage && usage && (
          <div className="flex items-center gap-2">
             {/* Desktop Usage View */}
             <div className="hidden md:flex bg-neutral-900 border border-neutral-800 rounded-2xl p-4 items-center gap-4 animate-in fade-in slide-in-from-right-4">
               <div className="flex flex-col items-end">
                 <span className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">{t.usageLimit}</span>
                 <div className="flex items-baseline gap-1">
                   <span className={`text-xl font-black ${isLimitReached ? 'text-red-500' : 'text-orange-500'}`}>
                     {usage.analysisCount}
                   </span>
                   <span className="text-neutral-500 text-xs">/ {limitVal}</span>
                 </div>
               </div>
               <div className="w-12 h-12 rounded-full border-4 border-neutral-800 flex items-center justify-center relative overflow-hidden">
                  <div 
                    className={`absolute bottom-0 left-0 w-full transition-all duration-1000 ${isLimitReached ? 'bg-red-500' : 'bg-orange-600'}`}
                    style={{ height: `${Math.min(100, (usage.analysisCount / limitVal) * 100)}%` }}
                  />
                  <Info size={16} className="relative z-10 text-white" />
               </div>
             </div>

             {/* Mobile Usage View (Discrete) */}
             <div className="md:hidden absolute top-6 right-6 flex items-center gap-1.5 bg-neutral-900/80 backdrop-blur border border-neutral-800 px-2.5 py-1 rounded-full shadow-lg">
                <div className={`w-2 h-2 rounded-full ${isLimitReached ? 'bg-red-500 animate-pulse' : 'bg-orange-500'}`}></div>
                <span className="text-xs font-mono font-bold text-white">
                   {usage.analysisCount}/{limitVal}
                </span>
             </div>
          </div>
        )}
      </div>

      {videos.length === 0 && !showCamera ? (
         <div className="flex flex-col items-center justify-center h-[50vh] text-center border-2 border-dashed border-neutral-800 rounded-3xl">
            <div className="w-20 h-20 bg-neutral-900 rounded-full flex items-center justify-center mb-6">
               <Film size={32} className="text-orange-600" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">{t.empty}</h3>
            <p className="text-neutral-500 max-w-sm mb-8">{t.emptySub}</p>
            <div className="flex flex-col sm:flex-row gap-4">
               <button 
                 onClick={handleUploadClick} 
                 className="flex items-center gap-2 font-bold py-3 px-6 rounded-xl transition-all shadow-lg bg-orange-600 hover:bg-orange-500 text-white"
               >
                 <Upload size={20} /><span>{t.upload}</span>
               </button>
               <button 
                 onClick={startCamera} 
                 className="flex items-center gap-2 font-bold py-3 px-6 rounded-xl transition-all shadow-lg bg-white text-black hover:bg-neutral-200"
               >
                 <Camera size={20} /><span>{t.record}</span>
               </button>
            </div>
         </div>
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 md:gap-4 mb-24">
            {videos.map((video) => (
               <div 
                 key={video.id} 
                 className="group relative aspect-square bg-black rounded-2xl overflow-hidden cursor-pointer shadow-md hover:shadow-2xl border border-neutral-800 transition-all duration-500 ease-out hover:scale-105"
                 onClick={() => !video.isUploading && onSelectVideo(video)}
               >
                  {video.thumbnail && (
                    <img 
                      src={video.thumbnail} 
                      alt={video.name} 
                      className={`w-full h-full object-cover transition-all duration-700 group-hover:scale-110 ${video.isUploading ? 'opacity-40' : 'opacity-90 group-hover:opacity-100'}`} 
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-end pointer-events-none">
                     <h4 className="text-[10px] md:text-xs font-bold text-white truncate">{video.name}</h4>
                     <p className="text-[8px] md:text-[10px] text-neutral-300 mt-0.5">{video.date.split(',')[0]}</p>
                  </div>
                  {!video.isUploading && (
                    <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] text-white font-mono flex items-center gap-1 z-10 pointer-events-none">
                       <Film size={10} /> {video.duration || '00:00'}
                    </div>
                  )}
                  {video.isUploading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] z-20 pointer-events-none">
                       <Loader2 className="animate-spin text-orange-500 mb-2" size={28} />
                       <span className="text-[10px] text-white font-bold uppercase tracking-widest">{t.uploading}</span>
                    </div>
                  )}
                  {!video.isUploading && (
                    <button 
                       onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(video.id); }}
                       className="absolute top-0 right-0 p-3 bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-all rounded-bl-2xl shadow-lg hover:bg-red-500 z-50 cursor-pointer"
                    >
                       <Trash2 size={16} fill="currentColor" />
                    </button>
                  )}
                  {!video.isUploading && (
                    <div className="absolute bottom-0 left-0 h-[5px] w-0 bg-orange-600 transition-all duration-500 ease-out group-hover:w-full z-50 pointer-events-none"></div>
                  )}
               </div>
            ))}
          </div>

          <div className="fixed bottom-8 right-8 z-20 flex flex-col gap-3">
             <button 
               onClick={startCamera} 
               className="flex items-center justify-center w-14 h-14 md:w-auto md:h-auto md:px-4 md:py-3 font-bold rounded-2xl shadow-xl transition-all bg-white text-black hover:scale-105"
             >
               <Camera size={20} /><span className="hidden md:inline ml-2">{t.record}</span>
             </button>
             <button 
               onClick={handleUploadClick}
               className="flex items-center justify-center w-14 h-14 md:w-auto md:h-auto md:px-6 md:py-4 font-bold rounded-2xl shadow-xl transition-all bg-orange-600 hover:bg-orange-500 text-white hover:scale-105"
             >
               <Upload size={20} /><span className="hidden md:inline ml-2">{t.upload}</span>
             </button>
          </div>
        </>
      )}

      {showCamera && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col animate-in slide-in-from-bottom duration-300">
           <div className="relative flex-1 bg-black">
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
              <button onClick={stopCamera} className="absolute top-6 right-6 p-2 bg-black/50 text-white rounded-full backdrop-blur-md z-10"><X size={24} /></button>
              {isRecording && <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-red-600/90 text-white px-4 py-1 rounded-full text-sm font-mono animate-pulse flex items-center gap-2"><div className="w-2 h-2 bg-white rounded-full"></div>{formatTime(recordingTime)}</div>}
           </div>
           <div className="h-32 bg-black flex items-center justify-center gap-8">
              {!isRecording ? (
                 <button onClick={startRecording} className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center group"><div className="w-14 h-14 bg-red-600 rounded-full group-hover:scale-90 transition-transform"></div></button>
              ) : (
                 <button onClick={stopRecording} className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center group"><div className="w-8 h-8 bg-red-600 rounded-sm group-hover:scale-90 transition-transform"></div></button>
              )}
           </div>
        </div>
      )}

      {showDeleteConfirm && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
               <div className="flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4"><AlertTriangle size={32} className="text-red-500" /></div>
                  <h3 className="text-xl font-bold text-white mb-2">{t.deleteModalTitle}</h3>
                  <p className="text-neutral-400 text-sm mb-6">{t.deleteModalDesc}</p>
                  <div className="flex gap-3 w-full">
                     <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 py-3 px-4 bg-neutral-800 hover:bg-neutral-700 text-white font-medium rounded-xl transition-colors">{t.cancel}</button>
                     <button onClick={() => { if (showDeleteConfirm) onDelete(showDeleteConfirm); setShowDeleteConfirm(null); }} className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-500 text-white font-medium rounded-xl transition-colors">{t.confirm}</button>
                  </div>
               </div>
            </div>
         </div>
      )}

      {showLimitModal && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
               <div className="flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center mb-4">
                     <Lock size={32} className="text-orange-500" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">{t.limitReached}</h3>
                  <p className="text-neutral-400 text-sm mb-6">{t.upgradeAlert}</p>
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

      <input type="file" ref={fileInputRef} className="hidden" accept="video/*" onChange={handleFileChange} />
    </div>
  );
};