
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { VideoFile, ChatMessage, UserUsage, UserLimits, Language } from '../types';
import { chatWithCoach } from '../services/geminiService';
import {
   Play, Pause, ChevronLeft, ChevronRight, X,
   ZoomIn, ZoomOut, PenTool, Eraser,
   Sparkles, Split, Send, RotateCcw,
   Loader2, Move, Trash2, Palette, MousePointer2, Minus, Circle, Link2, Unlink, Lock
} from 'lucide-react';

interface VideoAnalyzerProps {
   video: VideoFile;
   onBack: () => void;
   usage?: UserUsage | null;
   limits?: UserLimits;
   onIncrementUsage?: () => void;
   language: Language;
   onNavigate?: (screen: 'pricing') => void;
}

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

interface DualScrubberProps {
   curr: number;
   dur: number;
   setTime: (t: number) => void;
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
   const [isDraggingFast, setIsDraggingFast] = useState(false);
   const [isDraggingSlow, setIsDraggingSlow] = useState(false);
   const [dragStartX, setDragStartX] = useState(0);
   const [timeStartDrag, setTimeStartDrag] = useState(0);
   const [containerWidth, setContainerWidth] = useState(1000);
   const rafRef = useRef<number | null>(null);

   const TICK_GAP = 10;
   const TICKS_PER_GROUP = 10;
   const PATTERN_WIDTH = TICK_GAP * TICKS_PER_GROUP;
   const PIXELS_PER_SECOND = 80;

   useEffect(() => {
      const updateWidth = () => { if (slowRef.current) setContainerWidth(slowRef.current.clientWidth); };
      updateWidth();
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
   }, []);

   const handleFastMove = useCallback((clientX: number) => {
      if (!fastRef.current || dur <= 0) return;
      const rect = fastRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      setTime(pct * dur);
   }, [dur, setTime]);

   const handleSlowMove = useCallback((clientX: number) => {
      const deltaX = clientX - dragStartX;
      const timeDelta = -deltaX / PIXELS_PER_SECOND;
      const newTime = Math.max(0, Math.min(dur, timeStartDrag + timeDelta));
      setTime(newTime);
   }, [dragStartX, timeStartDrag, dur, setTime]);

   // Desktop Handlers
   const startFast = (e: React.MouseEvent) => { setIsDraggingFast(true); onScrubStart(); handleFastMove(e.clientX); };
   const startSlow = (e: React.MouseEvent) => { setIsDraggingSlow(true); setDragStartX(e.clientX); setTimeStartDrag(curr); onScrubStart(); };

   // Touch Handlers
   const touchStartFast = (e: React.TouchEvent) => { setIsDraggingFast(true); onScrubStart(); handleFastMove(e.touches[0].clientX); };
   const touchStartSlow = (e: React.TouchEvent) => { setIsDraggingSlow(true); setDragStartX(e.touches[0].clientX); setTimeStartDrag(curr); onScrubStart(); };

   useEffect(() => {
      const onEnd = () => {
         if (isDraggingFast || isDraggingSlow) {
            setIsDraggingFast(false);
            setIsDraggingSlow(false);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            onScrubEnd();
         }
      };

      const onMove = (e: MouseEvent | TouchEvent) => {
         if (!isDraggingFast && !isDraggingSlow) return;

         // Use requestAnimationFrame for smoother UI updates during drag
         if (rafRef.current) cancelAnimationFrame(rafRef.current);

         rafRef.current = requestAnimationFrame(() => {
            const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
            if (isDraggingFast) handleFastMove(clientX);
            if (isDraggingSlow) handleSlowMove(clientX);
         });
      };

      if (isDraggingFast || isDraggingSlow) {
         window.addEventListener('mousemove', onMove);
         window.addEventListener('mouseup', onEnd);
         window.addEventListener('touchmove', onMove, { passive: false });
         window.addEventListener('touchend', onEnd);
      }
      return () => {
         window.removeEventListener('mousemove', onMove);
         window.removeEventListener('mouseup', onEnd);
         window.removeEventListener('touchmove', onMove);
         window.removeEventListener('touchend', onEnd);
         if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
   }, [isDraggingFast, isDraggingSlow, handleFastMove, handleSlowMove, onScrubEnd]);

   const progress = dur > 0 ? (curr / dur) * 100 : 0;
   const numPatterns = Math.ceil(containerWidth / PATTERN_WIDTH) + 3;
   const scrollOffset = (curr * PIXELS_PER_SECOND) % PATTERN_WIDTH;

   return (
      <div className="flex flex-col w-full select-none relative group mb-1 touch-none">
         <div className="flex justify-between items-end mb-1.5 px-0.5">
            <span className="text-[10px] text-neutral-500 uppercase font-black tracking-widest">{label || (isSecondary ? 'CAM B' : 'CAM A')}</span>
            <div className="font-mono text-sm font-bold text-orange-500 tabular-nums">{curr.toFixed(3)}s</div>
         </div>

         {/* Fast Scrubber */}
         <div
            ref={fastRef}
            onMouseDown={startFast}
            onTouchStart={touchStartFast}
            className="relative h-2.5 w-full cursor-pointer flex items-center bg-neutral-900 rounded-full mb-1.5 overflow-hidden"
         >
            <div className="absolute h-full bg-neutral-700 rounded-full" style={{ width: `${progress}%` }}></div>
            <div className="absolute inset-0 hover:bg-white/5 transition-colors"></div>
         </div>

         {/* Slow Precision Ruler */}
         <div
            ref={slowRef}
            onMouseDown={startSlow}
            onTouchStart={touchStartSlow}
            className="relative h-12 w-full bg-black border-y border-neutral-900 overflow-hidden flex items-center justify-center cursor-default hover:cursor-grab active:cursor-grabbing"
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

export const VideoAnalyzer: React.FC<VideoAnalyzerProps> = ({ video, onBack, usage, limits, onIncrementUsage, language, onNavigate }) => {
   const [currentTime, setCurrentTime] = useState(0);
   const [duration, setDuration] = useState(0);
   const [playbackRate, setPlaybackRate] = useState(1);
   const [isPlaying, setIsPlaying] = useState(false);
   const [isScrubbing, setIsScrubbing] = useState(false); // Track dragging state

   // Zoom & Pan State
   const [zoom, setZoom] = useState(1);
   const [pan, setPan] = useState({ x: 0, y: 0 });
   const [isPanning, setIsPanning] = useState(false);
   const [startPan, setStartPan] = useState({ x: 0, y: 0 });

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
   const [useDeepAnalysis, setUseDeepAnalysis] = useState(false);
   const [chatInput, setChatInput] = useState('');
   const [chatMessages, setChatMessages] = useState<ChatMessage[]>([{ id: 'intro', role: 'model', text: 'Hola, soy tu entrenador IA. ¿Qué quieres analizar de este vídeo?', timestamp: new Date() }]);
   const [isChatLoading, setIsChatLoading] = useState(false);

   const [isVideoLoaded, setIsVideoLoaded] = useState(false);
   const [videoError, setVideoError] = useState<string | null>(null);
   const videoRef = useRef<HTMLVideoElement>(null);
   const canvasRef = useRef<HTMLCanvasElement>(null);
   const wrapperRef = useRef<HTMLDivElement>(null);

   // Drawing State
   const [isDrawingMode, setIsDrawingMode] = useState(false);
   const [activeTool, setActiveTool] = useState<'pen' | 'eraser'>('pen'); // New Tool State
   const [isDrawing, setIsDrawing] = useState(false);
   const [drawShape, setDrawShape] = useState<'free' | 'line'>('free');
   const [selectedColor, setSelectedColor] = useState(DRAWING_COLORS[0].hex);
   const [drawings, setDrawings] = useState<Line[]>([]);

   const activeUrl = video.url || video.remoteUrl || "";
   const canDeepAnalysis = limits?.canUseDeepAnalysis ?? false;
   const messagesUsed = usage?.chatCount || 0;
   const chatLimit = limits?.maxChatMessagesPerMonth === 'unlimited' ? Infinity : (limits?.maxChatMessagesPerMonth as number || 0);
   const isLimitReached = messagesUsed >= chatLimit;

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
      setIsVideoLoaded(false);
      setVideoError(null);
      setCurrentTime(0);
      if (!activeUrl) setVideoError("Error: URL de video no encontrada.");
   }, [video.id]);

   const handleLoadedData = () => {
      setIsVideoLoaded(true);
      if (videoRef.current) setDuration(videoRef.current.duration);
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
   useEffect(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx || !wrapperRef.current) return;

      // Match canvas size to video wrapper size for correct coordinate mapping
      canvas.width = wrapperRef.current.clientWidth;
      canvas.height = wrapperRef.current.clientHeight;

      // Clear
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4;

      // Draw all lines
      drawings.forEach(line => {
         ctx.beginPath();
         ctx.strokeStyle = line.color;
         if (line.points.length > 0) {
            ctx.moveTo(line.points[0].x, line.points[0].y);
            line.points.forEach(p => ctx.lineTo(p.x, p.y));
         }
         ctx.stroke();
      });
   }, [drawings, zoom, pan, isVideoLoaded]); // Redraw when these change

   const getCanvasCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
      const canvas = canvasRef.current;
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

   const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
      if (isDrawingMode) {
         setIsDrawing(true);
         const { x, y } = getCanvasCoordinates(e);

         if (activeTool === 'pen') {
            // Start a new line
            setDrawings(prev => [...prev, { id: Date.now().toString(), points: [{ x, y }], color: selectedColor, isStraight: drawShape === 'line' }]);
         } else if (activeTool === 'eraser') {
            eraseAt(x, y);
         }
      } else if (zoom > 1) {
         // Start Panning
         setIsPanning(true);
         const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
         const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
         setStartPan({ x: clientX - pan.x, y: clientY - pan.y });
      }
   };

   const eraseAt = (x: number, y: number) => {
      const ERASE_RADIUS = 40; // Increased pixel radius for easier erasing
      setDrawings(prev => prev.filter(line => {
         // Check if any point in the line is close to the eraser
         return !line.points.some(p => Math.hypot(p.x - x, p.y - y) < ERASE_RADIUS);
      }));
   }

   const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
      if (isDrawing && isDrawingMode) {
         const { x, y } = getCanvasCoordinates(e);

         if (activeTool === 'pen') {
            setDrawings(prev => {
               const lastLine = prev[prev.length - 1];
               if (!lastLine) return prev;

               if (lastLine.isStraight) {
                  // Update end point only for straight line
                  const startPoint = lastLine.points[0];
                  const newLine = { ...lastLine, points: [startPoint, { x, y }] };
                  return [...prev.slice(0, -1), newLine];
               } else {
                  // Append point for freehand
                  const newLine = { ...lastLine, points: [...lastLine.points, { x, y }] };
                  return [...prev.slice(0, -1), newLine];
               }
            });
         } else if (activeTool === 'eraser') {
            eraseAt(x, y);
         }
      } else if (isPanning) {
         const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
         const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
         setPan({
            x: clientX - startPan.x,
            y: clientY - startPan.y
         });
      }
   };

   const handleMouseUp = () => {
      setIsDrawing(false);
      setIsPanning(false);
   };

   const togglePlay = () => {
      if (isPlaying) {
         videoRef.current?.pause();
         videoRef2.current?.pause();
      } else {
         videoRef.current?.play();
         if (isSynced) videoRef2.current?.play();
      }
      setIsPlaying(!isPlaying);
   };

   const seek = (time: number) => {
      if (videoRef.current) {
         videoRef.current.currentTime = time;
         // Update state directly for UI responsiveness during drag
         setCurrentTime(time);
         if (compareVideo && isSynced && videoRef2.current) {
            videoRef2.current.currentTime = time + syncOffset;
         }
      }
   };

   const seek2 = (time: number) => {
      if (videoRef2.current) {
         videoRef2.current.currentTime = time;
         setCompareTime(time);
         // If synced, moving scrubber 2 adjusts the offset, it doesn't move scrubber 1
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

   const handleSendChat = async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!chatInput.trim() || isLimitReached) return;
      const newMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: chatInput, timestamp: new Date() };
      setChatMessages(prev => [...prev, newMsg]);
      setChatInput('');
      setIsChatLoading(true);
      try {
         const response = await chatWithCoach(newMsg.text, chatMessages, canDeepAnalysis && useDeepAnalysis ? 'premium' : 'standard', language);
         setChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: response, timestamp: new Date() }]);
         onIncrementUsage?.();
      } catch {
         setChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: 'Error de conexión.', timestamp: new Date() }]);
      } finally { setIsChatLoading(false); }
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
                              onClick={() => setDrawings([])}
                              className="p-1.5 text-red-400 hover:bg-red-900/30 rounded-full transition-colors"
                              title="Borrar Todo"
                           >
                              <Trash2 size={14} />
                           </button>
                        </div>
                     </div>
                  )}

                  {/* Drawing Mode Toggle */}
                  <button
                     onClick={() => setIsDrawingMode(!isDrawingMode)}
                     className={`p-3 rounded-full border transition-all ${isDrawingMode ? 'bg-orange-600 border-orange-500 text-white' : 'bg-black/40 border-white/10 text-white hover:bg-white/10'}`}
                     title="Modo Lápiz"
                  >
                     <PenTool size={20} />
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
                                 <h4 className="font-bold text-sm mb-1">¡Compara Vídeos!</h4>
                                 <p className="text-xs text-white/80">Como usuario Pro/Premium, puedes comparar dos vídeos lado a lado para analizar tu técnica.</p>
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
                                    <h4 className="font-bold text-sm mb-1">¡Sincroniza los Vídeos!</h4>
                                    <p className="text-xs text-white/80">Alinea los vídeos manualmente y pulsa este botón para que se muevan juntos.</p>
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
                                 <h4 className="font-bold text-sm mb-1">¡Analiza con Gemini AI!</h4>
                                 <p className="text-xs text-white/80">Pulsa este botón para obtener análisis inteligente de tu técnica con IA.</p>
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
         <div className="flex-1 flex flex-col relative bg-black">

            {/* Video Container Area */}
            <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-black"
               style={{ cursor: isDrawingMode ? (activeTool === 'eraser' ? 'cell' : 'crosshair') : (zoom > 1 ? 'grab' : 'default') }}
               onMouseDown={handleMouseDown}
               onTouchStart={handleMouseDown}
               onMouseMove={handleMouseMove}
               onTouchMove={handleMouseMove}
               onMouseUp={handleMouseUp}
               onTouchEnd={handleMouseUp}
               onMouseLeave={handleMouseUp}
            >
               {!isVideoLoaded && !videoError && <Loader2 size={40} className="animate-spin text-orange-500 absolute" />}

               {/* Transformed Wrapper */}
               <div
                  ref={wrapperRef}
                  className={`relative flex items-center justify-center transition-transform duration-75 ease-linear ${compareVideo ? 'w-full h-full gap-1' : 'w-full h-full'}`}
                  style={{
                     transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
                  }}
               >
                  {/* Primary Video */}
                  <div className={`relative flex items-center justify-center ${compareVideo ? 'w-1/2 h-full' : 'w-full h-full'}`}>
                     {activeUrl && (
                        <video
                           ref={videoRef}
                           src={activeUrl}
                           className="max-h-full max-w-full object-contain pointer-events-none select-none"
                           playsInline
                           onLoadedData={handleLoadedData}
                           onTimeUpdate={handleTimeUpdatePrimary}
                        />
                     )}
                  </div>

                  {/* Comparison Video */}
                  {compareVideo && (
                     <div className="relative w-1/2 h-full flex items-center justify-center border-l border-white/10">
                        <video
                           ref={videoRef2}
                           src={compareVideo.url}
                           className="max-h-full max-w-full object-contain pointer-events-none select-none"
                           playsInline
                           onLoadedData={(e) => setCompareDuration(e.currentTarget.duration)}
                           onTimeUpdate={handleTimeUpdateSecondary}
                        />
                     </div>
                  )}

                  {/* Canvas Overlay (Shares transform with videos) */}
                  <canvas
                     ref={canvasRef}
                     className="absolute inset-0 z-20 pointer-events-none"
                  />
               </div>

               {/* Zoom Controls (Floating) */}
               <div className="absolute bottom-36 right-4 z-40 flex flex-col gap-2 bg-black/60 backdrop-blur-md rounded-xl p-1 border border-white/10">
                  <button onClick={() => { setZoom(z => Math.min(4, z + 0.5)); }} className="p-2 text-white hover:bg-white/10 rounded-lg"><ZoomIn size={20} /></button>
                  <span className="text-[10px] text-center font-mono text-neutral-400">{Math.round(zoom * 100)}%</span>
                  <button onClick={() => { setZoom(z => Math.max(1, z - 0.5)); setPan({ x: 0, y: 0 }); }} className="p-2 text-white hover:bg-white/10 rounded-lg"><ZoomOut size={20} /></button>
               </div>
            </div>

            {/* Controls Bar */}
            <div className="bg-black border-t border-neutral-900 px-4 py-4 z-30">
               <div className={`w-full ${compareVideo && !isSynced ? 'grid grid-cols-2 gap-4' : ''} mb-4`}>
                  <DualScrubber
                     curr={currentTime}
                     dur={duration}
                     setTime={seek}
                     onScrubStart={() => setIsScrubbing(true)}
                     onScrubEnd={() => setIsScrubbing(false)}
                     label="CAM A"
                  />
                  {compareVideo && !isSynced && (
                     <DualScrubber
                        curr={compareTime}
                        dur={compareDuration}
                        setTime={seek2}
                        onScrubStart={() => setIsScrubbing(true)}
                        onScrubEnd={() => setIsScrubbing(false)}
                        isSecondary
                        label="CAM B"
                     />
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
         {isChatOpen && (
            <div className="w-80 border-l border-neutral-800 bg-neutral-900 flex flex-col animate-in slide-in-from-right duration-300 z-40 absolute right-0 top-0 bottom-0 shadow-2xl">
               <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-950">
                  <h3 className="font-bold text-white flex items-center gap-2"><Sparkles size={16} className="text-purple-500" /> Coach IA</h3>
                  <button onClick={() => setIsChatOpen(false)}><X size={18} className="text-neutral-500" /></button>
               </div>
               <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {chatMessages.map(msg => (
                     <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        <div className={`p-3 rounded-2xl text-xs leading-relaxed max-w-[85%] ${msg.role === 'user' ? 'bg-purple-600 text-white rounded-tr-none' : 'bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-tl-none'}`}>{msg.text}</div>
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
                           <span className="text-xs text-neutral-400">Analizando...</span>
                        </div>
                     </div>
                  )}
               </div>
               <form onSubmit={handleSendChat} className="p-4 border-t border-neutral-800 bg-neutral-950 flex gap-2">
                  <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Pregunta..." className="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-2 text-xs text-white outline-none focus:border-purple-500" />
                  <button type="submit" className="p-2 bg-purple-600 text-white rounded-xl hover:bg-purple-500"><Send size={16} /></button>
               </form>
            </div>
         )}

         {/* Upgrade Modal for Compare Feature */}
         {showUpgradeModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
               <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
                  <div className="flex flex-col items-center text-center">
                     <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mb-4">
                        <Split size={32} className="text-blue-500" />
                     </div>
                     <h3 className="text-xl font-bold text-white mb-2">Función Pro/Premium</h3>
                     <p className="text-neutral-400 text-sm mb-6">
                        La comparación de vídeos lado a lado está disponible para usuarios Atleta Pro y Atleta Premium. ¡Mejora tu plan para desbloquear esta función!
                     </p>
                     {onNavigate && (
                        <button
                           onClick={() => { setShowUpgradeModal(false); onNavigate('pricing'); }}
                           className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-bold rounded-xl hover:opacity-90 transition-opacity"
                        >
                           Ver Planes
                        </button>
                     )}
                     <button
                        onClick={() => setShowUpgradeModal(false)}
                        className="mt-3 text-sm text-neutral-500 hover:text-white transition-colors"
                     >
                        Cerrar
                     </button>
                  </div>
               </div>
            </div>
         )}
      </div>
   );
};
