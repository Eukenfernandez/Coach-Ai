
import React, { useState, useEffect } from 'react';
import { Calculator, AlertCircle } from 'lucide-react';
import { Language } from '../types';

interface Plate {
  weight: number;
  color: string;
  gradientFrom: string;
  gradientVia: string;
  gradientTo: string;
  borderColor: string;
  textColor: string;
  heightClass: string; // Tailwind class for diameter
  widthClass: string; // Tailwind class for thickness
  count: number;
}

interface PlateCalculatorProps {
  language: Language;
}

const TEXTS = {
  es: {
    title: 'Calculadora de Discos',
    subtitle: 'Visualización 3D de la carga de la barra.',
    targetWeight: 'Peso Objetivo Total (kg)',
    perSide: 'Por lado',
    missing: 'Faltan',
    missingDesc: '(no hay discos exactos).',
    summary: 'Resumen de Carga (Por lado)',
    empty: 'Introduce un peso mayor a 20kg.',
    plate: 'Disco',
    weight: 'Peso',
    qty: 'Cantidad',
    bar: 'Barra Olímpica',
    legend: 'Código de Colores (IWF)',
    note: '* El cálculo asume el uso de barra de 20kg y collares insignificantes en peso.'
  },
  ing: {
    title: 'Plate Calculator',
    subtitle: '3D visualization of bar loading.',
    targetWeight: 'Target Total Weight (kg)',
    perSide: 'Per side',
    missing: 'Missing',
    missingDesc: '(no exact plates available).',
    summary: 'Load Summary (Per side)',
    empty: 'Enter a weight greater than 20kg.',
    plate: 'Plate',
    weight: 'Weight',
    qty: 'Qty',
    bar: 'Olympic Bar',
    legend: 'Color Code (IWF)',
    note: '* Calculation assumes 20kg bar and negligible collar weight.'
  },
  eus: {
    title: 'Disko Kalkulagailua',
    subtitle: 'Barraren kargaren 3D bistaratzea.',
    targetWeight: 'Helburu Pisu Totala (kg)',
    perSide: 'Aldeko',
    missing: 'Falta dira',
    missingDesc: '(ez dago disko zehatzik).',
    summary: 'Karga Laburpena (Aldeko)',
    empty: 'Sartu 20kg baino pisu handiagoa.',
    plate: 'Diskoa',
    weight: 'Pisua',
    qty: 'Kop.',
    bar: 'Barra Olinpikoa',
    legend: 'Kolore Kodea (IWF)',
    note: '* Kalkuluak 20kg-ko barra eta lepoko hutsalak onartzen ditu.'
  }
};

// Updated colors for more realistic "bumper plate" look or standard iron styling
const AVAILABLE_PLATES = [
  { 
    weight: 25, 
    color: 'bg-red-700', 
    gradientFrom: 'from-red-600', gradientVia: 'via-red-500', gradientTo: 'to-red-800',
    borderColor: 'border-red-900', 
    textColor: 'text-white', 
    heightClass: 'h-32 md:h-48', 
    widthClass: 'w-6 md:w-10' 
  },
  { 
    weight: 20, 
    color: 'bg-blue-700', 
    gradientFrom: 'from-blue-600', gradientVia: 'via-blue-500', gradientTo: 'to-blue-800',
    borderColor: 'border-blue-900', 
    textColor: 'text-white', 
    heightClass: 'h-32 md:h-48', 
    widthClass: 'w-5 md:w-9' 
  },
  { 
    weight: 15, 
    color: 'bg-yellow-600', 
    gradientFrom: 'from-yellow-500', gradientVia: 'via-yellow-400', gradientTo: 'to-yellow-700',
    borderColor: 'border-yellow-800', 
    textColor: 'text-white', 
    heightClass: 'h-28 md:h-40', 
    widthClass: 'w-4 md:w-8' 
  },
  { 
    weight: 10, 
    color: 'bg-green-700', 
    gradientFrom: 'from-green-600', gradientVia: 'via-green-500', gradientTo: 'to-green-800',
    borderColor: 'border-green-900', 
    textColor: 'text-white', 
    heightClass: 'h-20 md:h-32', 
    widthClass: 'w-3 md:w-6' 
  },
  { 
    weight: 5, 
    color: 'bg-neutral-200', 
    gradientFrom: 'from-neutral-100', gradientVia: 'via-white', gradientTo: 'to-neutral-300',
    borderColor: 'border-neutral-400', 
    textColor: 'text-black', 
    heightClass: 'h-14 md:h-20', 
    widthClass: 'w-2 md:w-4' 
  },
  { 
    weight: 2.5, 
    color: 'bg-neutral-800', 
    gradientFrom: 'from-neutral-700', gradientVia: 'via-neutral-600', gradientTo: 'to-black',
    borderColor: 'border-neutral-900', 
    textColor: 'text-white', 
    heightClass: 'h-10 md:h-14', 
    widthClass: 'w-2 md:w-3' 
  },
  { 
    weight: 1.25, 
    color: 'bg-neutral-500', 
    gradientFrom: 'from-neutral-400', gradientVia: 'via-neutral-300', gradientTo: 'to-neutral-600',
    borderColor: 'border-neutral-600', 
    textColor: 'text-white', 
    heightClass: 'h-8 md:h-12', 
    widthClass: 'w-1 md:w-2' 
  },
];

const BAR_WEIGHT = 20;

export const PlateCalculator: React.FC<PlateCalculatorProps> = ({ language }) => {
  const t = TEXTS[language] || TEXTS.es;
  const [targetWeight, setTargetWeight] = useState<string>('60');
  const [calculatedPlates, setCalculatedPlates] = useState<Plate[]>([]);
  const [remainder, setRemainder] = useState(0);

  useEffect(() => {
    calculatePlates();
  }, [targetWeight]);

  const calculatePlates = () => {
    const total = parseFloat(targetWeight);
    if (isNaN(total) || total < BAR_WEIGHT) {
      setCalculatedPlates([]);
      setRemainder(0);
      return;
    }

    let weightPerSide = (total - BAR_WEIGHT) / 2;
    const result: Plate[] = [];

    // Clone available plates
    const platesToCheck = AVAILABLE_PLATES.map(p => ({ ...p, count: 0 }));

    for (const plate of platesToCheck) {
      const count = Math.floor(weightPerSide / plate.weight);
      if (count > 0) {
        result.push({ ...plate, count });
        weightPerSide -= count * plate.weight;
        weightPerSide = Math.round(weightPerSide * 100) / 100;
      }
    }

    setCalculatedPlates(result);
    setRemainder(weightPerSide * 2);
  };

  // Helper to render a single plate
  const renderPlate = (plate: Plate, key: string) => (
    <div 
      key={key}
      className={`
        relative flex-shrink-0 mx-[1px]
        ${plate.heightClass} ${plate.widthClass}
        rounded-[2px] md:rounded-sm
        shadow-[2px_0_5px_rgba(0,0,0,0.5)]
        border-x border-black/20
        bg-gradient-to-b ${plate.gradientFrom} ${plate.gradientVia} ${plate.gradientTo}
      `}
    >
      {/* Side shine/reflection for 3D effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/10 via-transparent to-black/30 pointer-events-none"></div>
      
      {/* Weight Text (Only on larger plates) */}
      {(plate.weight >= 10) && (
        <div className="absolute inset-0 flex items-center justify-center opacity-70">
           <span className={`text-[8px] md:text-[10px] font-bold ${plate.textColor} -rotate-90 whitespace-nowrap`}>
              {plate.weight}
           </span>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full bg-gray-50 dark:bg-neutral-950 p-6 md:p-10 overflow-y-auto transition-colors duration-300">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-2 flex items-center gap-3">
          <Calculator className="text-orange-600 dark:text-orange-500" />
          {t.title}
        </h1>
        <p className="text-neutral-500 dark:text-neutral-400 mb-8">{t.subtitle}</p>

        {/* Input Section */}
        <div className="bg-white dark:bg-neutral-900 p-8 rounded-2xl border border-neutral-200 dark:border-neutral-800 mb-10 shadow-xl max-w-2xl mx-auto transition-colors">
           <div className="flex flex-col md:flex-row items-end gap-6">
              <div className="flex-1 w-full">
                 <label className="block text-sm text-neutral-500 dark:text-neutral-400 mb-2">{t.targetWeight}</label>
                 <div className="relative">
                    <input 
                      type="number" 
                      value={targetWeight}
                      onChange={(e) => setTargetWeight(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-neutral-950 text-neutral-900 dark:text-white text-4xl font-bold py-4 px-6 rounded-xl border border-neutral-300 dark:border-neutral-800 focus:border-orange-500 focus:outline-none"
                      placeholder="0"
                      step="1.25"
                    />
                    <span className="absolute right-6 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-600 font-bold text-xl">KG</span>
                 </div>
              </div>
              <div className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-neutral-950 rounded-xl border border-neutral-200 dark:border-neutral-800 min-w-[150px]">
                 <span className="text-neutral-500 text-xs uppercase tracking-wider mb-1">{t.perSide}</span>
                 <span className="text-2xl font-bold text-neutral-900 dark:text-white">
                    {parseFloat(targetWeight) > 20 ? ((parseFloat(targetWeight) - 20) / 2).toFixed(2) : 0} <span className="text-sm text-neutral-500">kg</span>
                 </span>
              </div>
           </div>
           
           {remainder > 0 && (
             <div className="mt-4 flex items-center gap-2 text-yellow-600 dark:text-yellow-500 bg-yellow-100 dark:bg-yellow-500/10 p-3 rounded-lg border border-yellow-200 dark:border-yellow-500/20">
                <AlertCircle size={20} />
                <span className="text-sm">{t.missing} <strong>{remainder} kg</strong> {t.missingDesc}</span>
             </div>
           )}
        </div>

        {/* =======================
            3D VISUALIZATION
        ======================== */}
        <div className="mb-12 relative">
           {/* Scene Container */}
           <div className="w-full h-[300px] md:h-[400px] bg-gradient-to-b from-neutral-200 to-neutral-400 dark:from-neutral-800 dark:to-black rounded-3xl overflow-hidden relative shadow-2xl border-t border-white/20 dark:border-neutral-700 flex flex-col items-center justify-center perspective-1000 transition-colors">
              
              {/* Floor / Reflection */}
              <div className="absolute bottom-0 w-full h-[40%] bg-gradient-to-t from-white/30 dark:from-neutral-800/50 to-transparent z-0"></div>
              <div className="absolute bottom-10 w-[80%] h-4 bg-black/20 dark:bg-black/60 blur-2xl rounded-full"></div>

              {/* Barbell Container */}
              <div className="relative z-10 flex items-center justify-center w-full px-4 md:px-10 scale-75 md:scale-100 transition-transform">
                  
                  {/* --- LEFT SIDE --- */}
                  <div className="flex items-center justify-end flex-1">
                      {/* Left Sleeve Tip (Visible if not full) */}
                      <div className="w-4 h-8 md:h-12 bg-gradient-to-r from-slate-400 via-slate-200 to-slate-400 rounded-l-sm shadow-md mr-[-2px]"></div>
                      
                      {/* Left Sleeve Shaft (Variable length visually) */}
                      <div className="h-8 md:h-12 w-16 md:w-24 bg-gradient-to-b from-slate-400 via-slate-100 to-slate-500 border-y border-slate-600 mr-[-2px]"></div>

                      {/* PLATES (Reverse order: Smallest -> Largest -> Collar) */}
                      {calculatedPlates.slice().reverse().map((group, groupIdx) => (
                          Array.from({length: group.count}).map((_, i) => (
                             renderPlate(group, `left-${groupIdx}-${i}`)
                          ))
                      ))}
                      
                      {/* Left Collar */}
                      <div className="w-4 md:w-6 h-12 md:h-16 bg-gradient-to-r from-neutral-300 to-neutral-400 rounded-l-md border-l border-white/50 shadow-lg z-20 mx-[2px]"></div>
                  </div>


                  {/* --- CENTER SHAFT --- */}
                  {/* The Grip Section */}
                  <div className="relative w-[300px] md:w-[450px] h-4 md:h-6 bg-gradient-to-b from-slate-400 via-slate-100 to-slate-500 shadow-inner z-10 flex items-center justify-center">
                      {/* Knurling Texture (Visual fake) */}
                      <div className="absolute left-10 w-32 h-full opacity-30 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]"></div>
                      <div className="absolute right-10 w-32 h-full opacity-30 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]"></div>
                      
                      {/* Center Smooth Patch */}
                      <div className="w-4 h-full bg-slate-200/20 absolute left-1/2 -translate-x-1/2"></div>
                  </div>


                  {/* --- RIGHT SIDE --- */}
                  <div className="flex items-center justify-start flex-1">
                      {/* Right Collar */}
                      <div className="w-4 md:w-6 h-12 md:h-16 bg-gradient-to-l from-neutral-300 to-neutral-400 rounded-r-md border-r border-white/50 shadow-lg z-20 mx-[2px]"></div>

                      {/* PLATES (Normal order: Largest -> Smallest -> Tip) */}
                      {calculatedPlates.map((group, groupIdx) => (
                          Array.from({length: group.count}).map((_, i) => (
                             renderPlate(group, `right-${groupIdx}-${i}`)
                          ))
                      ))}

                      {/* Right Sleeve Shaft */}
                      <div className="h-8 md:h-12 w-16 md:w-24 bg-gradient-to-b from-slate-400 via-slate-100 to-slate-500 border-y border-slate-600 ml-[-2px]"></div>

                      {/* Right Sleeve Tip */}
                      <div className="w-4 h-8 md:h-12 bg-gradient-to-l from-slate-400 via-slate-200 to-slate-400 rounded-r-sm shadow-md ml-[-2px]"></div>
                  </div>

              </div>
           </div>
        </div>

        {/* Breakdown Table */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           <div>
              <h3 className="text-neutral-900 dark:text-white font-semibold mb-4">{t.summary}</h3>
              <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-sm dark:shadow-none">
                 {calculatedPlates.length === 0 ? (
                    <div className="p-6 text-center text-neutral-500 text-sm">{t.empty}</div>
                 ) : (
                    <table className="w-full text-left">
                       <thead className="bg-gray-100 dark:bg-neutral-950 text-neutral-500 text-xs uppercase">
                          <tr>
                             <th className="p-4">{t.plate}</th>
                             <th className="p-4">{t.weight}</th>
                             <th className="p-4 text-right">{t.qty}</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                          {calculatedPlates.map((plate, idx) => (
                             <tr key={idx}>
                                <td className="p-4">
                                   <div className={`w-8 h-8 rounded-full ${plate.color} border-2 ${plate.borderColor} shadow-inner flex items-center justify-center`}>
                                      <div className="w-2 h-2 bg-neutral-900 rounded-full"></div>
                                   </div>
                                </td>
                                <td className={`p-4 font-bold ${plate.color.replace('bg-', 'text-').replace('-600', '-500').replace('-700', '-500')}`}>{plate.weight} kg</td>
                                <td className="p-4 text-right font-mono text-neutral-900 dark:text-white text-lg">x{plate.count}</td>
                             </tr>
                          ))}
                       </tbody>
                       <tfoot className="bg-gray-50 dark:bg-neutral-950">
                          <tr>
                             <td className="p-4 text-neutral-500 dark:text-neutral-400 font-medium">{t.bar}</td>
                             <td className="p-4 text-neutral-500 dark:text-neutral-400">20 kg</td>
                             <td className="p-4 text-right text-neutral-500 dark:text-neutral-400">1</td>
                          </tr>
                       </tfoot>
                    </table>
                 )}
              </div>
           </div>

           {/* Info / Legend */}
           <div className="bg-white dark:bg-neutral-900/50 p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 h-fit shadow-sm dark:shadow-none transition-colors">
              <h4 className="text-neutral-900 dark:text-white font-bold mb-4">{t.legend}</h4>
              <div className="space-y-3">
                 {AVAILABLE_PLATES.slice(0, 5).map(plate => (
                    <div key={plate.weight} className="flex items-center justify-between text-sm p-2 rounded hover:bg-gray-100 dark:hover:bg-neutral-800/50 transition-colors">
                       <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full ${plate.color}`}></div>
                          <span className="text-neutral-700 dark:text-neutral-300">{plate.weight} kg</span>
                       </div>
                       <span className="text-neutral-500 font-mono text-xs">x 2 = {plate.weight * 2}kg</span>
                    </div>
                 ))}
              </div>
              <p className="text-xs text-neutral-500 mt-6 pt-4 border-t border-neutral-200 dark:border-neutral-800">
                 {t.note}
              </p>
           </div>
        </div>
      </div>
    </div>
  );
};
