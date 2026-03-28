
import React, { useEffect, useState } from 'react';
import { Language } from '../types';
import { Tablet, Monitor, Smartphone, Download, CheckCircle, ArrowRight, Share, Package, Zap, Database, Wifi } from 'lucide-react';

interface AppDownloadsProps {
    language: Language;
}

const TEXTS = {
    es: {
        title: 'Descargar Coach AI',
        subtitle: 'Aplicaciones nativas reales para tus dispositivos. Misma cuenta, misma base de datos Firebase, todas las funcionalidades.',
        tabletTitle: 'Samsung Tablet',
        tabletDesc: 'Aplicación Android nativa (.APK) para tu Samsung Galaxy Tab. Se instala como cualquier app real con su icono en el escritorio.',
        tabletBtn: 'Generar APK',
        tabletSteps: [
            'Instalar Android Studio en tu PC',
            'Ejecutar: npm run cap:build:android',
            'El APK se genera en android/app/build/outputs/apk/debug/',
            'Transferir el APK a tu tablet Samsung',
            'Activar "Fuentes desconocidas" en Ajustes > Seguridad',
            'Abrir el APK en la tablet para instalarlo'
        ],
        windowsTitle: 'Windows PC',
        windowsDesc: 'Aplicación de escritorio real (.EXE) para Windows. Se ejecuta como cualquier programa nativo con su propio icono.',
        windowsBtn: 'Descargar para Windows',
        windowsBtnAlt: 'Regenerar .EXE',
        windowsSteps: [
            'Se descarga la carpeta "Coach AI" completa',
            'Abre la carpeta descargada',
            'Ejecuta "Coach AI.exe" para abrir la app',
            'Opcionalmente: crea un acceso directo en el escritorio'
        ],
        iphoneTitle: 'iPhone / iPad',
        iphoneDesc: 'Aplicación iOS nativa. Requiere un Mac con Xcode y una cuenta de desarrollador de Apple.',
        iphoneSteps: [
            'Tener un Mac con Xcode instalado',
            'Ejecutar: npx cap add ios',
            'Ejecutar: npx cap sync ios',
            'Abrir el proyecto en Xcode: npx cap open ios',
            'Conectar tu iPhone y compilar desde Xcode'
        ],
        features: 'Todas las funcionalidades incluidas',
        featuresList: [
            'Análisis de vídeo con IA',
            'Registro de fuerza y entrenamientos',
            'Chat con entrenador IA',
            'Planes de entrenamiento en PDF',
            'Misma base de datos en la nube'
        ],
        recommended: 'Recomendado',
        ready: 'Listo',
        native: 'App Nativa',
        sameDb: 'Misma Base de Datos',
        realtime: 'Tiempo Real',
        buildRequired: 'Requiere compilación',
        downloadReady: '¡Descarga lista!',
        generating: 'Generando...',
        openFolder: 'Abrir carpeta del .EXE'
    },
    ing: {
        title: 'Download Coach AI',
        subtitle: 'Real native applications for your devices. Same account, same Firebase database, all features.',
        tabletTitle: 'Samsung Tablet',
        tabletDesc: 'Native Android app (.APK) for your Samsung Galaxy Tab. Installs like any real app with its own home screen icon.',
        tabletBtn: 'Generate APK',
        tabletSteps: [
            'Install Android Studio on your PC',
            'Run: npm run cap:build:android',
            'APK is generated at android/app/build/outputs/apk/debug/',
            'Transfer the APK to your Samsung tablet',
            'Enable "Unknown sources" in Settings > Security',
            'Open the APK on your tablet to install it'
        ],
        windowsTitle: 'Windows PC',
        windowsDesc: 'Real desktop application (.EXE) for Windows. Runs like any native program with its own icon.',
        windowsBtn: 'Download for Windows',
        windowsBtnAlt: 'Regenerate .EXE',
        windowsSteps: [
            'The "Coach AI" folder downloads completely',
            'Open the downloaded folder',
            'Run "Coach AI.exe" to open the app',
            'Optionally: create a desktop shortcut'
        ],
        iphoneTitle: 'iPhone / iPad',
        iphoneDesc: 'Native iOS app. Requires a Mac with Xcode and an Apple Developer account.',
        iphoneSteps: [
            'Have a Mac with Xcode installed',
            'Run: npx cap add ios',
            'Run: npx cap sync ios',
            'Open project in Xcode: npx cap open ios',
            'Connect your iPhone and build from Xcode'
        ],
        features: 'All features included',
        featuresList: [
            'AI Video Analysis',
            'Strength & Training Logs',
            'AI Coach Chat',
            'PDF Training Plans',
            'Same cloud database'
        ],
        recommended: 'Recommended',
        ready: 'Ready',
        native: 'Native App',
        sameDb: 'Same Database',
        realtime: 'Real-time',
        buildRequired: 'Build required',
        downloadReady: 'Download ready!',
        generating: 'Generating...',
        openFolder: 'Open .EXE folder'
    },
    eus: {
        title: 'Coach AI Deskargatu',
        subtitle: 'Benetako aplikazio natiboak zure gailuentzat. Kontu bera, Firebase datu-base bera, funtzionalitate guztiak.',
        tabletTitle: 'Samsung Tableta',
        tabletDesc: 'Android aplikazio natiboa (.APK) zure Samsung Galaxy Tab-erako. Edozein aplikazio errealaren moduan instalatzen da.',
        tabletBtn: 'APK Sortu',
        tabletSteps: [
            'Instalatu Android Studio zure PC-an',
            'Exekutatu: npm run cap:build:android',
            'APKa android/app/build/outputs/apk/debug/ karpetan sortzen da',
            'Transferitu APKa zure Samsung tabletara',
            'Gaitu "Iturri ezezagunak" Ezarpenak > Segurtasuna-n',
            'Ireki APKa tabletan instalatzeko'
        ],
        windowsTitle: 'Windows PC',
        windowsDesc: 'Benetako mahaigaineko aplikazioa (.EXE) Windows-erako. Edozein programa natiboren moduan exekutatzen da.',
        windowsBtn: 'Windows-erako deskargatu',
        windowsBtnAlt: '.EXE Birsortu',
        windowsSteps: [
            '"Coach AI" karpeta osoa deskargatzen da',
            'Ireki deskargatutako karpeta',
            'Exekutatu "Coach AI.exe" aplikazioa irekitzeko',
            'Aukeran: sortu zuzeneko sarbidea mahaigainean'
        ],
        iphoneTitle: 'iPhone / iPad',
        iphoneDesc: 'iOS aplikazio natiboa. Mac bat behar da Xcode-rekin eta Apple Developer kontu bat.',
        iphoneSteps: [
            'Eduki Mac bat Xcode-rekin instalatuta',
            'Exekutatu: npx cap add ios',
            'Exekutatu: npx cap sync ios',
            'Ireki proiektua Xcode-n: npx cap open ios',
            'Konektatu zure iPhone-a eta konpilatu Xcode-tik'
        ],
        features: 'Funtzionalitate guztiak barne',
        featuresList: [
            'Bideo analisia IArekin',
            'Indar eta entrenamendu erregistroak',
            'IA entrenatzaile txata',
            'PDF entrenamendu planak',
            'Hodeiko datu-base bera'
        ],
        recommended: 'Gomendatua',
        ready: 'Prest',
        native: 'App Natiboa',
        sameDb: 'Datu-base Bera',
        realtime: 'Denbora Errealean',
        buildRequired: 'Konpilazioa behar da',
        downloadReady: 'Deskarga prest!',
        generating: 'Sortzen...',
        openFolder: '.EXE karpeta ireki'
    }
};

export const AppDownloads: React.FC<AppDownloadsProps> = ({ language }) => {
    const t = TEXTS[language] || TEXTS.es;
    const [showSteps, setShowSteps] = useState<string | null>(null);

    return (
        <div className="h-full overflow-y-auto p-4 md:p-8">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="text-center mb-10 md:mb-14">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600/10 border border-orange-500/20 rounded-full text-orange-500 text-xs font-bold uppercase tracking-wider mb-6">
                        <Package size={14} />
                        <span>{t.native}</span>
                    </div>
                    <h1 className="text-3xl md:text-5xl font-black text-white mb-4 tracking-tight">
                        {t.title}
                    </h1>
                    <p className="text-neutral-400 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
                        {t.subtitle}
                    </p>

                    {/* Feature pills */}
                    <div className="flex flex-wrap justify-center gap-3 mt-6">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-900/20 border border-green-800/30 rounded-full text-green-400 text-xs font-bold">
                            <Database size={12} />
                            {t.sameDb}
                        </div>
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-900/20 border border-blue-800/30 rounded-full text-blue-400 text-xs font-bold">
                            <Wifi size={12} />
                            {t.realtime}
                        </div>
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-900/20 border border-purple-800/30 rounded-full text-purple-400 text-xs font-bold">
                            <Zap size={12} />
                            {t.native}
                        </div>
                    </div>
                </div>

                {/* Download Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6 mb-12">

                    {/* TABLET CARD */}
                    <div className="relative group bg-gradient-to-b from-neutral-900 to-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden hover:border-orange-500/50 transition-all duration-300">
                        {/* Recommended badge */}
                        <div className="absolute top-4 right-4 bg-orange-600 text-white text-[10px] font-black uppercase px-3 py-1 rounded-full tracking-wider shadow-lg shadow-orange-600/30 z-10">
                            ★ {t.recommended}
                        </div>

                        <div className="p-6 md:p-8">
                            <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-orange-700 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-orange-600/20 group-hover:scale-110 transition-transform duration-300">
                                <Tablet size={32} className="text-white" />
                            </div>

                            <h3 className="text-xl font-bold text-white mb-2">{t.tabletTitle}</h3>
                            <p className="text-sm text-neutral-400 mb-4 leading-relaxed">{t.tabletDesc}</p>

                            <div className="flex flex-wrap gap-2 mb-6">
                                {['.APK', 'Samsung Galaxy Tab', 'Android', 'Capacitor'].map(tag => (
                                    <span key={tag} className="text-[10px] bg-neutral-800 text-neutral-400 px-2 py-1 rounded-md font-medium">{tag}</span>
                                ))}
                            </div>

                            <button
                                onClick={() => setShowSteps(showSteps === 'tablet' ? null : 'tablet')}
                                className="w-full py-3.5 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl transition-all transform hover:scale-[1.02] shadow-lg shadow-orange-600/20 flex items-center justify-center gap-2"
                            >
                                <Download size={18} />
                                {t.tabletBtn}
                            </button>

                            {showSteps === 'tablet' && (
                                <div className="mt-4 space-y-2.5 animate-in slide-in-from-top-2 duration-200">
                                    {t.tabletSteps.map((step, i) => (
                                        <div key={i} className="flex items-start gap-3 text-xs text-neutral-400">
                                            <div className="w-5 h-5 bg-orange-600/20 text-orange-500 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-black mt-0.5">
                                                {i + 1}
                                            </div>
                                            <span className="leading-relaxed">{step.startsWith('Ejecutar') || step.startsWith('Run') || step.startsWith('Exekutatu') ? <code className="bg-neutral-800 px-1 rounded text-orange-400">{step}</code> : step}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-600 via-orange-500 to-orange-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>

                    {/* WINDOWS CARD */}
                    <div className="relative group bg-gradient-to-b from-neutral-900 to-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden hover:border-blue-500/50 transition-all duration-300">
                        <div className="absolute top-4 right-4 bg-green-600 text-white text-[10px] font-black uppercase px-3 py-1 rounded-full tracking-wider shadow-lg shadow-green-600/30 z-10">
                            ✓ {t.ready}
                        </div>

                        <div className="p-6 md:p-8">
                            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-blue-600/20 group-hover:scale-110 transition-transform duration-300">
                                <Monitor size={32} className="text-white" />
                            </div>

                            <h3 className="text-xl font-bold text-white mb-2">{t.windowsTitle}</h3>
                            <p className="text-sm text-neutral-400 mb-4 leading-relaxed">{t.windowsDesc}</p>

                            <div className="flex flex-wrap gap-2 mb-6">
                                {['.EXE', 'Windows 10+', 'Electron', 'x64'].map(tag => (
                                    <span key={tag} className="text-[10px] bg-neutral-800 text-neutral-400 px-2 py-1 rounded-md font-medium">{tag}</span>
                                ))}
                            </div>

                            {/* Windows download is already built */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 text-green-400 bg-green-900/20 px-4 py-3 rounded-xl border border-green-800/30">
                                    <CheckCircle size={18} />
                                    <span className="font-bold text-sm">{t.downloadReady}</span>
                                </div>

                                <button
                                    onClick={() => setShowSteps(showSteps === 'windows' ? null : 'windows')}
                                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all transform hover:scale-[1.02] shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                                >
                                    <Download size={18} />
                                    {t.openFolder}
                                </button>
                            </div>

                            {showSteps === 'windows' && (
                                <div className="mt-4 space-y-2.5 animate-in slide-in-from-top-2 duration-200">
                                    <div className="bg-blue-900/20 border border-blue-800/30 rounded-lg p-3 text-xs text-blue-300">
                                        <p className="font-bold mb-1">📁 {t.windowsTitle} .EXE:</p>
                                        <code className="text-blue-400 text-[11px] break-all">dist-electron\Coach AI-win32-x64\Coach AI.exe</code>
                                    </div>
                                    {t.windowsSteps.map((step, i) => (
                                        <div key={i} className="flex items-start gap-3 text-xs text-neutral-400">
                                            <div className="w-5 h-5 bg-blue-600/20 text-blue-500 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-black mt-0.5">
                                                {i + 1}
                                            </div>
                                            <span className="leading-relaxed">{step}</span>
                                        </div>
                                    ))}
                                    <div className="text-[10px] text-neutral-500 mt-2 bg-neutral-800/50 p-2 rounded">
                                        💡 Para regenerar: <code className="text-blue-400">npm run electron:build</code>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>

                    {/* IPHONE CARD */}
                    <div className="relative group bg-gradient-to-b from-neutral-900 to-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden hover:border-purple-500/50 transition-all duration-300">
                        <div className="p-6 md:p-8">
                            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-700 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-purple-600/20 group-hover:scale-110 transition-transform duration-300">
                                <Smartphone size={32} className="text-white" />
                            </div>

                            <h3 className="text-xl font-bold text-white mb-2">{t.iphoneTitle}</h3>
                            <p className="text-sm text-neutral-400 mb-4 leading-relaxed">{t.iphoneDesc}</p>

                            <div className="flex flex-wrap gap-2 mb-6">
                                {['.IPA', 'iPhone', 'iPad', 'Xcode'].map(tag => (
                                    <span key={tag} className="text-[10px] bg-neutral-800 text-neutral-400 px-2 py-1 rounded-md font-medium">{tag}</span>
                                ))}
                            </div>

                            <button
                                onClick={() => setShowSteps(showSteps === 'iphone' ? null : 'iphone')}
                                className="w-full py-3.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl transition-all transform hover:scale-[1.02] shadow-lg shadow-purple-600/20 flex items-center justify-center gap-2"
                            >
                                <Download size={18} />
                                {t.buildRequired}
                            </button>

                            {showSteps === 'iphone' && (
                                <div className="mt-4 space-y-2.5 animate-in slide-in-from-top-2 duration-200">
                                    {t.iphoneSteps.map((step, i) => (
                                        <div key={i} className="flex items-start gap-3 text-xs text-neutral-400">
                                            <div className="w-5 h-5 bg-purple-600/20 text-purple-500 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-black mt-0.5">
                                                {i + 1}
                                            </div>
                                            <span className="leading-relaxed">{step.startsWith('Ejecutar') || step.startsWith('Run') || step.startsWith('Exekutatu') || step.startsWith('Abrir') || step.startsWith('Open') || step.startsWith('Ireki') ? <code className="bg-neutral-800 px-1 rounded text-purple-400">{step}</code> : step}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-600 via-purple-500 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                </div>

                {/* Features section */}
                <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 md:p-8">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <CheckCircle size={20} className="text-green-500" />
                        {t.features}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {t.featuresList.map((feature, i) => (
                            <div key={i} className="flex items-center gap-3 text-sm text-neutral-300">
                                <ArrowRight size={14} className="text-orange-500 flex-shrink-0" />
                                {feature}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
