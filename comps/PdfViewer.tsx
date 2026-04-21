import React, { useEffect, useRef, useState } from 'react';
import { PlanFile } from '../types';
import { StorageService } from '../svcs/storageService';
import { ChevronLeft, FileText, ChevronRight, ZoomIn, ZoomOut, Loader2 } from 'lucide-react';

interface PdfViewerProps {
  plan: PlanFile;
  onBack: () => void;
}

type Point = {
  x: number;
  y: number;
};

type PageMetrics = {
  width: number;
  height: number;
  orientation: 'landscape' | 'portrait';
  fitScale: number;
};

const MIN_ZOOM_LEVEL = 0.75;
const MAX_ZOOM_LEVEL = 4;
const ZOOM_STEP = 0.2;
const PDF_JS_BASE = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";

let pdfJsLoadPromise: Promise<any> | null = null;

function ensurePdfJsLoaded() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if ((window as any).pdfjsLib) {
    (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDF_JS_BASE}/pdf.worker.min.js`;
    return Promise.resolve((window as any).pdfjsLib);
  }

  if (pdfJsLoadPromise) return pdfJsLoadPromise;

  pdfJsLoadPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-pdfjs="true"]');
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve((window as any).pdfjsLib), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("PDF.js failed to load")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = `${PDF_JS_BASE}/pdf.min.js`;
    script.async = true;
    script.dataset.pdfjs = "true";
    script.onload = () => {
      if ((window as any).pdfjsLib) {
        (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDF_JS_BASE}/pdf.worker.min.js`;
        resolve((window as any).pdfjsLib);
        return;
      }
      reject(new Error("PDF.js loaded without exposing pdfjsLib"));
    };
    script.onerror = () => reject(new Error("PDF.js failed to load"));
    document.body.appendChild(script);
  });

  return pdfJsLoadPromise;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({ plan, onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);
  const panSessionRef = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [pageMetrics, setPageMetrics] = useState<PageMetrics | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canZoomOut = zoomLevel > MIN_ZOOM_LEVEL;
  const canZoomIn = zoomLevel < MAX_ZOOM_LEVEL;
  const effectiveScale = pageMetrics ? pageMetrics.fitScale * zoomLevel : 1;
  const orientationLabel = pageMetrics?.orientation === 'landscape' ? 'Horizontal' : 'Vertical';
  const viewerLabel = pageMetrics ? `Visor seguro - ${orientationLabel}` : 'Visor seguro (alta calidad)';
  const isViewerLoading = isLoading || (!!pdfDoc && !pageMetrics && !error);
  const renderedWidth = pageMetrics ? pageMetrics.width * effectiveScale : 0;
  const renderedHeight = pageMetrics ? pageMetrics.height * effectiveScale : 0;
  const overflowX = Math.max(renderedWidth - containerSize.width, 0);
  const overflowY = Math.max(renderedHeight - containerSize.height, 0);
  const isPanEnabled = zoomLevel > 1 && (overflowX > 1 || overflowY > 1);

  const clampPan = (nextPan: Point): Point => {
    const maxX = overflowX / 2;
    const maxY = overflowY / 2;

    return {
      x: Math.min(maxX, Math.max(-maxX, nextPan.x)),
      y: Math.min(maxY, Math.max(-maxY, nextPan.y)),
    };
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measureContainer = () => {
      const styles = window.getComputedStyle(container);
      const paddingX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const paddingY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);

      setContainerSize({
        width: Math.max(container.clientWidth - paddingX, 0),
        height: Math.max(container.clientHeight - paddingY, 0),
      });
    };

    measureContainer();

    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => measureContainer())
      : null;

    observer?.observe(container);
    window.addEventListener('resize', measureContainer);
    window.visualViewport?.addEventListener('resize', measureContainer);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measureContainer);
      window.visualViewport?.removeEventListener('resize', measureContainer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadedPdfInstance: any = null;

    const loadPdf = async () => {
      setIsLoading(true);
      setError(null);
      setPdfDoc(null);
      setNumPages(0);
      setPageNum(1);
      setZoomLevel(1);
      setPan({ x: 0, y: 0 });
      setIsPanning(false);
      setPageMetrics(null);

      try {
        let fileData: ArrayBuffer | null = null;

        if (plan.file) {
          fileData = await (plan.file as Blob).arrayBuffer();
        } else if (plan.ownerId) {
          const resolvedPlan = await StorageService.findPlanDownloadUrl(plan.ownerId, plan);
          const urlToFetch = plan.url || resolvedPlan?.url || plan.downloadURL || plan.remoteUrl;

          if (!urlToFetch) {
            throw new Error(resolvedPlan?.errorMessage || 'No PDF source available');
          }

          const resp = await fetch(urlToFetch);
          if (!resp.ok) throw new Error('Network response was not ok');
          fileData = await resp.arrayBuffer();
        }

        if (!fileData) {
          throw new Error('No PDF source available');
        }

        const pdfjsLib = await ensurePdfJsLoaded();
        if (!pdfjsLib) {
          throw new Error('PDF Library not loaded');
        }

        const loadedPdf = await pdfjsLib.getDocument({ data: fileData }).promise;
        loadedPdfInstance = loadedPdf;
        if (cancelled) return;

        setPdfDoc(loadedPdf);
        setNumPages(loadedPdf.numPages);
      } catch (err) {
        if (cancelled) return;
        console.error('Error loading PDF', err);
        setError('No se pudo cargar el documento PDF. Asegurate de que es un archivo valido y que tienes conexion.');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadPdf();

    return () => {
      cancelled = true;
      try {
        renderTaskRef.current?.cancel();
      } catch {
        // no-op
      }
      try {
        loadedPdfInstance?.destroy?.();
      } catch {
        // no-op
      }
    };
  }, [plan]);

  useEffect(() => {
    let cancelled = false;

    const updatePageMetrics = async () => {
      if (!pdfDoc || !containerSize.width || !containerSize.height) return;

      try {
        const page = await pdfDoc.getPage(pageNum);
        if (cancelled) return;

        const naturalViewport = page.getViewport({ scale: 1 });
        const isLandscape = naturalViewport.width > naturalViewport.height;
        const widthFitScale = containerSize.width / naturalViewport.width;
        const heightFitScale = containerSize.height / naturalViewport.height;

        // Portrait pages fit width naturally; landscape pages contain within the visible viewport.
        const nextFitScale = isLandscape
          ? Math.min(widthFitScale, heightFitScale)
          : widthFitScale;

        setPageMetrics({
          width: naturalViewport.width,
          height: naturalViewport.height,
          orientation: isLandscape ? 'landscape' : 'portrait',
          fitScale: Math.max(nextFitScale, 0.1),
        });
      } catch (err) {
        if (!cancelled) {
          console.error('Error measuring PDF page', err);
        }
      }
    };

    updatePageMetrics();

    return () => {
      cancelled = true;
    };
  }, [containerSize.height, containerSize.width, pageNum, pdfDoc]);

  useEffect(() => {
    let cancelled = false;

    const renderPage = async () => {
      if (!pdfDoc || !canvasRef.current || !pageMetrics) return;

      try {
        const page = await pdfDoc.getPage(pageNum);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: effectiveScale });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d', { alpha: false });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        if (!context) return;

        try {
          renderTaskRef.current?.cancel();
        } catch {
          // no-op
        }

        canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
        canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);

        const renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
        });

        renderTaskRef.current = renderTask;
        await renderTask.promise;

        if (renderTaskRef.current === renderTask) {
          renderTaskRef.current = null;
        }
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('Error rendering page', err);
        }
      }
    };

    renderPage();

    return () => {
      cancelled = true;
      try {
        renderTaskRef.current?.cancel();
      } catch {
        // no-op
      }
    };
  }, [effectiveScale, pageMetrics, pageNum, pdfDoc]);

  useEffect(() => {
    if (!isPanEnabled) {
      setPan({ x: 0, y: 0 });
      setIsPanning(false);
      return;
    }

    setPan((currentPan) => clampPan(currentPan));
  }, [isPanEnabled, overflowX, overflowY]);

  const updateZoom = (direction: 'in' | 'out') => {
    setZoomLevel((currentZoom) => {
      const nextZoom = direction === 'in'
        ? currentZoom + ZOOM_STEP
        : currentZoom - ZOOM_STEP;

      return Math.min(MAX_ZOOM_LEVEL, Math.max(MIN_ZOOM_LEVEL, Number(nextZoom.toFixed(2))));
    });
  };

  const changePage = (delta: number) => {
    const newPage = pageNum + delta;
    if (newPage < 1 || newPage > numPages) return;

    containerRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    setPan({ x: 0, y: 0 });
    setPageNum(newPage);
  };

  const handlePanStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanEnabled) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    panSessionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPanning(true);
    event.preventDefault();
  };

  const handlePanMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanEnabled) return;
    if (!isPanning || panSessionRef.current.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - panSessionRef.current.startX;
    const deltaY = event.clientY - panSessionRef.current.startY;

    setPan(clampPan({
      x: panSessionRef.current.originX + deltaX,
      y: panSessionRef.current.originY + deltaY,
    }));

    event.preventDefault();
  };

  const handlePanEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (panSessionRef.current.pointerId !== event.pointerId) return;

    panSessionRef.current.pointerId = -1;
    setIsPanning(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-neutral-950">
      <div className="border-b border-neutral-800 bg-neutral-900/95 px-3 py-3 shadow-lg backdrop-blur sm:px-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={onBack}
              aria-label="Volver"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900 text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white"
            >
              <ChevronLeft size={18} />
            </button>

            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-600/15 text-red-500 ring-1 ring-inset ring-red-500/20">
                <FileText size={18} />
              </div>

              <div className="min-w-0">
                <h2 title={plan.name} className="truncate text-[clamp(0.95rem,3.7vw,1.125rem)] font-semibold leading-tight text-white">
                  {plan.name}
                </h2>
                <p className="truncate text-[11px] text-neutral-500 sm:text-xs">
                  {viewerLabel}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <div className="flex items-center rounded-xl border border-neutral-700 bg-neutral-900/80 px-1.5 py-1 shadow-sm">
              <button
                onClick={() => updateZoom('out')}
                disabled={!pageMetrics || !canZoomOut}
                aria-label="Reducir zoom"
                title="Reducir zoom"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
              >
                <ZoomOut size={15} />
              </button>

              <span className="w-12 text-center text-[11px] font-semibold text-white sm:text-xs">
                {Math.round(zoomLevel * 100)}%
              </span>

              <button
                onClick={() => updateZoom('in')}
                disabled={!pageMetrics || !canZoomIn}
                aria-label="Ampliar zoom"
                title="Ampliar zoom"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
              >
                <ZoomIn size={15} />
              </button>
            </div>

            <div className="flex items-center rounded-xl border border-neutral-700 bg-neutral-900/80 px-1.5 py-1 shadow-sm">
              <button
                onClick={() => changePage(-1)}
                disabled={pageNum <= 1}
                aria-label="Pagina anterior"
                title="Pagina anterior"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
              >
                <ChevronLeft size={15} />
              </button>

              <span className="min-w-[3.75rem] px-1 text-center text-[11px] font-semibold text-white sm:text-xs">
                {pageNum} <span className="text-neutral-500">/</span> {numPages || '--'}
              </span>

              <button
                onClick={() => changePage(1)}
                disabled={pageNum >= numPages}
                aria-label="Pagina siguiente"
                title="Pagina siguiente"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        aria-busy={isViewerLoading}
        className={`flex-1 min-h-0 overscroll-contain bg-neutral-950 px-3 py-3 safe-pb-4 sm:px-4 sm:py-4 lg:px-6 ${
          isPanEnabled ? 'overflow-hidden' : 'overflow-auto'
        }`}
      >
        {isViewerLoading ? (
          <div className="flex min-h-full items-center justify-center">
            <div className="flex flex-col items-center justify-center gap-3 text-neutral-400">
              <Loader2 size={30} className="animate-spin text-orange-500" />
              <p className="text-sm text-neutral-300">Renderizando documento...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex min-h-full items-center justify-center">
            <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-red-900/40 bg-red-950/20 px-6 py-8 text-center text-red-300">
              <FileText size={40} />
              <p className="text-sm leading-6">{error}</p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-full min-w-full items-center justify-center">
            <div
              onPointerDown={handlePanStart}
              onPointerMove={handlePanMove}
              onPointerUp={handlePanEnd}
              onPointerCancel={handlePanEnd}
              onLostPointerCapture={handlePanEnd}
              className={`shrink-0 rounded-2xl border border-neutral-800 bg-white p-2 shadow-2xl sm:p-3 ${
                isPanEnabled ? 'select-none touch-none' : ''
              }`}
              style={{
                transform: isPanEnabled ? `translate3d(${pan.x}px, ${pan.y}px, 0)` : undefined,
                transition: isPanning ? 'none' : 'transform 160ms ease-out',
                willChange: isPanEnabled ? 'transform' : undefined,
                cursor: isPanEnabled ? (isPanning ? 'grabbing' : 'grab') : 'default',
              }}
            >
              <canvas
                ref={canvasRef}
                className="block h-auto w-auto max-w-none"
                data-orientation={pageMetrics?.orientation ?? 'unknown'}
                data-page-width={pageMetrics?.width ?? 0}
                data-page-height={pageMetrics?.height ?? 0}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
