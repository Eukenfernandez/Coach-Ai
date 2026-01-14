
import React from 'react';
import { ArrowRight, Play, Activity, BarChart3, MessageSquare, Video } from 'lucide-react';
import { Language } from '../types';

interface LandingPageProps {
    onContinue: () => void;
    language: Language;
}

const TEXTS = {
    es: {
        headline: 'Analiza tu Técnica con IA',
        subheadline: 'Coach AI te ayuda a mejorar tu rendimiento deportivo con análisis de vídeo inteligente y feedback personalizado.',
        cta: 'Comenzar Ahora',
        feature1: 'Análisis de Vídeo',
        feature1Desc: 'Sube vídeos y obtén feedback instantáneo sobre tu técnica.',
        feature2: 'Detección de Pose',
        feature2Desc: 'Visualiza tu postura con esqueleto en tiempo real.',
        feature3: 'Chat con IA',
        feature3Desc: 'Pregunta a tu coach virtual cualquier duda técnica.',
        feature4: 'Seguimiento de Progreso',
        feature4Desc: 'Registra marcas, pesos y rendimiento a lo largo del tiempo.',
        watch: 'Mira cómo funciona'
    },
    ing: {
        headline: 'Analyze Your Technique with AI',
        subheadline: 'Coach AI helps you improve your sports performance with intelligent video analysis and personalized feedback.',
        cta: 'Get Started',
        feature1: 'Video Analysis',
        feature1Desc: 'Upload videos and get instant feedback on your technique.',
        feature2: 'Pose Detection',
        feature2Desc: 'Visualize your posture with real-time skeleton overlay.',
        feature3: 'AI Chat',
        feature3Desc: 'Ask your virtual coach any technical questions.',
        feature4: 'Progress Tracking',
        feature4Desc: 'Track records, weights, and performance over time.',
        watch: 'See how it works'
    },
    eus: {
        headline: 'Analizatu Zure Teknika IArekin',
        subheadline: 'Coach AI-k zure kirol-errendimendua hobetzen laguntzen dizu bideo-analisi adimentsua eta feedback pertsonalizatua erabiliz.',
        cta: 'Hasi Orain',
        feature1: 'Bideo Analisia',
        feature1Desc: 'Igo bideoak eta lortu feedback azkarra zure teknikari buruz.',
        feature2: 'Jarrera Detekzioa',
        feature2Desc: 'Ikusi zure jarrera eskeletoa denbora errealean.',
        feature3: 'IA Txat',
        feature3Desc: 'Galdetu zure entrenatzaile birtualari edozein zalantza tekniko.',
        feature4: 'Aurrerapenaren Jarraipena',
        feature4Desc: 'Erregistratu markak, pisuak eta errendimendua denboran zehar.',
        watch: 'Ikusi nola funtzionatzen duen'
    }
};

export const LandingPage: React.FC<LandingPageProps> = ({ onContinue, language }) => {
    const t = TEXTS[language] || TEXTS.es;

    const features = [
        { icon: Video, title: t.feature1, desc: t.feature1Desc },
        { icon: Activity, title: t.feature2, desc: t.feature2Desc },
        { icon: MessageSquare, title: t.feature3, desc: t.feature3Desc },
        { icon: BarChart3, title: t.feature4, desc: t.feature4Desc },
    ];

    return (
        <div className="min-h-screen w-full bg-white dark:bg-black overflow-x-hidden transition-colors duration-300">
            {/* Hero Section */}
            <div className="relative min-h-screen flex flex-col items-center justify-center px-4 py-12">
                {/* Background Gradient */}
                <div className="absolute inset-0 z-0 overflow-hidden">
                    <div className="absolute top-0 left-1/4 w-96 h-96 bg-orange-500/20 rounded-full blur-[120px]" />
                    <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-orange-600/15 rounded-full blur-[100px]" />
                </div>

                {/* Content */}
                <div className="relative z-10 flex flex-col items-center text-center max-w-4xl mx-auto">
                    {/* Logo */}
                    <div className="w-16 h-16 bg-orange-600 rounded-2xl flex items-center justify-center mb-6 rotate-3 shadow-[0_0_30px_rgba(234,88,12,0.5)]">
                        <svg width="32\" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                    </div>

                    <h1 className="text-4xl md:text-6xl font-bold text-neutral-900 dark:text-white mb-4 tracking-tight">
                        Coach <span className="text-orange-600 dark:text-orange-500">AI</span>
                    </h1>

                    <p className="text-xl md:text-2xl text-neutral-900 dark:text-white font-semibold mb-2">
                        {t.headline}
                    </p>
                    <p className="text-neutral-500 dark:text-neutral-400 max-w-xl mb-8 text-sm md:text-base">
                        {t.subheadline}
                    </p>

                    {/* CTA Button */}
                    <button
                        onClick={onContinue}
                        className="group px-8 py-4 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-full transition-all transform hover:scale-105 shadow-lg shadow-orange-500/30 flex items-center gap-3 text-lg"
                    >
                        <span>{t.cta}</span>
                        <ArrowRight className="group-hover:translate-x-1 transition-transform" size={22} />
                    </button>

                    {/* Demo Video Section */}
                    <div className="mt-12 w-full max-w-2xl">
                        <p className="text-neutral-500 dark:text-neutral-400 text-sm mb-4 flex items-center justify-center gap-2">
                            <Play size={16} className="text-orange-500" />
                            {t.watch}
                        </p>
                        <div className="relative rounded-2xl overflow-hidden border border-neutral-200 dark:border-neutral-800 shadow-2xl bg-black">
                            <video
                                src="/video/video_.mp4"
                                autoPlay
                                loop
                                muted
                                playsInline
                                className="w-full h-auto"
                            />
                            {/* Gradient overlay for a polished look */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent pointer-events-none" />
                        </div>
                    </div>
                </div>

                {/* Features Grid */}
                <div className="relative z-10 mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto px-4">
                    {features.map((feat, i) => (
                        <div
                            key={i}
                            className="p-4 bg-white/80 dark:bg-neutral-900/80 backdrop-blur border border-neutral-200 dark:border-neutral-800 rounded-2xl text-center hover:border-orange-500/50 transition-colors"
                        >
                            <div className="w-10 h-10 bg-orange-100 dark:bg-orange-500/20 rounded-xl flex items-center justify-center mx-auto mb-3">
                                <feat.icon className="text-orange-600 dark:text-orange-500" size={20} />
                            </div>
                            <h3 className="font-bold text-neutral-900 dark:text-white text-sm mb-1">{feat.title}</h3>
                            <p className="text-xs text-neutral-500 dark:text-neutral-400">{feat.desc}</p>
                        </div>
                    ))}
                </div>

                {/* Secondary CTA at bottom */}
                <div className="mt-12">
                    <button
                        onClick={onContinue}
                        className="px-6 py-3 bg-neutral-900 dark:bg-white text-white dark:text-black font-bold rounded-full transition-all hover:opacity-90 flex items-center gap-2"
                    >
                        <span>{t.cta}</span>
                        <ArrowRight size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
};
