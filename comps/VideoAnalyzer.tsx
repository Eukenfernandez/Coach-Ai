
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { VideoContextDoc, VideoFile, ChatMessage, UserUsage, UserLimits, Language, UserProfile, Screen, VideoPoseSnapshot, VideoQuestionMode } from '../types';
import { VideoIntelligenceService } from '../svcs/videoIntelligenceService';
import { usePoseDetection, drawPoseOnCanvas, drawPoseOnCanvasWithOffset, POSE_CONNECTIONS, BODY_KEYPOINTS } from '../hks/usePoseDetection';
import { getBiomechanicalContext } from '../utl/biomechanics';
import {
   Play, Pause, ChevronLeft, ChevronRight, X,
   ZoomIn, ZoomOut, PenTool, Eraser,
   Sparkles, Split, Send, RotateCcw,
   Loader2, Move, Trash2, Palette, MousePointer2, Minus, Circle, Link2, Unlink, Lock, User
} from 'lucide-react';

interface Line {
   id: string; // Add ID for easier deletion
   points: { x: number; y: number }[];
   color: string;
   isStraight?: boolean;
}

const DRAWING_COLORS = [
   { id: 'red', hex: '#ef4444' },
   { id: 'yellow', hex: '#eab308' },
   { id: 'green', hex: '#22c55e' },
   { id: 'blue', hex: '#3b82f6' },
   { id: 'white', hex: '#ffffff' },
];

const ANALYZER_TEXTS = {
   es: {
      chatIntro: 'Hola, soy tu entrenador IA. ¿Qué quieres analizar de este vídeo?',
      analyzing: 'Analizando...',
      askPlaceholder: 'Pregunta...',
      coachIA: 'Coach IA',
      compareTitle: '¡Compara Vídeos!',
      compareDesc: 'Como usuario Pro/Premium, puedes comparar dos vídeos lado a lado para analizar tu técnica.',
      syncTitle: '¡Sincroniza los Vídeos!',
      syncDesc: 'Alinea los vídeos manualmente y pulsa este botón para que se muevan juntos.',
      geminiTitle: '¡Analiza con Gemini AI!',
      geminiDesc: 'Pulsa este botón para obtener análisis inteligente de tu técnica con IA.',
      upgradeTitle: 'Función Pro/Premium',
      upgradeDesc: 'La comparación de vídeos lado a lado está disponible para usuarios Atleta Pro y Atleta Premium. ¡Mejora tu plan para desbloquear esta función!',
      viewPlans: 'Ver Planes',
      close: 'Cerrar',
      connectionError: 'Error de conexión.'
   },
   ing: {
      chatIntro: 'Hi, I\'m your AI coach. What do you want to analyze in this video?',
      analyzing: 'Analyzing...',
      askPlaceholder: 'Ask...',
      coachIA: 'AI Coach',
      compareTitle: 'Compare Videos!',
      compareDesc: 'As a Pro/Premium user, you can compare two videos side by side to analyze your technique.',
      syncTitle: 'Sync the Videos!',
      syncDesc: 'Manually align the videos and press this button to move them together.',
      geminiTitle: 'Analyze with Gemini AI!',
      geminiDesc: 'Press this button to get intelligent analysis of your technique with AI.',
      upgradeTitle: 'Pro/Premium Feature',
      upgradeDesc: 'Side-by-side video comparison is available for Pro Athlete and Premium Athlete users. Upgrade your plan to unlock this feature!',
      viewPlans: 'View Plans',
      close: 'Close',
      connectionError: 'Connection error.'
   },
   eus: {
      chatIntro: 'Kaixo, zure AI entrenatzailea naiz. Zer aztertu nahi duzu bideo honetan?',
      analyzing: 'Aztertzen...',
      askPlaceholder: 'Galdetu...',
      coachIA: 'AI Entrenatzailea',
      compareTitle: 'Konparatu Bideoak!',
      compareDesc: 'Pro/Premium erabiltzaile gisa, bi bideo aldez alde konpara ditzakezu zure teknika aztertzeko.',
      syncTitle: 'Sinkronizatu Bideoak!',
      syncDesc: 'Lerrokatu bideoak eskuz eta sakatu botoi hau elkarrekin mugitzeko.',
      geminiTitle: 'Aztertu Gemini AI-rekin!',
      geminiDesc: 'Sakatu botoi hau zure teknikaren analisi adimentsua lortzeko IA-rekin.',
      upgradeTitle: 'Pro/Premium Funtzioa',
      upgradeDesc: 'Aldez aldeko bideo konparaketa Pro Atleta eta Premium Atleta erabiltzaileentzat dago eskuragarri. Eguneratu zure plana funtzio hau desblokeatzeko!',
      viewPlans: 'Ikusi Planak',
      close: 'Itxi',
      connectionError: 'Konexio errorea.'
   }
};

const VIDEO_CONTEXT_TEXTS = {
   es: {
      processingVideo: 'Procesando vídeo',
      contextReady: 'Contexto completo listo',
      contextPartial: 'Contexto parcial listo',
      contextFailed: 'Falló el contexto del vídeo',
      askThisMoment: 'Analizar este frame',
      askThisRange: 'Analizar este tramo',
      askFullSummary: 'Resumen técnico',
      contextUsed: 'Contexto usado',
      timestampLabel: 'Tiempo',
      pendingHint: 'Mientras termina el procesamiento, el chat usa frame actual y ventana cercana con menor confianza.',
      retryContext: 'Reintentar contexto'
   },
   ing: {
      processingVideo: 'Processing video',
      contextReady: 'Full context ready',
      contextPartial: 'Partial context ready',
      contextFailed: 'Video context failed',
      askThisMoment: 'Analyze this frame',
      askThisRange: 'Analyze this range',
      askFullSummary: 'Technical summary',
      contextUsed: 'Context used',
      timestampLabel: 'Time',
      pendingHint: 'While processing finishes, the chat falls back to the current frame and a nearby window with lower confidence.',
      retryContext: 'Retry context'
   },
   eus: {
      processingVideo: 'Bideoa prozesatzen',
      contextReady: 'Testuinguru osoa prest',
      contextPartial: 'Testuinguru partziala prest',
      contextFailed: 'Bideoaren testuinguruak huts egin du',
      askThisMoment: 'Analizatu frame hau',
      askThisRange: 'Analizatu tarte hau',
      askFullSummary: 'Laburpen teknikoa',
      contextUsed: 'Erabilitako testuingurua',
      timestampLabel: 'Denbora',
      pendingHint: 'Prozesamendua amaitu arte, txatak uneko frame-a eta inguruko leihoa erabiliko ditu konfiantza txikiagoarekin.',
      retryContext: 'Saiatu berriro'
   }
};

interface VideoAnalyzerProps {
   video: VideoFile;
   targetUserId: string;
   onBack: () => void;
   usage: UserUsage | null;
   limits: UserLimits;
   onIncrementUsage?: () => Promise<void>;
   language: Language;
   onNavigate: (screen: Screen) => void;
   userProfile?: UserProfile;
}

const POSE_SNAPSHOT_MAP: Record<number, string> = {
   11: 'leftShoulder',
   12: 'rightShoulder',
   13: 'leftElbow',
   14: 'rightElbow',
   15: 'leftWrist',
   16: 'rightWrist',
   23: 'leftHip',
   24: 'rightHip',
   25: 'leftKnee',
   26: 'rightKnee',
   27: 'leftAnkle',
   28: 'rightAnkle',
};

const inferQuestionMode = (message: string): VideoQuestionMode => {
   const normalized = message.toLowerCase();
   if (/(resume|resumen|summary|todo el|whole|entire|global|completo)/.test(normalized)) return 'summary';
   if (/(tramo|segment|window|compare|compara|anterior|previo|before|previous)/.test(normalized)) return 'range';
   return 'frame';
};

const buildPoseSnapshot = (landmarks: any[] | null): VideoPoseSnapshot | null => {
   if (!landmarks || landmarks.length === 0) return null;

   const joints = Object.entries(POSE_SNAPSHOT_MAP).reduce((acc, [index, label]) => {
      const point = landmarks[Number(index)];
      if (point) {
         acc[label] = {
            x: Number(point.x.toFixed(4)),
            y: Number(point.y.toFixed(4)),
            visibility: typeof point.visibility === 'number' ? Number(point.visibility.toFixed(4)) : undefined,
         };
      }
      return acc;
   }, {} as Record<string, { x: number; y: number; visibility?: number }>);

   if (Object.keys(joints).length === 0) return null;

   return {
      source: 'mediapipe',
      joints,
   };
};

const getVideoContextBadge = (context: VideoContextDoc | null, texts: typeof VIDEO_CONTEXT_TEXTS.es) => {
   if (!context) {
      return {
         label: texts.processingVideo,
         classes: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
      };
   }

   if (context.status === 'ready') {
      return {
         label: texts.contextReady,
         classes: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
      };
   }

   if (context.status === 'partial') {
      return {
         label: texts.contextPartial,
         classes: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
      };
   }

   if (context.status === 'failed') {
      return {
         label: texts.contextFailed,
         classes: 'border-red-500/30 bg-red-500/10 text-red-300',
      };
   }

   return {
      label: texts.processingVideo,
      classes: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
   };
};

const formatContextSourcesLabel = (sources: string[], language: Language) => {
   const labels = {
      es: {
         global_summary: 'resumen global',
         active_segment: 'segmento activo',
         adjacent_segments: 'tramo anterior/posterior',
         semantic_segments: 'segmentos relacionados',
         key_moments: 'momentos clave',
         current_frame: 'frame actual',
         window_frames: 'ventana temporal',
         chat_history: 'historial',
         biomechanics_rules: 'reglas biomecánicas',
         pose_snapshot: 'pose snapshot',
         fallback_only: 'fallback',
      },
      ing: {
         global_summary: 'global summary',
         active_segment: 'active segment',
         adjacent_segments: 'adjacent range',
         semantic_segments: 'related segments',
         key_moments: 'key moments',
         current_frame: 'current frame',
         window_frames: 'time window',
         chat_history: 'history',
         biomechanics_rules: 'biomechanics rules',
         pose_snapshot: 'pose snapshot',
         fallback_only: 'fallback',
      },
      eus: {
         global_summary: 'laburpen globala',
         active_segment: 'segmentu aktiboa',
         adjacent_segments: 'alboko tartea',
         semantic_segments: 'lotutako segmentuak',
         key_moments: 'une gakoak',
         current_frame: 'uneko frame-a',
         window_frames: 'denbora leihoa',
         chat_history: 'historiala',
         biomechanics_rules: 'arau biomekanikoak',
         pose_snapshot: 'pose snapshot',
         fallback_only: 'fallback',
      },
   } as const;

   const dictionary = labels[language] || labels.es;
   return sources.map((source) => dictionary[source as keyof typeof dictionary] || source).join(' + ');
};

interface DualScrubberProps {
   curr: number;
   dur: number;
   setTime: (t: number, isDragging?: boolean) => void;
   onScrubStart: () => void;
   onScrubEnd: () => void;
   label?: string;
   isSecondary?: boolean;
}

const DualScrubber: React.FC<DualScrubberProps> = ({
   curr, dur, setTime, onScrubStart, onScrubEnd, label, isSecondary
}) => {
   const fastRef = useRef<HTMLDivElement>(null);
   const slowRef = useRef<HTMLDivElement>(null);
   
   // High-performance scrubbing state
   const [localTime, setLocalTime] = useState<number | null>(null);
   const dragState = useRef({ startX: 0, startTime: 0, fast: false, slow: false, activePointerId: null as number | null });

   const [containerWidth, setContainerWidth] = useState(1000);
   const rafRef = useRef<number | null>(null);

   const pendingClientX = useRef<number | null>(null);

   const TICK_GAP = 10;
   const TICKS_PER_GROUP = 10;
   const PATTERN_WIDTH = TICK_GAP * TICKS_PER_GROUP;
   const PIXELS_PER_SECOND = 80;

   useEffect(() => {
      const updateWidth = () => { if (slowRef.current) setContainerWidth(slowRef.current.clientWidth); };
      updateWidth();
      
      let observer: ResizeObserver | null = null;
      if (slowRef.current) {
         observer = new ResizeObserver(() => updateWidth());
         observer.observe(slowRef.current);
      }

      window.addEventListener('resize', updateWidth);
      return () => {
         window.removeEventListener('resize', updateWidth);
         if (observer) observer.disconnect();
      };
   }, []);

   const handlePointerDownFast = (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragState.current = { ...dragState.current, fast: true, activePointerId: e.pointerId };
      setLocalTime(curr);
      onScrubStart();
      
      if (!fastRef.current || dur <= 0) return;
      const rect = fastRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const t = pct * dur;
      setLocalTime(t);
      setTime(t, true);
   };

   const handlePointerDownSlow = (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragState.current = { ...dragState.current, slow: true, startX: e.clientX, startTime: curr, activePointerId: e.pointerId };
      setLocalTime(curr);
      onScrubStart();
   };

   const handlePointerMove = (e: React.PointerEvent) => {
      if (dragState.current.activePointerId !== e.pointerId) return;
      const state = dragState.current;
      if (!state.fast && !state.slow) return;

      // DIAGNÓSTICO DEL BUG RESUELTO:
      // Anteriormente, if (rafRef.current) cancelAnimationFrame(rafRef.current) RECHAZABA el RAF en cada movimiento del puntero.
      // Dado que los ratones/pantallas arrojan eventos `pointermove` a >120Hz, el RAF (60Hz) se cancelaba perpetuamente y el vídeo NUNCA se sincronizaba hasta frenar en seco.
      // SOLUCIÓN: Solo guardamos el dato real y NO cancelamos el callback en curso; si la ventana está despejada, despachamos el cuadro.
      pendingClientX.current = e.clientX;

      if (!rafRef.current) {
         rafRef.current = requestAnimationFrame(() => {
            // Liberamos el ticket inmediatamente para que se emita otro frame el ciclo siguiente y nada se atonte
            rafRef.current = null;
            
            const clientX = pendingClientX.current;
            if (clientX === null) return;

            if (state.fast && fastRef.current && dur > 0) {
               const rect = fastRef.current.getBoundingClientRect();
               const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
               const t = pct * dur;
               setLocalTime(t);
               setTime(t, true);
            } else if (state.slow) {
               const timeDelta = -(clientX - state.startX) / PIXELS_PER_SECOND;
               const newTime = Math.max(0, Math.min(dur, state.startTime + timeDelta));
               setLocalTime(newTime);
               setTime(newTime, true);
            }
         });
      }
   };

   const handlePointerUp = (e: React.PointerEvent) => {
      if (dragState.current.activePointerId === e.pointerId) {
         if (e.currentTarget.hasPointerCapture(e.pointerId)) {
             e.currentTarget.releasePointerCapture(e.pointerId);
         }
         dragState.current = { ...dragState.current, fast: false, slow: false, activePointerId: null };
         setLocalTime(null);
         pendingClientX.current = null;
         
         if (rafRef.current) cancelAnimationFrame(rafRef.current);
         rafRef.current = null;
         
         onScrubEnd();
      }
   };

   const activeTime = localTime !== null ? localTime : curr;
   const progress = dur > 0 ? (activeTime / dur) * 100 : 0;
   const numPatterns = Math.ceil(containerWidth / PATTERN_WIDTH) + 3;
   const scrollOffset = (activeTime * PIXELS_PER_SECOND) % PATTERN_WIDTH;

   return (
      <div className="flex flex-col w-full select-none relative group mb-1 touch-none">
         <div className="flex justify-between items-end mb-1.5 px-0.5">
            <span className="text-[10px] text-neutral-500 uppercase font-black tracking-widest">{label || (isSecondary ? 'CAM B' : 'CAM A')}</span>
            <div className="font-mono text-sm font-bold text-orange-500 tabular-nums">{activeTime.toFixed(3)}s</div>
         </div>

         {/* Fast Scrubber */}
         <div
            ref={fastRef}
            onPointerDown={handlePointerDownFast}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="relative h-2.5 w-full cursor-pointer flex items-center bg-neutral-900 rounded-full mb-1.5 overflow-hidden touch-none"
         >
            <div className="absolute h-full bg-neutral-700 rounded-full" style={{ width: `${progress}%` }}></div>
            <div className="absolute inset-0 hover:bg-white/5 transition-colors"></div>
         </div>

         {/* Slow Precision Ruler */}
         <div
            ref={slowRef}
            onPointerDown={handlePointerDownSlow}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="relative h-12 w-full bg-black border-y border-neutral-900 overflow-hidden flex items-center justify-center cursor-default hover:cursor-grab active:cursor-grabbing touch-none"
         >
            <div className="flex absolute top-0 bottom-0 items-center left-1/2 opacity-40" style={{ transform: `translateX(calc(-50% - ${scrollOffset}px))` }}>
               <div className="flex" style={{ width: numPatterns * PATTERN_WIDTH, justifyContent: 'center' }}>
                  {Array.from({ length: numPatterns * TICKS_PER_GROUP }).map((_, i) => (
                     <div key={i} style={{ width: TICK_GAP }} className="flex justify-center items-end h-full flex-shrink-0 pb-2">
                        <div className={`w-[1.5px] bg-neutral-500 ${i % TICKS_PER_GROUP === 0 ? 'h-5 bg-neutral-300' : 'h-2'}`}></div>
                     </div>
                  ))}
               </div>
            </div>
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-orange-600 z-10 shadow-[0_0_15px_rgba(234,88,12,0.8)]"></div>
            <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-black to-transparent z-10"></div>
            <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-black to-transparent z-10"></div>
         </div>
      </div>
   );
};



interface VideoAnalyzerProps {
   video: VideoFile;
   targetUserId: string;
   onBack: () => void;
   usage: UserUsage | null;
   limits: UserLimits;
   onIncrementUsage?: () => Promise<void>;
   language: Language;
   onNavigate: (screen: Screen) => void;
   userProfile?: UserProfile;
}
// Helper Component for Zoom Controls
const ZoomControls = ({ zoom, setZoom, setPan, placement = 'bottom-right', hasBottomScrubber = false }: {
   zoom: number,
   setZoom: React.Dispatch<React.SetStateAction<number>>,
   setPan: React.Dispatch<React.SetStateAction<{ x: number, y: number }>>,
   placement?: 'bottom-right' | 'top-right' | 'bottom-left' | 'top-left',
   hasBottomScrubber?: boolean // When true, position higher on mobile to avoid scrubber overlap
}) => {
   // Determine position classes based on placement and mobile scrubber
   const getPositionClass = () => {
      if (placement === 'top-right') return 'top-4 right-4';
      if (placement === 'top-left') return 'top-4 left-4';
      if (placement === 'bottom-left') {
         return hasBottomScrubber
            ? 'bottom-24 left-4 md:bottom-4' // Higher on mobile when scrubber present
            : 'bottom-4 left-4';
      }
      // bottom-right (default)
      return hasBottomScrubber
         ? 'bottom-24 right-4 md:bottom-4' // Higher on mobile when scrubber present
         : 'bottom-4 right-4';
   };

   return (
      <div className={`absolute z-40 flex flex-col gap-2 bg-black/60 backdrop-blur-md rounded-xl p-1 border border-white/10 ${getPositionClass()}`}
         onMouseDown={(e) => e.stopPropagation()} // Prevent pan start when clicking controls
         onTouchStart={(e) => e.stopPropagation()}
      >
         <button onClick={() => { setZoom(z => Math.min(4, z + 0.5)); }} className="p-2 text-white hover:bg-white/10 rounded-lg"><ZoomIn size={20} /></button>
         <span className="text-[10px] text-center font-mono text-neutral-400">{Math.round(zoom * 100)}%</span>
         <button onClick={() => { setZoom(z => Math.max(1, z - 0.5)); setPan({ x: 0, y: 0 }); }} className="p-2 text-white hover:bg-white/10 rounded-lg"><ZoomOut size={20} /></button>
      </div>
   );
};

export const VideoAnalyzer: React.FC<VideoAnalyzerProps> = ({ video, targetUserId, onBack, usage, limits, onIncrementUsage, language, onNavigate, userProfile }) => {
   const t = ANALYZER_TEXTS[language] || ANALYZER_TEXTS.es;

   const [currentTime, setCurrentTime] = useState(0);
   const [duration, setDuration] = useState(0);
   const [playbackRate, setPlaybackRate] = useState(1);
   const [isPlaying, setIsPlaying] = useState(false);
   const [isVertical, setIsVertical] = useState(false); // Track if primary video is vertical
   const [isScrubbing, setIsScrubbing] = useState(false); // Track dragging state
   const lastSeekTimeRef = useRef<number>(0); // Throttle video seeks during scrubbing

   // Zoom & Pan State
   // Zoom & Pan State (Independent for each video)
   const [zoom1, setZoom1] = useState(1);
   const [pan1, setPan1] = useState({ x: 0, y: 0 });
   const [zoom2, setZoom2] = useState(1);
   const [pan2, setPan2] = useState({ x: 0, y: 0 });
   const [activePanTarget, setActivePanTarget] = useState<0 | 1 | 2>(0);
   const [startPan, setStartPan] = useState({ x: 0, y: 0 });
   const [aspectRatio1, setAspectRatio1] = useState<number | undefined>(undefined);
   const [aspectRatio2, setAspectRatio2] = useState<number | undefined>(undefined);

   // Comparison State
   const [compareVideo, setCompareVideo] = useState<VideoFile | null>(null);
   const [compareTime, setCompareTime] = useState(0);
   const [compareDuration, setCompareDuration] = useState(0);
   const [isSynced, setIsSynced] = useState(false);
   const [syncOffset, setSyncOffset] = useState(0);
   const compareInputRef = useRef<HTMLInputElement>(null);
   const videoRef2 = useRef<HTMLVideoElement>(null);

   // Chat State
   const [isChatOpen, setIsChatOpen] = useState(false);
   const [chatInput, setChatInput] = useState('');
   const [chatMessages, setChatMessages] = useState<ChatMessage[]>([{ id: 'intro', role: 'model', text: t.chatIntro, timestamp: new Date() }]);
   const [isChatLoading, setIsChatLoading] = useState(false);
   const [videoContext, setVideoContext] = useState<VideoContextDoc | null>(null);
   const [videoContextError, setVideoContextError] = useState<string | null>(null);
   const [chatSessionId, setChatSessionId] = useState<string | null>(null);

   const [videoLoadState, setVideoLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
   const isVideoLoaded = videoLoadState === 'ready';
   const [videoError, setVideoError] = useState<string | null>(null);
   const videoRef = useRef<HTMLVideoElement>(null);
   const canvasRef1 = useRef<HTMLCanvasElement>(null);
   const canvasRef2 = useRef<HTMLCanvasElement>(null);
   const wrapperRef = useRef<HTMLDivElement>(null);

   // Drawing State
   const [isDrawingMode, setIsDrawingMode] = useState(false);
   const [activeTool, setActiveTool] = useState<'pen' | 'eraser'>('pen'); // New Tool State
   const [isDrawing, setIsDrawing] = useState(false);
   const [activeDrawingTarget, setActiveDrawingTarget] = useState<1 | 2>(1);
   const [drawShape, setDrawShape] = useState<'free' | 'line'>('free');
   const [selectedColor, setSelectedColor] = useState(DRAWING_COLORS[0].hex);
   const [drawings1, setDrawings1] = useState<Line[]>([]);
   const [drawings2, setDrawings2] = useState<Line[]>([]);

   // Pose Detection State
   const [isPoseEnabled, setIsPoseEnabled] = useState(false);
   const poseCanvasRef = useRef<HTMLCanvasElement>(null);
   const poseCanvasRef2 = useRef<HTMLCanvasElement>(null); // For comparison video
   const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0, left: 0, top: 0 });
   // Single pose detection hook that handles both videos sequentially
   const { landmarks, landmarks2, isLoading: isPoseLoading, isReady: isPoseReady, error: poseError } = usePoseDetection(
      videoRef,
      isPoseEnabled,
      compareVideo ? videoRef2 : null
   );

   const activeUrl = video.url || video.remoteUrl || "";
   const messagesUsed = usage?.chatCount || 0;
   const chatLimit = limits?.maxChatMessagesPerMonth === 'unlimited' ? Infinity : (limits?.maxChatMessagesPerMonth as number || 0);
   const isLimitReached = messagesUsed >= chatLimit;
   const contextTexts = VIDEO_CONTEXT_TEXTS[language] || VIDEO_CONTEXT_TEXTS.es;
   const contextBootstrapRef = useRef(false);

   // Check if user can compare videos (Pro/Premium only)
   const canCompare = limits?.canCompareVideos ?? false;

   // Upgrade modal for compare feature
   const [showUpgradeModal, setShowUpgradeModal] = useState(false);

   // First-time Gemini notification
   const [showGeminiTip, setShowGeminiTip] = useState(() => {
      const hasSeenTip = localStorage.getItem('coachai_gemini_tip_seen');
      return !hasSeenTip;
   });

   const dismissGeminiTip = () => {
      setShowGeminiTip(false);
      localStorage.setItem('coachai_gemini_tip_seen', 'true');
   };

   // First-time Compare Video notification (only for Pro/Premium users)
   const [showCompareTip, setShowCompareTip] = useState(() => {
      if (!canCompare) return false;
      const hasSeenTip = localStorage.getItem('coachai_compare_tip_seen');
      return !hasSeenTip;
   });

   const dismissCompareTip = () => {
      setShowCompareTip(false);
      localStorage.setItem('coachai_compare_tip_seen', 'true');
   };

   // First-time Sync notification (shows after user adds compare video)
   const [showSyncTip, setShowSyncTip] = useState(false);
   const [hasSeenSyncTip, setHasSeenSyncTip] = useState(() => {
      return localStorage.getItem('coachai_sync_tip_seen') === 'true';
   });

   const dismissSyncTip = () => {
      setShowSyncTip(false);
      setHasSeenSyncTip(true);
      localStorage.setItem('coachai_sync_tip_seen', 'true');
   };

   // Show sync tip when user first adds a compare video
   useEffect(() => {
      if (compareVideo && !hasSeenSyncTip && canCompare) {
         setShowSyncTip(true);
      }
   }, [compareVideo, hasSeenSyncTip, canCompare]);

   useEffect(() => {
      setVideoLoadState('loading');
      setVideoError(null);
      setCurrentTime(0);
      setVideoContext(null);
      setVideoContextError(null);
      setChatSessionId(null);
      contextBootstrapRef.current = false;
      if (!activeUrl) {
         setVideoError("Error: URL de video no encontrada.");
         setVideoLoadState('error');
      }

      // Check if video is already ready (e.g., from cache)
      if (videoRef.current && videoRef.current.readyState >= 2) {
         setVideoLoadState('ready');
         setDuration(videoRef.current.duration);
         setIsVertical(videoRef.current.videoHeight > videoRef.current.videoWidth);
      }
   }, [video.id, activeUrl]);

   const triggerVideoContextPreparation = useCallback((force: boolean = false) => {
      if (!targetUserId || !video.id || !activeUrl) return;
      if (contextBootstrapRef.current && !force) return;

      contextBootstrapRef.current = true;
      setVideoContextError(null);

      void VideoIntelligenceService.prepareVideoContext({
         userId: targetUserId,
         videoId: video.id,
         videoName: video.name,
         remoteUrl: video.remoteUrl || activeUrl,
         language,
         userProfile,
         force,
      }).catch((error) => {
         contextBootstrapRef.current = false;
         setVideoContextError(error instanceof Error ? error.message : 'Video context processing failed.');
      });
   }, [activeUrl, language, targetUserId, userProfile, video.id, video.name, video.remoteUrl]);

   useEffect(() => {
      if (!targetUserId || !video.id) return;
      const unsubscribe = VideoIntelligenceService.subscribeToVideoContext(targetUserId, video.id, (context) => {
         setVideoContext(context);
         if (context?.status === 'ready' || context?.status === 'partial') {
            contextBootstrapRef.current = true;
         }
      });

      return unsubscribe;
   }, [targetUserId, video.id]);

   useEffect(() => {
      if (!activeUrl) return;
      if (!videoContext) {
         triggerVideoContextPreparation(false);
      }
   }, [activeUrl, triggerVideoContextPreparation, videoContext]);

   // ÚNICA FUENTE DE VERDAD PARA ESTADO DE CARGA
   const handleLoadStart = () => setVideoLoadState('loading');

   const handleLoadedData = () => {
      setVideoLoadState('ready');
      if (videoRef.current) {
         setDuration(videoRef.current.duration);
         const ratio = videoRef.current.videoWidth / videoRef.current.videoHeight;
         setAspectRatio1(ratio);
         setIsVertical(videoRef.current.videoHeight > videoRef.current.videoWidth);
      }
   };

   // Respaldos extra por si el navegador prioriza o retrasa eventos
   const handleCanPlay = () => setVideoLoadState('ready');
   const handlePlaying = () => setVideoLoadState('ready');

   const handleError = () => {
      setVideoError(t.connectionError || "Error Loading Video");
      setVideoLoadState('error');
   };

   // --- SYNC LOGIC ---
   const toggleSync = () => {
      if (!isSynced) {
         // When activating, calculate offset based on current positions
         // This allows the user to align the videos manually first, then lock them.
         const t1 = videoRef.current?.currentTime || 0;
         const t2 = videoRef2.current?.currentTime || 0;
         setSyncOffset(t2 - t1);
      }
      setIsSynced(!isSynced);
   };

   const handleTimeUpdatePrimary = () => {
      if (!videoRef.current) return;
      const t1 = videoRef.current.currentTime;

      // Do not update React state while dragging to prevent stutter/jank loops
      if (!isScrubbing) {
         setCurrentTime(t1);
      }

      if (isSynced && videoRef2.current) {
         const targetTime = t1 + syncOffset;

         if (isPlaying && !isScrubbing) {
            // SMOOTH SYNC LOGIC:
            // When playing, we only force the second video to seek if the drift is significant (> 0.15s).
            // Forcing seek on every frame causes stutter ("coscas").
            const currentT2 = videoRef2.current.currentTime;
            const drift = Math.abs(currentT2 - targetTime);
            if (drift > 0.15) {
               videoRef2.current.currentTime = targetTime;
            }
         } else {
            // HARD SYNC:
            // When scrubbing or paused, we want exact frame alignment.
            videoRef2.current.currentTime = targetTime;
         }
      }
   };

   const handleTimeUpdateSecondary = () => {
      if (videoRef2.current && !isScrubbing) {
         setCompareTime(videoRef2.current.currentTime);
      }
   };

   // --- CANVAS DRAWING LOGIC ---
   const renderDrawings = (canvas: HTMLCanvasElement | null, lines: Line[], referenceVideo: HTMLVideoElement | null) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');

      let width = canvas.width;
      let height = canvas.height;

      // Sync canvas resolution with video resolution if available
      if (referenceVideo && referenceVideo.videoWidth > 0 && referenceVideo.videoHeight > 0) {
         if (canvas.width !== referenceVideo.videoWidth || canvas.height !== referenceVideo.videoHeight) {
            canvas.width = referenceVideo.videoWidth;
            canvas.height = referenceVideo.videoHeight;
         }
         width = referenceVideo.videoWidth;
         height = referenceVideo.videoHeight;
      } else {
         // Fallback to offsetWidth if video not ready (though this shouldn't happen while drawing)
         const layoutWidth = canvas.offsetWidth;
         const layoutHeight = canvas.offsetHeight;
         if (layoutWidth > 0 && layoutHeight > 0 && (canvas.width !== layoutWidth || canvas.height !== layoutHeight)) {
            canvas.width = layoutWidth;
            canvas.height = layoutHeight;
            width = layoutWidth;
            height = layoutHeight;
         }
      }

      if (width === 0 || height === 0 || !ctx) return;

      // Clear
      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Calculate visual scale factor to normalize stroke width
      // We want the visual stroke to be ~4px regardless of video resolution
      const layoutWidth = canvas.offsetWidth;
      const scaleFactor = layoutWidth > 0 ? (width / layoutWidth) : 1;
      ctx.lineWidth = 4 * scaleFactor;

      // Draw all lines
      lines.forEach(line => {
         ctx.beginPath();
         ctx.strokeStyle = line.color;
         if (line.points.length > 0) {
            ctx.moveTo(line.points[0].x, line.points[0].y);
            line.points.forEach(p => ctx.lineTo(p.x, p.y));
         }
         ctx.stroke();
      });
   };

   useEffect(() => {
      renderDrawings(canvasRef1.current, drawings1, videoRef.current);
   }, [drawings1, zoom1, pan1, isVideoLoaded, compareVideo]);

   useEffect(() => {
      renderDrawings(canvasRef2.current, drawings2, videoRef2.current);
   }, [drawings2, zoom2, pan2, compareVideo, isSynced]);

   // --- POSE CANVAS DRAWING LOGIC ---
   // Update video dimensions for pose canvas positioning
   useEffect(() => {
      const updateVideoDimensions = () => {
         const video = videoRef.current;
         const wrapper = wrapperRef.current;
         if (!video || !wrapper) return;

         // Calculate actual video content dimensions handling object-fit: contain
         const videoRatio = video.videoWidth / video.videoHeight;
         const elementRatio = video.clientWidth / video.clientHeight;

         let renderWidth = video.clientWidth;
         let renderHeight = video.clientHeight;
         let renderLeft = 0;
         let renderTop = 0;

         if (elementRatio > videoRatio) {
            // Video is pillarboxed (black bars on sides)
            renderWidth = video.clientHeight * videoRatio;
            renderLeft = (video.clientWidth - renderWidth) / 2;
         } else {
            // Video is letterboxed (black bars top/bottom)
            renderHeight = video.clientWidth / videoRatio;
            renderTop = (video.clientHeight - renderHeight) / 2;
         }

         const wrapperRect = wrapper.getBoundingClientRect();
         const videoRect = video.getBoundingClientRect(); // Position relative to viewport

         // Calculate position relative to wrapper
         // We add the offset within the video element (renderLeft/Top) to the video element's position
         const finalLeft = (videoRect.left - wrapperRect.left) + renderLeft;
         const finalTop = (videoRect.top - wrapperRect.top) + renderTop;

         setVideoDimensions({
            width: renderWidth,
            height: renderHeight,
            left: finalLeft,
            top: finalTop,
         });
      };

      updateVideoDimensions();
      window.addEventListener('resize', updateVideoDimensions);
      // Also update on orientation change for mobile
      window.addEventListener('orientationchange', updateVideoDimensions);

      let observer: ResizeObserver | null = null;
      if (wrapperRef.current) {
         observer = new ResizeObserver(() => updateVideoDimensions());
         observer.observe(wrapperRef.current);
      }

      return () => {
         window.removeEventListener('resize', updateVideoDimensions);
         window.removeEventListener('orientationchange', updateVideoDimensions);
         if (observer) observer.disconnect();
      };
   }, [isVideoLoaded, compareVideo, zoom1, pan1, zoom2, pan2]);

   useEffect(() => {
      const poseCanvas = poseCanvasRef.current;
      const video = videoRef.current;
      if (!poseCanvas || !video) return;

      // Get parent container dimensions (since canvas is inset-0)
      const parent = poseCanvas.parentElement;
      if (!parent) return;

      const containerWidth = parent.clientWidth;
      const containerHeight = parent.clientHeight;

      if (containerWidth <= 0 || containerHeight <= 0) return;

      // Set canvas internal resolution to match container
      poseCanvas.width = containerWidth;
      poseCanvas.height = containerHeight;

      const ctx = poseCanvas.getContext('2d');
      if (!ctx) return;

      // Clear previous frame
      ctx.clearRect(0, 0, poseCanvas.width, poseCanvas.height);

      // Draw pose if landmarks exist and pose is enabled
      if (landmarks && isPoseEnabled && video.videoWidth > 0 && video.videoHeight > 0) {
         // Get the actual rendered size of the video element (not the container)
         // The video uses object-contain, so the rendered content may be smaller than clientWidth/Height
         const videoElementWidth = video.clientWidth;
         const videoElementHeight = video.clientHeight;

         // Calculate where the video content actually sits within the video element
         const videoRatio = video.videoWidth / video.videoHeight;
         const elementRatio = videoElementWidth / videoElementHeight;

         let contentWidth = videoElementWidth;
         let contentHeight = videoElementHeight;
         let videoContentOffsetX = 0;
         let videoContentOffsetY = 0;

         if (elementRatio > videoRatio) {
            // Pillarboxing (black bars on sides of video element)
            contentWidth = videoElementHeight * videoRatio;
            videoContentOffsetX = (videoElementWidth - contentWidth) / 2;
         } else {
            // Letterboxing (black bars top/bottom of video element)
            contentHeight = videoElementWidth / videoRatio;
            videoContentOffsetY = (videoElementHeight - contentHeight) / 2;
         }

         // Now calculate where the video element itself is positioned within the canvas
         // The canvas covers the full parent container (inset-0)
         // But the video element is centered within the parent via flexbox
         const videoRect = video.getBoundingClientRect();
         const canvasRect = poseCanvas.getBoundingClientRect();

         // Offset from canvas to video element
         const videoElementOffsetX = videoRect.left - canvasRect.left;
         const videoElementOffsetY = videoRect.top - canvasRect.top;

         // Total offset from canvas origin to video content
         const totalOffsetX = videoElementOffsetX + videoContentOffsetX;
         const totalOffsetY = videoElementOffsetY + videoContentOffsetY;

         // Draw pose with correct offset
         drawPoseOnCanvasWithOffset(ctx, landmarks, contentWidth, contentHeight, totalOffsetX, totalOffsetY);
      }
   }, [landmarks, isPoseEnabled, isVideoLoaded, currentTime, zoom1, pan1]);

   // --- POSE CANVAS DRAWING LOGIC FOR COMPARISON VIDEO ---
   useEffect(() => {
      const poseCanvas = poseCanvasRef2.current;
      const video = videoRef2.current;
      if (!poseCanvas || !video || !compareVideo) return;

      // Get parent container dimensions
      const parent = poseCanvas.parentElement;
      if (!parent) return;

      const containerWidth = parent.clientWidth;
      const containerHeight = parent.clientHeight;

      if (containerWidth <= 0 || containerHeight <= 0) return;

      // Set canvas internal resolution
      poseCanvas.width = containerWidth;
      poseCanvas.height = containerHeight;

      const ctx = poseCanvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, poseCanvas.width, poseCanvas.height);

      if (landmarks2 && isPoseEnabled && video.videoWidth > 0 && video.videoHeight > 0) {
         const videoElementWidth = video.clientWidth;
         const videoElementHeight = video.clientHeight;

         const videoRatio = video.videoWidth / video.videoHeight;
         const elementRatio = videoElementWidth / videoElementHeight;

         let contentWidth = videoElementWidth;
         let contentHeight = videoElementHeight;
         let videoContentOffsetX = 0;
         let videoContentOffsetY = 0;

         if (elementRatio > videoRatio) {
            contentWidth = videoElementHeight * videoRatio;
            videoContentOffsetX = (videoElementWidth - contentWidth) / 2;
         } else {
            contentHeight = videoElementWidth / videoRatio;
            videoContentOffsetY = (videoElementHeight - contentHeight) / 2;
         }

         const videoRect = video.getBoundingClientRect();
         const canvasRect = poseCanvas.getBoundingClientRect();

         const videoElementOffsetX = videoRect.left - canvasRect.left;
         const videoElementOffsetY = videoRect.top - canvasRect.top;

         const totalOffsetX = videoElementOffsetX + videoContentOffsetX;
         const totalOffsetY = videoElementOffsetY + videoContentOffsetY;

         drawPoseOnCanvasWithOffset(ctx, landmarks2, contentWidth, contentHeight, totalOffsetX, totalOffsetY);
      }
   }, [landmarks2, isPoseEnabled, compareVideo, compareTime, zoom2, pan2]);

   const getCanvasCoordinates = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement | null) => {
      if (!canvas) return { x: 0, y: 0 };

      const rect = canvas.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

      // Calculate coordinates relative to the actual drawing surface (bitmap)
      // We calculate the scale factor between the visual size (rect) and internal size (canvas.width)
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      return {
         x: (clientX - rect.left) * scaleX,
         y: (clientY - rect.top) * scaleY
      };
   };

   const handleMouseDown = (e: React.MouseEvent | React.TouchEvent, target: 1 | 2 = 1) => {
      if (isDrawingMode) {
         setIsDrawing(true);
         setActiveDrawingTarget(target);

         const currentCanvas = target === 1 ? canvasRef1.current : canvasRef2.current;
         const { x, y } = getCanvasCoordinates(e, currentCanvas);

         if (activeTool === 'pen') {
            // Start a new line
            const newLine = { id: Date.now().toString(), points: [{ x, y }], color: selectedColor, isStraight: drawShape === 'line' };
            if (target === 1) setDrawings1(prev => [...prev, newLine]);
            else setDrawings2(prev => [...prev, newLine]);
         } else if (activeTool === 'eraser') {
            eraseAt(x, y, target);
         }
      } else {
         const currentZoom = target === 1 ? zoom1 : zoom2;
         const currentPan = target === 1 ? pan1 : pan2;

         if (currentZoom > 1) {
            // Start Panning
            setActivePanTarget(target);
            const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
            const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
            setStartPan({ x: clientX - currentPan.x, y: clientY - currentPan.y });
         }
      }
   };

   const eraseAt = (x: number, y: number, target: 1 | 2) => {
      const ERASE_RADIUS = 40; // Increased pixel radius for easier erasing
      const filterFunc = (line: Line) => !line.points.some(p => Math.hypot(p.x - x, p.y - y) < ERASE_RADIUS);

      if (target === 1) setDrawings1(prev => prev.filter(filterFunc));
      else setDrawings2(prev => prev.filter(filterFunc));
   }

   const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
      if (isDrawing && isDrawingMode) {
         const target = activeDrawingTarget;
         const currentCanvas = target === 1 ? canvasRef1.current : canvasRef2.current;
         const { x, y } = getCanvasCoordinates(e, currentCanvas);

         if (activeTool === 'pen') {
            const updateDrawings = (prev: Line[]) => {
               const lastLine = prev[prev.length - 1];
               if (!lastLine) return prev;

               if (lastLine.isStraight) {
                  const startPoint = lastLine.points[0];
                  const newLine = { ...lastLine, points: [startPoint, { x, y }] };
                  return [...prev.slice(0, -1), newLine];
               } else {
                  const newLine = { ...lastLine, points: [...lastLine.points, { x, y }] };
                  return [...prev.slice(0, -1), newLine];
               }
            };

            if (target === 1) setDrawings1(updateDrawings);
            else setDrawings2(updateDrawings);

         } else if (activeTool === 'eraser') {
            eraseAt(x, y, target);
         }
      } else if (activePanTarget !== 0) {
         const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
         const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
         const newPan = {
            x: clientX - startPan.x,
            y: clientY - startPan.y
         };

         if (activePanTarget === 1) setPan1(newPan);
         else setPan2(newPan);
      }
   };

   const handleMouseUp = () => {
      setIsDrawing(false);
      setActivePanTarget(0);
   };

   const togglePlay = () => {
      if (isPlaying) {
         videoRef.current?.pause();
         videoRef2.current?.pause();
      } else {
         videoRef.current?.play();
         // Play both videos when comparing, regardless of sync state
         if (compareVideo) videoRef2.current?.play();
      }
      setIsPlaying(!isPlaying);
   };

   const seek = (time: number, isDragging: boolean = false) => {
      // Solo actualizamos el estado completo (con rerenders pesados) fuera del scrubbing rápido
      if (!isDragging) {
         setCurrentTime(time);
      }

      if (!videoRef.current) return;

      // Scrubbing de vídeo a máximo rendimiento: actualización directa al nodo del DOM sin throttling ni lags asíncronos.
      videoRef.current.currentTime = time;
      if (compareVideo && isSynced && videoRef2.current) {
         videoRef2.current.currentTime = time + syncOffset;
      }
   };

   // Final seek when scrubbing ends to ensure we land exactly on the target time and sync global state
   const flushPendingSeek = useCallback(() => {
      if (videoRef.current) {
         setCurrentTime(videoRef.current.currentTime);
      }
      if (videoRef2.current) {
         setCompareTime(videoRef2.current.currentTime);
      }
   }, []);

   const seek2 = (time: number, isDragging: boolean = false) => {
      if (!isDragging) {
         setCompareTime(time);
      }

      if (videoRef2.current) {
         videoRef2.current.currentTime = time;
         if (isSynced && videoRef.current) {
            setSyncOffset(time - videoRef.current.currentTime);
         }
      }
   };

   const frameStep = (direction: 'prev' | 'next') => {
      const dt = 1 / 30;
      const mod = direction === 'next' ? dt : -dt;
      if (videoRef.current) {
         videoRef.current.currentTime += mod;
         setCurrentTime(videoRef.current.currentTime);
         if (isSynced && videoRef2.current) {
            videoRef2.current.currentTime = videoRef.current.currentTime + syncOffset;
         }
      }
   };

   const submitContextualQuestion = async (questionText: string, explicitMode?: VideoQuestionMode) => {
      if (!questionText.trim() || isLimitReached) return;

      const mode = explicitMode || inferQuestionMode(questionText);
      const questionTimestamp = mode === 'summary' ? null : currentTime;
      const newMsg: ChatMessage = {
         id: Date.now().toString(),
         role: 'user',
         text: questionText,
         timestamp: new Date(),
         activeTimestampSeconds: questionTimestamp,
         mode,
      };

      setChatMessages(prev => [...prev, newMsg]);
      setChatInput('');
      setIsChatLoading(true);

      if (!videoContext || videoContext.status === 'failed') {
         triggerVideoContextPreparation(videoContext?.status === 'failed');
      }

      try {
         const biomechanicsPrompt = getBiomechanicalContext(userProfile?.sport, userProfile?.discipline);
         const augmentedPrompt = biomechanicsPrompt
            ? `${biomechanicsPrompt}\n\n[USER QUESTION]: ${questionText}`
            : questionText;

         const response = await VideoIntelligenceService.askVideoQuestion({
            userId: targetUserId,
            videoId: video.id,
            sessionId: chatSessionId,
            message: augmentedPrompt,
            currentTimeSeconds: questionTimestamp,
            durationSeconds: duration || null,
            mode,
            language,
            chatHistory: chatMessages,
            userProfile,
            poseSnapshot: buildPoseSnapshot(landmarks),
            source: activeUrl,
            fallbackVideoElement: videoRef.current,
         });

         setChatSessionId(response.sessionId);
         setChatMessages(prev => [...prev, {
            id: `${Date.now()}-model`,
            role: 'model',
            text: response.answer,
            timestamp: new Date(),
            contextTrace: response.trace,
            contextSummary: formatContextSourcesLabel(response.trace.contextSources, language),
            activeTimestampSeconds: questionTimestamp,
            mode,
         }]);

         await onIncrementUsage?.();
      } catch (error) {
         console.error('[VideoAnalyzer] Contextual question failed', error);
         setChatMessages(prev => [...prev, {
            id: `${Date.now()}-error`,
            role: 'model',
            text: t.connectionError,
            timestamp: new Date(),
            activeTimestampSeconds: questionTimestamp,
            mode,
         }]);
      } finally {
         setIsChatLoading(false);
      }
   };

   const handleSendChat = async (e?: React.FormEvent) => {
      e?.preventDefault();
      await submitContextualQuestion(chatInput);
   };

   const handleCompareClick = () => {
      compareInputRef.current?.click();
   };

   const handleCompareUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
         setCompareVideo({
            id: 'compare_local',
            url: URL.createObjectURL(file),
            name: file.name,
            date: new Date().toLocaleDateString(),
            isLocal: true
         });
         setIsSynced(false); // Reset sync on new video
         setSyncOffset(0);
      }
   };

   const contextBadge = getVideoContextBadge(videoContext, contextTexts);

   return (
      <div className="flex h-full bg-black relative overflow-hidden select-none touch-none">
         {/* Top Bar */}
         <div className="absolute top-0 left-0 right-0 z-30 flex flex-col bg-gradient-to-b from-black/95 to-transparent pointer-events-none">
            {/* Primary Toolbar */}
            <div className="p-4 flex justify-between items-center pointer-events-auto">
               <button onClick={onBack} className="p-3 bg-black/40 backdrop-blur-md rounded-full text-white border border-white/10 hover:bg-white/10"><ChevronLeft size={20} /></button>

               <div className="flex items-center gap-3">

                  {/* Drawing Tools (Integrated, visible only when active) */}
                  {isDrawingMode && (
                     <div className="flex items-center gap-2 bg-neutral-900/90 backdrop-blur-md border border-neutral-700 p-1.5 rounded-full animate-in slide-in-from-right-4 duration-300 shadow-xl mr-2">
                        {/* Colors */}
                        <div className="flex gap-1.5 pr-2 border-r border-white/10">
                           {DRAWING_COLORS.map(c => (
                              <button
                                 key={c.id}
                                 onClick={() => { setSelectedColor(c.hex); setActiveTool('pen'); }}
                                 className={`w-4 h-4 rounded-full border-[1.5px] transition-transform ${selectedColor === c.hex && activeTool === 'pen' ? 'border-white scale-125' : 'border-transparent hover:scale-110'}`}
                                 style={{ backgroundColor: c.hex }}
                              />
                           ))}
                        </div>

                        {/* Tools */}
                        <div className="flex gap-1">
                           <button
                              onClick={() => { setActiveTool('pen'); setDrawShape('free'); }}
                              className={`p-1.5 rounded-full transition-colors ${activeTool === 'pen' && drawShape === 'free' ? 'bg-white/20 text-white' : 'text-neutral-400 hover:text-white'}`}
                              title="Lápiz Libre"
                           >
                              <PenTool size={14} />
                           </button>
                           <button
                              onClick={() => { setActiveTool('pen'); setDrawShape('line'); }}
                              className={`p-1.5 rounded-full transition-colors ${activeTool === 'pen' && drawShape === 'line' ? 'bg-white/20 text-white' : 'text-neutral-400 hover:text-white'}`}
                              title="Línea Recta"
                           >
                              <Minus size={14} className="-rotate-45" />
                           </button>
                           <button
                              onClick={() => setActiveTool('eraser')}
                              className={`p-1.5 rounded-full transition-colors ${activeTool === 'eraser' ? 'bg-white/20 text-white' : 'text-neutral-400 hover:text-white'}`}
                              title="Goma de Borrar"
                           >
                              <Eraser size={14} />
                           </button>
                           <div className="w-px h-4 bg-white/10 mx-0.5 self-center"></div>
                           <button
                              onClick={() => { setDrawings1([]); setDrawings2([]); }}
                              className="p-1.5 text-red-400 hover:bg-red-900/30 rounded-full transition-colors"
                              title="Borrar Todo"
                           >
                              <Trash2 size={14} />
                           </button>
                        </div>
                     </div>
                  )}

                  <button
                     onClick={() => setIsDrawingMode(!isDrawingMode)}
                     className={`p-3 rounded-full border transition-all ${isDrawingMode ? 'bg-orange-600 border-orange-500 text-white' : 'bg-black/40 border-white/10 text-white hover:bg-white/10'}`}
                     title="Modo Lápiz"
                  >
                     <PenTool size={20} />
                  </button>

                  {/* Pose Detection Toggle */}
                  <button
                     onClick={() => setIsPoseEnabled(!isPoseEnabled)}
                     className={`p-3 rounded-full border transition-all relative ${poseError
                        ? 'bg-red-600 border-red-500 text-white'
                        : isPoseEnabled
                           ? 'bg-green-600 border-green-500 text-white'
                           : 'bg-black/40 border-white/10 text-white hover:bg-white/10'
                        }`}
                     title={poseError ? `Error: ${poseError}` : "Detección de Postura"}
                     disabled={isPoseLoading}
                  >
                     {isPoseLoading ? (
                        <Loader2 size={20} className="animate-spin" />
                     ) : poseError ? (
                        <X size={20} />
                     ) : (
                        <User size={20} />
                     )}
                  </button>

                  <div className="h-8 w-px bg-white/10 mx-1"></div>

                  {/* Compare Button with Tooltip */}
                  <div className="relative">
                     <button
                        onClick={() => {
                           if (canCompare) {
                              handleCompareClick();
                           } else {
                              setShowUpgradeModal(true);
                           }
                        }}
                        className={`p-3 rounded-full border transition-all relative ${compareVideo
                           ? 'bg-blue-600 border-blue-500 text-white'
                           : canCompare
                              ? 'bg-black/40 border-white/10 text-white hover:bg-white/10'
                              : 'bg-neutral-800/60 border-neutral-700 text-neutral-500 cursor-pointer'
                           }`}
                        title={canCompare ? "Comparar Vídeo" : "Función Pro/Premium"}
                     >
                        <Split size={20} />
                        {/* Lock badge for free users */}
                        {!canCompare && (
                           <div className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center">
                              <Lock size={10} className="text-white" />
                           </div>
                        )}
                     </button>

                     {/* First-time Compare Video Notification Tooltip (Pro/Premium only) */}
                     {showCompareTip && canCompare && !showGeminiTip && (
                        <div className="absolute top-14 right-0 bg-gradient-to-r from-blue-600 to-cyan-500 text-white p-4 rounded-xl shadow-2xl w-64 animate-in slide-in-from-top duration-300 z-50">
                           <div className="flex items-start gap-3">
                              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                                 <Split size={20} />
                              </div>
                              <div className="flex-1">
                                 <h4 className="font-bold text-sm mb-1">{t.compareTitle}</h4>
                                 <p className="text-xs text-white/80">{t.compareDesc}</p>
                              </div>
                              <button onClick={dismissCompareTip} className="text-white/60 hover:text-white">
                                 <X size={16} />
                              </button>
                           </div>
                           <div className="absolute -top-2 right-4 w-0 h-0 border-l-8 border-r-8 border-b-8 border-transparent border-b-blue-600"></div>
                        </div>
                     )}
                  </div>
                  <input type="file" ref={compareInputRef} className="hidden" accept="video/*" onChange={handleCompareUpload} />

                  {/* Sync Button with Tooltip (Only when comparing) */}
                  {compareVideo && (
                     <div className="relative">
                        <button
                           onClick={toggleSync}
                           className={`p-3 rounded-full border transition-all ${isSynced ? 'bg-green-600 border-green-500 text-white' : 'bg-black/40 border-white/10 text-white hover:bg-white/10'}`}
                           title="Sincronizar movimiento"
                        >
                           {isSynced ? <Link2 size={20} /> : <Unlink size={20} />}
                        </button>

                        {/* First-time Sync Notification Tooltip */}
                        {showSyncTip && (
                           <div className="absolute top-14 right-0 bg-gradient-to-r from-green-600 to-emerald-500 text-white p-4 rounded-xl shadow-2xl w-64 animate-in slide-in-from-top duration-300 z-50">
                              <div className="flex items-start gap-3">
                                 <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                                    <Link2 size={20} />
                                 </div>
                                 <div className="flex-1">
                                    <h4 className="font-bold text-sm mb-1">{t.syncTitle}</h4>
                                    <p className="text-xs text-white/80">{t.syncDesc}</p>
                                 </div>
                                 <button onClick={dismissSyncTip} className="text-white/60 hover:text-white">
                                    <X size={16} />
                                 </button>
                              </div>
                              <div className="absolute -top-2 right-4 w-0 h-0 border-l-8 border-r-8 border-b-8 border-transparent border-b-green-600"></div>
                           </div>
                        )}
                     </div>
                  )}

                  {/* Gemini Button with Tooltip */}
                  <div className="relative">
                     <button
                        onClick={() => setIsChatOpen(!isChatOpen)}
                        className={`p-3 rounded-full border transition-all ${isChatOpen ? 'bg-purple-600 border-purple-500 text-white' : 'bg-black/40 border-white/10 text-white hover:bg-white/10'}`}
                     >
                        {/* Gemini Logo SVG */}
                        <svg width="20" height="20" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                           <path d="M14 0C14 7.732 7.732 14 0 14C7.732 14 14 20.268 14 28C14 20.268 20.268 14 28 14C20.268 14 14 7.732 14 0Z" fill="currentColor" />
                        </svg>
                     </button>

                     {/* First-time Gemini Notification Tooltip */}
                     {showGeminiTip && (
                        <div className="absolute top-14 right-0 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 rounded-xl shadow-2xl w-64 animate-in slide-in-from-top duration-300 z-50">
                           <div className="flex items-start gap-3">
                              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                                 <svg width="24" height="24" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M14 0C14 7.732 7.732 14 0 14C7.732 14 14 20.268 14 28C14 20.268 20.268 14 28 14C20.268 14 14 7.732 14 0Z" fill="white" />
                                 </svg>
                              </div>
                              <div className="flex-1">
                                 <h4 className="font-bold text-sm mb-1">{t.geminiTitle}</h4>
                                 <p className="text-xs text-white/80">{t.geminiDesc}</p>
                              </div>
                              <button onClick={dismissGeminiTip} className="text-white/60 hover:text-white">
                                 <X size={16} />
                              </button>
                           </div>
                           <div className="absolute -top-2 right-4 w-0 h-0 border-l-8 border-r-8 border-b-8 border-transparent border-b-purple-600"></div>
                        </div>
                     )}
                  </div>

               </div>
            </div>
         </div>

         {/* Main Workspace */}
         <div className="flex-1 flex flex-col relative bg-black overflow-hidden min-w-0">

            {/* Video Container Area - Dynamic layout based on aspect ratio (Mobile) / Always SxS (Desktop) */}
            <div className={`flex-1 relative overflow-hidden flex ${compareVideo ? (isVertical ? 'flex-row gap-0.5 md:gap-0' : 'flex-col gap-0.5 md:flex-row md:gap-0') : 'items-center justify-center'} bg-black`}
               style={{ cursor: isDrawingMode ? (activeTool === 'eraser' ? 'cell' : 'crosshair') : 'default' }}
               onMouseDown={(e) => handleMouseDown(e, 1)} // Default to 1 if clicking background (though usually covered)
               onTouchStart={(e) => handleMouseDown(e, 1)}
               onMouseMove={handleMouseMove}
               onTouchMove={handleMouseMove}
               onMouseUp={handleMouseUp}
               onTouchEnd={handleMouseUp}
               onMouseLeave={handleMouseUp}
            >


               {/* Primary Video Container with its own scrubber on mobile */}
               <div className={`relative flex flex-col overflow-hidden ${compareVideo ? (isVertical ? 'w-1/2 h-full min-w-0' : 'flex-1 w-full min-h-0 md:w-1/2 md:h-full') : 'w-full h-full items-center justify-center'}`}
                  onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, 1); }}
                  onTouchStart={(e) => { e.stopPropagation(); handleMouseDown(e, 1); }}
                  style={{ cursor: isDrawingMode ? 'crosshair' : (zoom1 > 1 ? 'grab' : 'default') }}
               >
                  {/* Overlay Loader Premium - Única Fuente de Verdad */}
                   {videoLoadState === 'loading' && (
                      <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 pointer-events-none">
                         <div className="bg-black/80 p-4 rounded-2xl border border-white/5 shadow-2xl flex flex-col items-center gap-3">
                            <Loader2 size={40} className="animate-spin text-orange-500 drop-shadow-md" role="status" aria-busy="true" />
                         </div>
                      </div>
                   )}
                  <div
                     ref={!compareVideo ? wrapperRef : undefined}
                     className={`relative flex items-center justify-center flex-1 transition-transform duration-75 ease-linear ${!compareVideo ? 'w-full h-full' : 'p-4'}`}
                     style={{
                        transform: `scale(${zoom1}) translate(${pan1.x}px, ${pan1.y}px)`,
                     }}
                  >
                     {activeUrl && (
                        <div
                           className="relative max-w-full max-h-full shadow-2xl"
                           style={{
                              aspectRatio: aspectRatio1,
                              width: aspectRatio1 ? 'auto' : '100%',
                              height: aspectRatio1 ? 'auto' : '100%'
                           }}
                        >
                           <video
                              ref={videoRef}
                              src={activeUrl}
                              crossOrigin="anonymous"
                              className="w-full h-full object-contain pointer-events-none select-none block"
                              playsInline
                              onLoadedData={handleLoadedData}
                               onLoadStart={handleLoadStart}
                               onCanPlay={handleCanPlay}
                               onPlaying={handlePlaying}
                               onError={handleError}
                               onTimeUpdate={handleTimeUpdatePrimary}
                           />
                           {/* Pose Detection Canvas Overlay */}
                           {isPoseEnabled && (
                              <canvas
                                 ref={poseCanvasRef}
                                 className="absolute inset-0 z-10 pointer-events-none w-full h-full"
                              />
                           )}
                           {/* Drawing Canvas 1 */}
                           <canvas
                              ref={canvasRef1}
                              className="absolute inset-0 z-20 pointer-events-none w-full h-full"
                           />
                        </div>
                     )}
                  </div>

                  {activeUrl && (
                     /* Zoom Controls Video 1 */
                     <ZoomControls
                        zoom={zoom1}
                        setZoom={setZoom1}
                        setPan={setPan1}
                        placement={compareVideo && !isVertical ? 'top-right' : 'bottom-right'}
                        hasBottomScrubber={!!compareVideo && !isSynced}
                     />
                  )}

                  {/* Primary Video Scrubber - Only visible on mobile when comparing AND not synced */}
                  {compareVideo && !isSynced && (
                     <div className="md:hidden bg-black px-4 py-2">
                        <DualScrubber
                           curr={currentTime}
                           dur={duration}
                           setTime={seek}
                           onScrubStart={() => setIsScrubbing(true)}
                           onScrubEnd={() => { setIsScrubbing(false); flushPendingSeek(); }}
                           label="CAM A"
                        />
                     </div>
                  )}
               </div>

               {/* Comparison Video Container with its own scrubber on mobile */}
               {compareVideo && (
                  <div className={`relative flex flex-col overflow-hidden ${isVertical ? 'w-1/2 h-full min-w-0 border-l' : 'flex-1 w-full min-h-0 border-t md:w-1/2 md:h-full md:border-t-0 md:border-l'} border-white/10`}
                     onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, 2); }}
                     onTouchStart={(e) => { e.stopPropagation(); handleMouseDown(e, 2); }}
                     style={{ cursor: isDrawingMode ? 'crosshair' : (zoom2 > 1 ? 'grab' : 'default') }}
                  >
                     <div className="relative flex items-center justify-center flex-1 p-4"
                        style={{
                           transform: `scale(${zoom2}) translate(${pan2.x}px, ${pan2.y}px)`,
                        }}
                     >
                        <div
                           className="relative max-w-full max-h-full shadow-2xl"
                           style={{
                              aspectRatio: aspectRatio2,
                              width: aspectRatio2 ? 'auto' : '100%',
                              height: aspectRatio2 ? 'auto' : '100%'
                           }}
                        >
                           <video
                              ref={videoRef2}
                              src={compareVideo.url}
                              crossOrigin="anonymous"
                              className="w-full h-full object-contain pointer-events-none select-none block"
                              playsInline
                              onLoadedData={(e) => {
                                 setCompareDuration(e.currentTarget.duration);
                                 setAspectRatio2(e.currentTarget.videoWidth / e.currentTarget.videoHeight);
                              }}
                              onTimeUpdate={handleTimeUpdateSecondary}
                           />
                           {/* Pose Detection Canvas Overlay for Comparison Video */}

                           {isPoseEnabled && (
                              <canvas
                                 ref={poseCanvasRef2}
                                 className="absolute inset-0 z-10 pointer-events-none w-full h-full"
                              />
                           )}
                           {/* Drawing Canvas 2 */}
                           <canvas
                              ref={canvasRef2}
                              className="absolute inset-0 z-20 pointer-events-none w-full h-full"
                           />
                        </div>
                     </div>

                     {/* Zoom Controls Video 2 */}
                     <ZoomControls
                        zoom={zoom2}
                        setZoom={setZoom2}
                        setPan={setPan2}
                        placement={'bottom-right'}
                        hasBottomScrubber={!isSynced}
                     />

                     {/* Secondary Video Scrubber - Only visible on mobile when comparing AND not synced */}
                     {!isSynced && (
                        <div className="md:hidden bg-black px-4 py-2">
                           <DualScrubber
                              curr={compareTime}
                              dur={compareDuration}
                              setTime={seek2}
                              onScrubStart={() => setIsScrubbing(true)}
                              onScrubEnd={() => { setIsScrubbing(false); flushPendingSeek(); }}
                              isSecondary
                              label="CAM B"
                           />
                        </div>
                     )}
                  </div>
               )}

               {/* Canvas Overlay Removed from global wrapper - Moved inside each video container */}

            </div>

            {/* Controls Bar */}
            <div className="bg-black border-t border-neutral-900 px-4 py-4 z-30">
               {/* Scrubbers - hidden on mobile when comparing AND not synced (each video has its own). Visible on mobile when synced (shared scrubber) */}
               <div className={`w-full mb-4 ${compareVideo && !isSynced ? 'hidden md:block' : ''}`}>
                  {!compareVideo ? (
                     <DualScrubber
                        curr={currentTime}
                        dur={duration}
                        setTime={seek}
                        onScrubStart={() => setIsScrubbing(true)}
                        onScrubEnd={() => { setIsScrubbing(false); flushPendingSeek(); }}
                        label="CAM A"
                     />
                  ) : (
                     <div className={`w-full ${!isSynced ? 'grid grid-cols-2 gap-4' : ''}`}>
                        <DualScrubber
                           curr={currentTime}
                           dur={duration}
                           setTime={seek}
                           onScrubStart={() => setIsScrubbing(true)}
                           onScrubEnd={() => { setIsScrubbing(false); flushPendingSeek(); }}
                           label="CAM A"
                        />
                        {!isSynced && (
                           <DualScrubber
                              curr={compareTime}
                              dur={compareDuration}
                              setTime={seek2}
                              onScrubStart={() => setIsScrubbing(true)}
                              onScrubEnd={() => { setIsScrubbing(false); flushPendingSeek(); }}
                              isSecondary
                              label="CAM B"
                           />
                        )}
                     </div>
                  )}
               </div>

               <div className="flex items-center justify-center gap-8">
                  <button onClick={() => { const rates = [0.25, 0.5, 1]; setPlaybackRate(rates[(rates.indexOf(playbackRate) + 1) % 3]); if (videoRef.current) videoRef.current.playbackRate = playbackRate; }} className="text-xs font-bold bg-neutral-900 px-3 py-1.5 rounded-lg border border-neutral-800 text-neutral-400 w-12">{playbackRate}x</button>
                  <div className="flex items-center gap-6">
                     <button onClick={() => frameStep('prev')} className="text-neutral-400 hover:text-white"><ChevronLeft size={28} /></button>
                     <button onClick={togglePlay} className="w-14 h-14 bg-white rounded-full flex items-center justify-center text-black hover:scale-105 transition-transform">{isPlaying ? <Pause size={28} fill="black" /> : <Play size={28} fill="black" className="ml-1" />}</button>
                     <button onClick={() => frameStep('next')} className="text-neutral-400 hover:text-white"><ChevronRight size={28} /></button>
                  </div>
                  <button onClick={() => { if (videoRef.current) videoRef.current.currentTime = 0; }} className="text-neutral-500 hover:text-white"><RotateCcw size={20} /></button>
               </div>
            </div>
         </div>

         {/* Chat Sidebar */}
         {
            isChatOpen && (
               <div className="w-[85vw] md:w-80 border-l border-neutral-800 bg-neutral-900 flex flex-col animate-in slide-in-from-right duration-300 z-50 absolute right-0 top-0 bottom-0 md:relative md:h-full shadow-2xl">
                  <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-950">
                     <h3 className="font-bold text-white flex items-center gap-2"><Sparkles size={16} className="text-purple-500" /> {t.coachIA}</h3>
                     <button onClick={() => setIsChatOpen(false)}><X size={18} className="text-neutral-500" /></button>
                  </div>
                  <div className="hidden px-4 py-3 border-b border-neutral-800 bg-neutral-950/80">
                     <div className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${contextBadge.classes}`}>
                        {contextBadge.label}
                     </div>
                     <div className="mt-3 flex items-center justify-between text-[11px] text-neutral-400">
                        <span>{contextTexts.timestampLabel}: {currentTime.toFixed(2)}s</span>
                        {videoContext?.segmentCount ? <span>{videoContext.segmentCount} seg</span> : null}
                     </div>
                     <p className="mt-2 text-[11px] leading-relaxed text-neutral-400">
                        {videoContext?.status === 'ready'
                           ? (videoContext.globalSummary || contextTexts.contextReady)
                           : videoContext?.status === 'partial'
                              ? contextTexts.pendingHint
                              : videoContextError || contextTexts.pendingHint}
                     </p>
                     <div className="mt-3 grid grid-cols-1 gap-2">
                        <button
                           type="button"
                           disabled={isChatLoading || isLimitReached}
                           onClick={() => void submitContextualQuestion(
                              language === 'ing'
                                 ? 'Analyze this exact moment of the movement.'
                                 : language === 'eus'
                                    ? 'Aztertu keinuaren une zehatz hau.'
                                    : 'Analiza este momento exacto del gesto.',
                              'frame'
                           )}
                           className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-left text-xs text-white transition-colors hover:bg-white/10 disabled:opacity-50"
                        >
                           {contextTexts.askThisMoment}
                        </button>
                        <button
                           type="button"
                           disabled={isChatLoading || isLimitReached}
                           onClick={() => void submitContextualQuestion(
                              language === 'ing'
                                 ? 'Compare this moment with the immediately previous range.'
                                 : language === 'eus'
                                    ? 'Konparatu une hau aurreko tartearekin.'
                                    : 'Compara este momento con el tramo inmediatamente anterior.',
                              'range'
                           )}
                           className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-left text-xs text-white transition-colors hover:bg-white/10 disabled:opacity-50"
                        >
                           {contextTexts.askThisRange}
                        </button>
                        <button
                           type="button"
                           disabled={isChatLoading || isLimitReached}
                           onClick={() => void submitContextualQuestion(
                              language === 'ing'
                                 ? 'Give me a full technical summary of this throw.'
                                 : language === 'eus'
                                    ? 'Eman jaurtiketaren laburpen tekniko osoa.'
                                    : 'Haz un resumen técnico completo de este lanzamiento.',
                              'summary'
                           )}
                           className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-left text-xs text-white transition-colors hover:bg-white/10 disabled:opacity-50"
                        >
                           {contextTexts.askFullSummary}
                        </button>
                     </div>
                     {videoContext?.status === 'failed' && (
                        <button
                           type="button"
                           onClick={() => triggerVideoContextPreparation(true)}
                           className="mt-3 text-[11px] font-semibold text-red-300 hover:text-red-200"
                        >
                           {contextTexts.retryContext}
                        </button>
                     )}
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                     {chatMessages.map(msg => (
                        <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                           <div className={`p-3 rounded-2xl text-xs leading-relaxed max-w-[85%] ${msg.role === 'user' ? 'bg-purple-600 text-white rounded-tr-none' : 'bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-tl-none'}`}>
                              {false && msg.activeTimestampSeconds !== null && msg.activeTimestampSeconds !== undefined && (
                                 <div className={`mb-2 text-[10px] font-mono ${msg.role === 'user' ? 'text-purple-100/80' : 'text-neutral-500'}`}>
                                    {contextTexts.timestampLabel}: {msg.activeTimestampSeconds.toFixed(2)}s
                                 </div>
                              )}
                              <div className="whitespace-pre-wrap break-words">{msg.text}</div>
                              {false && msg.role === 'model' && msg.contextSummary && (
                                 <div className="mt-3 border-t border-white/10 pt-2 text-[10px] uppercase tracking-[0.18em] text-neutral-400">
                                    {contextTexts.contextUsed}: {msg.contextSummary}
                                 </div>
                              )}
                           </div>
                        </div>
                     ))}

                     {/* Left-Aligned Loading State */}
                     {isChatLoading && (
                        <div className="flex gap-3">
                           <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0">
                              <Sparkles size={14} className="text-white" />
                           </div>
                           <div className="bg-neutral-800 border border-neutral-700 px-4 py-3 rounded-2xl rounded-tl-none flex items-center gap-2">
                              <Loader2 size={14} className="animate-spin text-purple-400" />
                              <span className="text-xs text-neutral-400">{t.analyzing}</span>
                           </div>
                        </div>
                     )}
                  </div>
                  <form onSubmit={handleSendChat} className="p-4 border-t border-neutral-800 bg-neutral-950 flex gap-2">
                     <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder={t.askPlaceholder} disabled={isChatLoading || isLimitReached} className="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-2 text-xs text-white outline-none focus:border-purple-500 disabled:opacity-50" />
                     <button type="submit" disabled={isChatLoading || isLimitReached || !chatInput.trim()} className="p-2 bg-purple-600 text-white rounded-xl hover:bg-purple-500 disabled:opacity-50"><Send size={16} /></button>
                  </form>
               </div>
            )
         }

         {/* Upgrade Modal for Compare Feature */}
         {
            showUpgradeModal && (
               <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                  <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
                     <div className="flex flex-col items-center text-center">
                        <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mb-4">
                           <Split size={32} className="text-blue-500" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">{t.upgradeTitle}</h3>
                        <p className="text-neutral-400 text-sm mb-6">
                           {t.upgradeDesc}
                        </p>
                        {onNavigate && (
                           <button
                              onClick={() => { setShowUpgradeModal(false); onNavigate('pricing'); }}
                              className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-bold rounded-xl hover:opacity-90 transition-opacity"
                           >
                              {t.viewPlans}
                           </button>
                        )}
                        <button
                           onClick={() => setShowUpgradeModal(false)}
                           className="mt-3 text-sm text-neutral-500 hover:text-white transition-colors"
                        >
                           {t.close}
                        </button>
                     </div>
                  </div>
               </div>
            )
         }
      </div >
   );
};
