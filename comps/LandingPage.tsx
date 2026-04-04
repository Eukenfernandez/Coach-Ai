
import React, { useState } from 'react';
import { ArrowRight, Play, Activity, BarChart3, MessageSquare, Video, Zap, Target, Users, TrendingUp, Shield, Clock, CheckCircle, Star, ChevronDown, Settings, Globe } from 'lucide-react';
import { Language } from '../types';

interface LandingPageProps {
    onContinue: () => void;
    language: Language;
    onLanguageChange?: (lang: Language) => void;
}

const TEXTS = {
    es: {
        // Header
        startBtn: 'Comenzar',

        // Hero
        headline: 'Tu Entrenador Personal Impulsado por IA',
        subheadline: 'Analiza tu técnica deportiva con inteligencia artificial, recibe feedback instantáneo y lleva tu rendimiento al siguiente nivel.',
        watchDemo: 'Mira cómo funciona',

        // Stats
        stat1: 'Atletas Activos',
        stat2: 'Análisis Realizados',
        stat3: 'Deportes Soportados',

        // Features Section
        featuresTitle: '¿Qué puedes hacer con Coach AI?',
        featuresSubtitle: 'Todas las herramientas que necesitas para mejorar tu rendimiento deportivo en una sola aplicación.',

        // Feature Items
        f1Title: 'Análisis de Vídeo con IA',
        f1Desc: 'Sube cualquier vídeo de tu entrenamiento o competición. Nuestra IA analizará tu técnica fotograma a fotograma, identificando puntos de mejora específicos para tu deporte.',

        f2Title: 'Detección de Postura en Tiempo Real',
        f2Desc: 'Visualiza tu esqueleto corporal superpuesto en el vídeo. Mide ángulos articulares, detecta desalineaciones y compara tu postura con la técnica ideal.',

        f3Title: 'Chat con Coach Virtual',
        f3Desc: 'Pregunta cualquier duda técnica a tu entrenador virtual. Recibe explicaciones detalladas, ejercicios correctivos y consejos personalizados para tu disciplina.',

        f4Title: 'Comparación Lado a Lado',
        f4Desc: 'Compara dos vídeos simultáneamente: tu técnica actual vs. un atleta profesional, o tu progreso de antes vs. después. Sincroniza los fotogramas para un análisis preciso.',

        f5Title: 'Seguimiento de Fuerza y Marcas',
        f5Desc: 'Registra tus RMs, tiempos, distancias y cualquier métrica relevante. Visualiza gráficos de progreso y detecta tendencias en tu rendimiento a lo largo del tiempo.',

        f6Title: 'Gestión de Entrenamientos',
        f6Desc: 'Organiza tus planes de entrenamiento, sube PDFs de rutinas, y mantén un historial completo de tus sesiones y competiciones.',

        // Benefits Section
        benefitsTitle: '¿Cómo mejorará tus entrenamientos?',

        b1Title: 'Feedback Instantáneo',
        b1Desc: 'No esperes al próximo entrenamiento con tu coach. Obtén análisis técnico inmediato después de cada sesión.',

        b2Title: 'Corrección de Errores',
        b2Desc: 'Identifica y corrige vicios técnicos antes de que se conviertan en lesiones o limiten tu rendimiento.',

        b3Title: 'Progreso Medible',
        b3Desc: 'Deja de adivinar. Mide tu progreso con datos concretos y toma decisiones basadas en evidencia.',

        b4Title: 'Multi-Deporte',
        b4Desc: 'Atletismo, Gimnasio, Fútbol, Natación, Ciclismo y más. Reglas biomecánicas específicas para cada disciplina.',

        // Sports Section
        sportsTitle: 'Para todos los deportes',
        sportsDesc: 'Desde lanzamiento de jabalina hasta powerlifting, desde natación hasta artes marciales. Coach AI se adapta a tu deporte.',

        // CTA Section
        ctaTitle: 'Empieza a mejorar hoy',
        ctaDesc: 'Únete a miles de atletas que ya están optimizando su técnica con inteligencia artificial.',
        ctaBtn: 'Crear Cuenta Gratis',

        // For who
        forTitle: '¿Para quién es Coach AI?',
        for1: 'Atletas que quieren mejorar su técnica de forma autónoma',
        for2: 'Entrenadores que buscan herramientas de análisis avanzado',
        for3: 'Equipos deportivos que necesitan feedback objetivo',
        for4: 'Cualquier persona comprometida con su rendimiento físico',

        // AI Section
        aiTitle: 'Potenciado por Gemini AI',
        aiSubtitle: 'Inteligencia artificial de Google al servicio de tu entrenamiento',
        aiDesc: 'Coach AI utiliza Gemini, el modelo de IA más avanzado de Google, para analizar tus vídeos y proporcionarte feedback técnico de nivel profesional. Pregunta cualquier cosa sobre tu técnica y recibe respuestas expertas al instante.',
        aiFeature1: 'Análisis de vídeo fotograma a fotograma',
        aiFeature2: 'Respuestas contextualizadas a tu deporte',
        aiFeature3: 'Consejos biomecánicos específicos',
    },
    ing: {
        startBtn: 'Get Started',
        headline: 'Your AI-Powered Personal Coach',
        subheadline: 'Analyze your sports technique with artificial intelligence, get instant feedback, and take your performance to the next level.',
        watchDemo: 'See how it works',
        stat1: 'Active Athletes',
        stat2: 'Analyses Performed',
        stat3: 'Sports Supported',
        featuresTitle: 'What can you do with Coach AI?',
        featuresSubtitle: 'All the tools you need to improve your sports performance in one app.',
        f1Title: 'AI Video Analysis',
        f1Desc: 'Upload any video from your training or competition. Our AI will analyze your technique frame by frame, identifying specific improvement points for your sport.',
        f2Title: 'Real-Time Pose Detection',
        f2Desc: 'Visualize your body skeleton overlaid on the video. Measure joint angles, detect misalignments, and compare your posture with ideal technique.',
        f3Title: 'Virtual Coach Chat',
        f3Desc: 'Ask any technical question to your virtual coach. Get detailed explanations, corrective exercises, and personalized tips for your discipline.',
        f4Title: 'Side-by-Side Comparison',
        f4Desc: 'Compare two videos simultaneously: your current technique vs. a pro athlete, or your before vs. after progress. Sync frames for precise analysis.',
        f5Title: 'Strength & Records Tracking',
        f5Desc: 'Log your RMs, times, distances, and any relevant metric. View progress charts and detect trends in your performance over time.',
        f6Title: 'Training Management',
        f6Desc: 'Organize your training plans, upload routine PDFs, and keep a complete history of your sessions and competitions.',
        benefitsTitle: 'How will it improve your training?',
        b1Title: 'Instant Feedback',
        b1Desc: 'Don\'t wait for your next session with your coach. Get immediate technical analysis after every workout.',
        b2Title: 'Error Correction',
        b2Desc: 'Identify and fix technical flaws before they become injuries or limit your performance.',
        b3Title: 'Measurable Progress',
        b3Desc: 'Stop guessing. Measure your progress with concrete data and make evidence-based decisions.',
        b4Title: 'Multi-Sport',
        b4Desc: 'Athletics, Gym, Soccer, Swimming, Cycling, and more. Sport-specific biomechanical rules for each discipline.',
        sportsTitle: 'For all sports',
        sportsDesc: 'From javelin throw to powerlifting, from swimming to martial arts. Coach AI adapts to your sport.',
        ctaTitle: 'Start improving today',
        ctaDesc: 'Join thousands of athletes already optimizing their technique with artificial intelligence.',
        ctaBtn: 'Create Free Account',
        forTitle: 'Who is Coach AI for?',
        for1: 'Athletes who want to improve their technique independently',
        for2: 'Coaches looking for advanced analysis tools',
        for3: 'Sports teams that need objective feedback',
        for4: 'Anyone committed to their physical performance',

        // AI Section
        aiTitle: 'Powered by Gemini AI',
        aiSubtitle: 'Google\'s artificial intelligence at the service of your training',
        aiDesc: 'Coach AI uses Gemini, Google\'s most advanced AI model, to analyze your videos and provide professional-level technical feedback. Ask anything about your technique and receive expert answers instantly.',
        aiFeature1: 'Frame-by-frame video analysis',
        aiFeature2: 'Sport-contextual responses',
        aiFeature3: 'Specific biomechanical advice',
    },
    eus: {
        startBtn: 'Hasi',
        headline: 'Zure Entrenatzaile Pertsonala IArekin',
        subheadline: 'Analizatu zure kirol-teknika adimen artifizialarekin, jaso feedback azkarra eta eraman zure errendimendua hurrengo mailara.',
        watchDemo: 'Ikusi nola funtzionatzen duen',
        stat1: 'Atleta Aktiboak',
        stat2: 'Analisi Egindakoak',
        stat3: 'Kirol Onartuta',
        featuresTitle: 'Zer egin dezakezu Coach AI-rekin?',
        featuresSubtitle: 'Zure kirol-errendimendua hobetzeko behar dituzun tresna guztiak aplikazio bakarrean.',
        f1Title: 'IA Bideo Analisia',
        f1Desc: 'Igo edozein bideo zure entrenamendutik edo lehiaketatik. Gure IAk zure teknika fotograma fotograma aztertuko du.',
        f2Title: 'Jarrera Detekzioa Denbora Errealean',
        f2Desc: 'Ikusi zure gorputz-eskeletoa bideoan gainjarrita. Neurtu artikulazioen angeluak eta konparatu zure jarrera teknika idealarekin.',
        f3Title: 'Entrenatzaile Birtualarekin Txat',
        f3Desc: 'Galdetu edozein zalantza tekniko zure entrenatzaile birtualari. Jaso azalpen zehatzak eta aholku pertsonalizatuak.',
        f4Title: 'Aldez Aldeko Konparaketa',
        f4Desc: 'Konparatu bi bideo aldi berean: zure teknika oraingoa vs. atleta profesional bat, edo zure aurrerapena.',
        f5Title: 'Indar eta Marken Jarraipena',
        f5Desc: 'Erregistratu zure RMak, denborak, distantziak eta edozein metrika garrantzitsu. Ikusi aurrerapen grafikoak.',
        f6Title: 'Entrenamendu Kudeaketa',
        f6Desc: 'Antolatu zure entrenamendu planak, igo PDF errutinak eta mantendu zure saio eta lehiaketen historia osoa.',
        benefitsTitle: 'Nola hobetuko ditu zure entrenamenduk?',
        b1Title: 'Feedback Azkarra',
        b1Desc: 'Ez itxaron hurrengo entrenamendura. Lortu analisi tekniko azkarra saio bakoitzaren ondoren.',
        b2Title: 'Erroreen Zuzenketa',
        b2Desc: 'Identifikatu eta zuzendu akats teknikoak lesioak bihurtu aurretik.',
        b3Title: 'Aurrerapen Neurgarria',
        b3Desc: 'Utzi asmatzeari. Neurtu zure aurrerapena datu zehatzekin.',
        b4Title: 'Multi-Kirol',
        b4Desc: 'Atletismoa, Gimnasioa, Futbola, Igeriketa, Txirrindularitza eta gehiago.',
        sportsTitle: 'Kirol guztietarako',
        sportsDesc: 'Jabalina jaurtiketatik powerlifting-era, igeritik arte martzialetara. Coach AI zure kirolera egokitzen da.',
        ctaTitle: 'Hasi hobetzen gaur',
        ctaDesc: 'Batu adimen artifizialarekin dagoeneko beren teknika optimizatzen ari diren milaka atletari.',
        ctaBtn: 'Sortu Kontu Doakoa',
        forTitle: 'Norentzat da Coach AI?',
        for1: 'Beren teknika modu autonomoan hobetu nahi duten atletak',
        for2: 'Analisi aurreratu tresnak bilatzen dituzten entrenatzaileak',
        for3: 'Feedback objektiboa behar duten kirol taldeak',
        for4: 'Bere errendimendu fisikoarekin konprometitutako edonor',

        // AI Section
        aiTitle: 'Gemini IA-rekin Potentziaturik',
        aiSubtitle: 'Google-ren adimen artifiziala zure entrenamenduaren zerbitzura',
        aiDesc: 'Coach AI-k Gemini erabiltzen du, Google-ren IA eredu aurreratuena, zure bideoak aztertzeko eta feedback tekniko profesionala emateko. Galdetu edozer zure teknikari buruz eta jaso aditu erantzunak berehala.',
        aiFeature1: 'Fotograma fotogramako bideo analisia',
        aiFeature2: 'Zure kirolari egokitutako erantzunak',
        aiFeature3: 'Aholku biomekaniko espezifikoak',
    }
};

export const LandingPage: React.FC<LandingPageProps> = ({ onContinue, language, onLanguageChange }) => {
    const t = TEXTS[language] || TEXTS.es;
    const [showLangMenu, setShowLangMenu] = useState(false);

    const languages: { code: Language; label: string; flag: string }[] = [
        { code: 'es', label: 'Español', flag: '🇪🇸' },
        { code: 'ing', label: 'English', flag: '🇬🇧' },
        { code: 'eus', label: 'Euskara', flag: '🟢' },
    ];

    const [videoUrl, setVideoUrl] = useState('/video/coach.mp4');

    const features = [
        { icon: Video, title: t.f1Title, desc: t.f1Desc, color: 'orange' },
        { icon: Activity, title: t.f2Title, desc: t.f2Desc, color: 'blue' },
        { icon: MessageSquare, title: t.f3Title, desc: t.f3Desc, color: 'green' },
        { icon: Target, title: t.f4Title, desc: t.f4Desc, color: 'purple' },
        { icon: BarChart3, title: t.f5Title, desc: t.f5Desc, color: 'red' },
        { icon: Clock, title: t.f6Title, desc: t.f6Desc, color: 'teal' },
    ];

    const benefits = [
        { icon: Zap, title: t.b1Title, desc: t.b1Desc },
        { icon: Shield, title: t.b2Title, desc: t.b2Desc },
        { icon: TrendingUp, title: t.b3Title, desc: t.b3Desc },
        { icon: Users, title: t.b4Title, desc: t.b4Desc },
    ];

    const forWho = [t.for1, t.for2, t.for3, t.for4];

    return (
        <div className="min-h-screen w-full bg-white dark:bg-black text-neutral-900 dark:text-white overflow-x-hidden overflow-y-auto transition-colors duration-300">

            {/* HEADER - Fixed with Logo left, CTA right */}
            <header className="fixed top-0 left-0 right-0 z-50 bg-white/60 dark:bg-black/60 backdrop-blur-xl border-b border-neutral-200/50 dark:border-neutral-800/50">
                <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
                    {/* Logo - Left + Language Selector */}
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3 group cursor-pointer">
                            <div className="w-9 h-9 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center rotate-3 shadow-lg shadow-orange-500/30 group-hover:rotate-6 transition-transform duration-300">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                            </div>
                            <span className="font-bold text-lg tracking-tight">Coach <span className="text-orange-600 dark:text-orange-500">AI</span></span>
                        </div>

                        {/* Language Selector */}
                        {onLanguageChange && (
                            <div className="relative">
                                <button
                                    onClick={() => setShowLangMenu(!showLangMenu)}
                                    className="flex items-center gap-2 px-3 py-2 rounded-full bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                                >
                                    <Globe size={16} className="text-neutral-500" />
                                    <span className="text-sm font-medium">{languages.find(l => l.code === language)?.flag}</span>
                                </button>
                                {showLangMenu && (
                                    <div className="absolute top-full left-0 mt-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-lg overflow-hidden z-50">
                                        {languages.map((lang) => (
                                            <button
                                                key={lang.code}
                                                onClick={() => { onLanguageChange(lang.code); setShowLangMenu(false); }}
                                                className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors ${language === lang.code ? 'bg-orange-50 dark:bg-orange-500/10 text-orange-600' : ''}`}
                                            >
                                                <span>{lang.flag}</span>
                                                <span>{lang.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* CTA Button - Right */}
                    <button
                        onClick={onContinue}
                        className="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold rounded-full transition-all duration-300 flex items-center gap-2 shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50 hover:scale-105"
                    >
                        <span>{t.startBtn}</span>
                        <ArrowRight size={16} />
                    </button>
                </div>
            </header>

            {/* HERO SECTION */}
            <section className="relative min-h-screen flex flex-col items-center justify-center px-4 pt-20">
                {/* Background Gradient */}
                <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-20 left-1/4 w-96 h-96 bg-orange-500/20 rounded-full blur-[120px]" />
                    <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-orange-600/15 rounded-full blur-[100px]" />
                </div>

                <div className="relative z-10 flex flex-col items-center text-center max-w-4xl mx-auto">
                    {/* Logo */}
                    <div className="w-20 h-20 bg-orange-600 rounded-3xl flex items-center justify-center mb-8 rotate-3 shadow-[0_0_40px_rgba(234,88,12,0.5)]">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                    </div>

                    <h1 className="text-4xl md:text-6xl font-bold mb-4 tracking-tight leading-tight">
                        Coach <span className="text-orange-600 dark:text-orange-500">AI</span>
                    </h1>

                    <p className="text-2xl md:text-3xl font-semibold mb-4 max-w-3xl">
                        {t.headline}
                    </p>
                    <p className="text-neutral-500 dark:text-neutral-400 max-w-2xl mb-10 text-base md:text-lg">
                        {t.subheadline}
                    </p>

                    {/* Demo Video */}
                    <div className="w-full max-w-3xl mb-8">
                        <p className="text-neutral-500 dark:text-neutral-400 text-sm mb-4 flex items-center justify-center gap-2">
                            <Play size={16} className="text-orange-500" />
                            {t.watchDemo}
                        </p>
                        <div className="relative rounded-2xl overflow-hidden border border-neutral-200 dark:border-neutral-800 shadow-2xl bg-black">
                            <video
                                src={videoUrl}
                                autoPlay
                                loop
                                muted
                                playsInline
                                className="w-full h-auto"
                            />
                        </div>
                    </div>

                    {/* Scroll indicator */}
                    <div className="mt-8 animate-bounce">
                        <ChevronDown size={32} className="text-neutral-400" />
                    </div>
                </div>
            </section>

            {/* Gradient Transition: Hero to Features */}
            <div className="h-24 bg-gradient-to-b from-white dark:from-black to-neutral-50 dark:to-neutral-950" />

            {/* FEATURES SECTION */}
            <section className="py-20 px-4 bg-neutral-50 dark:bg-neutral-950">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-4xl font-bold mb-4">{t.featuresTitle}</h2>
                        <p className="text-neutral-500 dark:text-neutral-400 max-w-2xl mx-auto">{t.featuresSubtitle}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {features.map((feat, i) => (
                            <div
                                key={i}
                                className="group p-6 bg-white dark:bg-neutral-900/80 border border-neutral-200 dark:border-neutral-800 rounded-2xl transition-all duration-300 hover:border-orange-500/50 hover:shadow-xl hover:shadow-orange-500/10 hover:-translate-y-1 hover:bg-gradient-to-br hover:from-white hover:to-orange-50 dark:hover:from-neutral-900 dark:hover:to-neutral-800 cursor-pointer"
                            >
                                <div className="w-12 h-12 bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-500/20 dark:to-orange-600/20 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                                    <feat.icon className="text-orange-600 dark:text-orange-500" size={24} />
                                </div>
                                <h3 className="font-bold text-lg mb-2 group-hover:text-orange-600 dark:group-hover:text-orange-500 transition-colors">{feat.title}</h3>
                                <p className="text-neutral-500 dark:text-neutral-400 text-sm leading-relaxed">{feat.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Gradient Transition: Features to AI */}
            <div className="h-24 bg-gradient-to-b from-neutral-50 dark:from-neutral-950 via-neutral-900/50 to-purple-950" />

            {/* AI POWERED SECTION */}
            <section className="py-24 px-4 bg-gradient-to-br from-purple-950 via-black to-blue-950 relative overflow-hidden">
                {/* Animated background elements */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-10 left-10 w-72 h-72 bg-purple-500/20 rounded-full blur-[100px] animate-pulse" />
                    <div className="absolute bottom-10 right-10 w-96 h-96 bg-blue-500/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
                </div>

                <div className="max-w-6xl mx-auto relative z-10">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                        {/* Text Content */}
                        <div className="text-white">
                            {/* Gemini Badge */}
                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur rounded-full mb-6 border border-white/20">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                    <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="url(#gemini-gradient)" />
                                    <path d="M2 17L12 22L22 17" stroke="url(#gemini-gradient)" strokeWidth="2" />
                                    <path d="M2 12L12 17L22 12" stroke="url(#gemini-gradient)" strokeWidth="2" />
                                    <defs>
                                        <linearGradient id="gemini-gradient" x1="2" y1="2" x2="22" y2="22">
                                            <stop stopColor="#4285F4" />
                                            <stop offset="0.5" stopColor="#9B72CB" />
                                            <stop offset="1" stopColor="#D96570" />
                                        </linearGradient>
                                    </defs>
                                </svg>
                                <span className="text-sm font-semibold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">Google Gemini</span>
                            </div>

                            <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-white via-purple-200 to-blue-200 bg-clip-text text-transparent">
                                {t.aiTitle}
                            </h2>
                            <p className="text-lg text-purple-200 mb-4">{t.aiSubtitle}</p>
                            <p className="text-neutral-300 mb-8 leading-relaxed">{t.aiDesc}</p>

                            {/* Features list */}
                            <ul className="space-y-3">
                                {[t.aiFeature1, t.aiFeature2, t.aiFeature3].map((feature, i) => (
                                    <li key={i} className="flex items-center gap-3">
                                        <div className="w-6 h-6 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                                            <CheckCircle size={14} className="text-white" />
                                        </div>
                                        <span className="text-white/90">{feature}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Image */}
                        <div className="relative group max-w-lg mx-auto lg:mx-0">
                            <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-2xl blur-lg opacity-50 group-hover:opacity-75 transition-opacity duration-500" />
                            <div className="relative rounded-2xl overflow-hidden border border-white/20 shadow-2xl">
                                <img
                                    src="/ai-chat-demo.png"
                                    alt="Coach AI Chat Demo"
                                    className="w-full h-auto"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Gradient Transition: AI to Benefits */}
            <div className="h-24 bg-gradient-to-b from-blue-950 via-neutral-900 to-white dark:to-black" />

            {/* BENEFITS SECTION */}
            <section className="py-20 px-4">
                <div className="max-w-6xl mx-auto">
                    <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">{t.benefitsTitle}</h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {benefits.map((b, i) => (
                            <div key={i} className="group flex gap-4 p-4 rounded-2xl hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-all duration-300 cursor-pointer">
                                <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-orange-500/30 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                                    <b.icon className="text-white" size={28} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-xl mb-2 group-hover:text-orange-600 dark:group-hover:text-orange-500 transition-colors">{b.title}</h3>
                                    <p className="text-neutral-500 dark:text-neutral-400">{b.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* SPORTS SECTION */}
            <section className="py-20 px-4">
                <div className="max-w-4xl mx-auto text-center">
                    <h2 className="text-3xl md:text-4xl font-bold mb-4">{t.sportsTitle}</h2>
                    <p className="text-neutral-500 dark:text-neutral-400 mb-10 max-w-2xl mx-auto">{t.sportsDesc}</p>

                    <div className="flex flex-wrap justify-center gap-3">
                        {['🏃 Atletismo', '🏋️ Gimnasio', '⚽ Fútbol', '🏊 Natación', '🚴 Ciclismo', '🥊 Combate', '🎾 Tenis', '🏀 Baloncesto', '⚾ Béisbol', '🏈 Rugby'].map((sport, i) => (
                            <span key={i} className="px-5 py-2.5 bg-neutral-100 dark:bg-neutral-800 rounded-full text-sm font-medium hover:bg-orange-100 dark:hover:bg-orange-500/20 hover:text-orange-600 dark:hover:text-orange-500 transition-all duration-300 cursor-pointer hover:scale-105 hover:shadow-md">
                                {sport}
                            </span>
                        ))}
                    </div>
                </div>
            </section>

            {/* FINAL CTA SECTION */}
            <section className="py-24 px-4 bg-gradient-to-br from-orange-600 to-orange-700">
                <div className="max-w-3xl mx-auto text-center text-white">
                    <Star className="mx-auto mb-6" size={48} />
                    <h2 className="text-3xl md:text-4xl font-bold mb-4">{t.ctaTitle}</h2>
                    <p className="text-orange-100 mb-10 text-lg">{t.ctaDesc}</p>
                    <button
                        onClick={onContinue}
                        className="px-10 py-4 bg-white text-orange-600 font-bold rounded-full transition-all hover:scale-105 shadow-xl flex items-center gap-3 mx-auto text-lg"
                    >
                        <span>{t.ctaBtn}</span>
                        <ArrowRight size={22} />
                    </button>
                </div>
            </section>

            {/* FOOTER */}
            <footer className="py-8 px-4 border-t border-neutral-200 dark:border-neutral-800 text-center text-neutral-500 text-sm">
                <p>© 2026 Coach AI. Todos los derechos reservados.</p>
            </footer>
        </div>
    );
};
