import React, { useEffect, useRef, useState } from 'react';
import { PlanFile } from '../types';
import { ChevronLeft, FileText, ChevronRight, ZoomIn, ZoomOut, Loader2 } from 'lucide-react';

interface PdfViewerProps {
  plan: PlanFile;
  onBack: () => void;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({ plan, onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2); 
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadPdf = async () => {
      setIsLoading(true);
      setError(null);

      // Verificación de seguridad
      if (!plan.file) {
        setError("El archivo PDF no está disponible.");
        setIsLoading(false);
        return;
      }

      try {
        // --- SOLUCIÓN FUERZA BRUTA ---
        // Casteamos a (plan.file as Blob) antes de llamar a arrayBuffer
        const fileData = await (plan.file as Blob).arrayBuffer();
        
        const pdfjsLib = (window as any).pdfjsLib;
        if (!pdfjsLib) {
          throw new Error("PDF Library not loaded");
        }

        const loadedPdf = await pdfjsLib.getDocument({ data: fileData }).promise;
        setPdfDoc(loadedPdf);
        setNumPages(loadedPdf.numPages);
        setPageNum(1);
      } catch (err) {
        console.error("Error loading PDF", err);
        setError("No se pudo cargar el documento PDF. Asegúrate de que es un archivo válido.");
      } finally {
        setIsLoading(false);
      }
    };

    loadPdf();
  }, [plan]);

  useEffect(() => {
    const renderPage = async () => {
      if (!pdfDoc || !canvasRef.current) return;

      try {
        const page = await pdfDoc.getPage(pageNum);
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: scale });
        
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        
        if (context) {
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;

          const renderContext = {
            canvasContext: context,
            viewport: viewport,
            transform: [dpr, 0, 0, dpr, 0, 0]
          };
          
          await page.render(renderContext).promise;
        }
      } catch (err) {
        console.error("Error rendering page", err);
      }
    };

    renderPage();
  }, [pdfDoc, pageNum, scale]);

  const changePage = (delta: number) => {
    const newPage = pageNum + delta;
    if (newPage >= 1 && newPage <= numPages) {
      setPageNum(newPage);
    }
  };

  return (
    <div className="h-full flex flex-col bg-neutral-950">
      <div className="p-4 border-b border-neutral-800 bg-neutral-900 flex items-center justify-between shadow-lg z-10">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="text-neutral-400 hover:text-white transition-colors">
            <ChevronLeft size={24} />
          </button>
          <div className="flex items-center gap-3">
             <div className="bg-red-600/20 p-2 rounded-lg">
                <FileText className="text-red-500" size={20} />
             </div>
             <div>
                <h2 className="text-lg font-bold text-white leading-none">{plan.name}</h2>
                <p className="text-xs text-neutral-500 mt-1">Visor Seguro (Alta Calidad)</p>
             </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4 bg-neutral-800 p-1.5 rounded-xl border border-neutral-700">
           <div className="flex items-center gap-2 px-2 border-r border-neutral-600">
              <button onClick={() => setScale(s => Math.max(0.5, s - 0.2))} className="p-1.5 hover:bg-neutral-700 rounded text-neutral-400 hover:text-white"><ZoomOut size={16} /></button>
              <span className="text-xs font-mono w-10 text-center">{Math.round(scale * 100)}%</span>
              <button onClick={() => setScale(s => Math.min(5, s + 0.2))} className="p-1.5 hover:bg-neutral-700 rounded text-neutral-400 hover:text-white"><ZoomIn size={16} /></button>
           </div>
           
           <div className="flex items-center gap-2 px-2">
              <button onClick={() => changePage(-1)} disabled={pageNum <= 1} className="p-1.5 hover:bg-neutral-700 rounded text-neutral-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-medium text-white px-2">
                 {pageNum} <span className="text-neutral-500">/</span> {numPages}
              </span>
              <button onClick={() => changePage(1)} disabled={pageNum >= numPages} className="p-1.5 hover:bg-neutral-700 rounded text-neutral-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent">
                <ChevronRight size={16} />
              </button>
           </div>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-auto bg-neutral-900 flex justify-center p-8">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-neutral-400">
             <Loader2 size={32} className="animate-spin text-orange-500" />
             <p>Renderizando documento...</p>
          </div>
        ) : error ? (
           <div className="flex flex-col items-center justify-center h-full text-red-400 gap-2">
              <FileText size={48} />
              <p>{error}</p>
           </div>
        ) : (
          <div className="relative shadow-2xl border border-neutral-800 bg-white min-h-[500px]">
             <canvas ref={canvasRef} className="block max-w-full h-auto" />
          </div>
        )}
      </div>
    </div>
  );
};