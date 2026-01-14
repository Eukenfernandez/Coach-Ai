
import React, { useState } from 'react';
import { User, UserProfile, Language } from '../types';
import { StorageService } from '../services/storageService';
import { ArrowRight, User as UserIcon, Activity, Trophy, ChevronRight, Check, Dumbbell, Target, Waves, Swords, Bike, Users, Search, Pill, CheckCircle2, Circle, XCircle, X, FileText, ShieldCheck } from 'lucide-react';
import { getTranslatedDiscipline } from '../utils/sportTranslations';

interface OnboardingProps {
  user: User;
  onComplete: (updatedUser: User) => void;
  language: Language;
}

const ONBOARDING_TEXTS = {
  es: {
    step1Title: "Configura tu Perfil",
    step1Desc: "Completa tus datos físicos y acepta las políticas.",
    name: "Nombre",
    lastName: "Apellidos",
    age: "Edad",
    gender: "Género",
    male: "Hombre",
    female: "Mujer",
    height: "Altura (cm)",
    weight: "Peso (kg)",
    terms: "He leído y acepto los",
    termsLink: "Términos y Condiciones",
    and: "y la Política de Privacidad de Coach AI.",
    next: "Siguiente",
    step2Title: "¿Cuál es tu rol?",
    step2Desc: "Para adaptar la experiencia a ti.",
    athlete: "Atleta",
    athleteDesc: "Quiero registrar mis marcas y analizar mis vídeos.",
    coach: "Entrenador",
    coachDesc: "Quiero gestionar y analizar atletas.",
    step3Title: "Elige tu Deporte",
    step3TitleCoach: "Especialidad",
    step3Desc: "Encuentra tu disciplina específica.",
    step3DescCoach: "Selecciona qué grupo de pruebas entrenas.",
    backToCat: "Volver a categorías",
    selectCat: "1. Selecciona Categoría Principal",
    speciality: "Especialidad de Entrenamiento",
    search: "Buscar disciplina...",
    noResults: "No se encontraron resultados.",
    step4Title: "Suplementación",
    step4Desc: "¿Tomas algún tipo de suplementación deportiva?",
    yesSupp: "Sí, tomo suplementos",
    noSupp: "No, solo comida",
    start: "Comenzar",

    // Terms Modal
    termsTitle: "Términos y Condiciones de Uso",
    termsContent: `Bienvenido a Coach AI.

1. ACEPTACIÓN DE TÉRMINOS
Al acceder y utilizar nuestra aplicación, aceptas cumplir con estos términos. Si no estás de acuerdo, no utilices el servicio.

2. USO DEL SERVICIO
Coach AI proporciona herramientas de análisis deportivo. El usuario es responsable de la exactitud de los datos proporcionados y del uso seguro de las recomendaciones. El análisis de IA es una herramienta de apoyo y no sustituye el juicio profesional médico o deportivo.

3. PRIVACIDAD
Tus datos (videos, métricas) se almacenan de forma segura. No compartimos tu información personal con terceros sin consentimiento explícito, salvo para el procesamiento necesario del servicio (ej. Stripe, Google Cloud).

4. SUSCRIPCIONES
Los planes Premium se facturan mensualmente. Puedes cancelar en cualquier momento. No ofrecemos reembolsos por períodos parciales.

5. RESPONSABILIDAD
Coach AI no se hace responsable de lesiones ocurridas durante la práctica deportiva basada en nuestros análisis. Consulta siempre a un profesional antes de comenzar un nuevo régimen de entrenamiento.`,
    acceptContinue: "Aceptar y Continuar",

    // Sports Labels
    gym: "Gimnasio / Fitness",
    athletics: "Atletismo",
    soccer: "Fútbol",
    basketball: "Baloncesto",
    tennis_padel: "Tenis / Pádel",
    combat: "Deportes de Combate",
    baseball: "Béisbol / Softbol",
    rugby_football: "Rugby / Fútbol Americano",
    water: "Deportes Acuáticos",
    cycling: "Ciclismo",
    other: "Otros"
  },
  ing: {
    step1Title: "Setup Your Profile",
    step1Desc: "Fill in your physical details and accept policies.",
    name: "First Name",
    lastName: "Last Name",
    age: "Age",
    gender: "Gender",
    male: "Male",
    female: "Female",
    height: "Height (cm)",
    weight: "Weight (kg)",
    terms: "I have read and accept the",
    termsLink: "Terms and Conditions",
    and: "and the Coach AI Privacy Policy.",
    next: "Next",
    step2Title: "What is your role?",
    step2Desc: "To tailor the experience for you.",
    athlete: "Athlete",
    athleteDesc: "I want to track my records and analyze videos.",
    coach: "Coach",
    coachDesc: "I want to manage and analyze athletes.",
    step3Title: "Choose Your Sport",
    step3TitleCoach: "Specialty",
    step3Desc: "Find your specific discipline.",
    step3DescCoach: "Select which group of events you coach.",
    backToCat: "Back to categories",
    selectCat: "1. Select Main Category",
    speciality: "Coaching Specialty",
    search: "Search discipline...",
    noResults: "No results found.",
    step4Title: "Supplementation",
    step4Desc: "Do you take any sports supplements?",
    yesSupp: "Yes, I take supplements",
    noSupp: "No, just food",
    start: "Start",

    // Terms Modal
    termsTitle: "Terms and Conditions of Use",
    termsContent: `Welcome to Coach AI.

1. ACCEPTANCE OF TERMS
By accessing and using our application, you agree to comply with these terms. If you do not agree, do not use the service.

2. SERVICE USAGE
Coach AI provides sports analysis tools. The user is responsible for the accuracy of the data provided and the safe use of recommendations. AI analysis is a support tool and does not replace professional medical or sports judgment.

3. PRIVACY
Your data (videos, metrics) is stored securely. We do not share your personal information with third parties without explicit consent, except for necessary service processing (e.g., Stripe, Google Cloud).

4. SUBSCRIPTIONS
Premium plans are billed monthly. You can cancel at any time. We do not offer refunds for partial periods.

5. LIABILITY
Coach AI is not responsible for injuries occurring during sports practice based on our analysis. Always consult a professional before starting a new training regimen.`,
    acceptContinue: "Accept and Continue",

    // Sports Labels
    gym: "Gym / Fitness",
    athletics: "Athletics",
    soccer: "Soccer",
    basketball: "Basketball",
    tennis_padel: "Tennis / Padel",
    combat: "Combat Sports",
    baseball: "Baseball / Softball",
    rugby_football: "Rugby / American Football",
    water: "Water Sports",
    cycling: "Cycling",
    other: "Others"
  },
  eus: {
    step1Title: "Konfiguratu Zure Profila",
    step1Desc: "Bete zure datu fisikoak eta onartu politikak.",
    name: "Izena",
    lastName: "Abizenak",
    age: "Adina",
    gender: "Generoa",
    male: "Gizona",
    female: "Emakumea",
    height: "Altuera (cm)",
    weight: "Pisua (kg)",
    terms: "Irakurri eta onartzen ditut",
    termsLink: "Baldintzak eta Xedapenak",
    and: "eta Coach AI Pribatutasun Politika.",
    next: "Hurrengoa",
    step2Title: "Zein da zure rola?",
    step2Desc: "Esperientzia zuri egokitzeko.",
    athlete: "Atleta",
    athleteDesc: "Nire markak erregistratu eta bideoak aztertu nahi ditut.",
    coach: "Entrenatzailea",
    coachDesc: "Atletak kudeatu eta aztertu nahi ditut.",
    step3Title: "Aukeratu Zure Kirola",
    step3TitleCoach: "Espezialitatea",
    step3Desc: "Aurkitu zure diziplina zehatza.",
    step3DescCoach: "Hautatu zein proba talde entrenatzen duzun.",
    backToCat: "Itzuli kategorietara",
    selectCat: "1. Hautatu Kategoria Nagusia",
    speciality: "Entrenamendu Espezialitatea",
    search: "Bilatu diziplina...",
    noResults: "Ez da emaitzarik aurkitu.",
    step4Title: "Osagarriak",
    step4Desc: "Kirol osagarririk hartzen al duzu?",
    yesSupp: "Bai, osagarriak hartzen ditut",
    noSupp: "Ez, janaria bakarrik",
    start: "Hasi",

    // Terms Modal
    termsTitle: "Erabilera Baldintzak eta Xedapenak",
    termsContent: `Ongi etorri Coach AI-ra.

1. BALDINTZAK ONARTZEA
Gure aplikazioa erabiltzean, baldintza hauek onartzen dituzu. Ados ez bazaude, ez erabili zerbitzua.

2. ZERBITZUAREN ERABILERA
Coach AI-k kirol analisia egiteko tresnak eskaintzen ditu. Erabiltzailea da emandako datuen zehaztasunaren eta gomendioen erabilera seguruaren erantzule. AI analisia laguntza tresna bat da eta ez du mediku edo kirol profesionalen iritzia ordezkatzen.

3. PRIBATUTASUNA
Zure datuak (bideoak, metrikak) modu seguruan gordetzen dira. Ez dugu zure informazio pertsonala hirugarrenekin partekatzen baimenik gabe, zerbitzua prozesatzeko beharrezkoa denean izan ezik (adibidez, Stripe, Google Cloud).

4. HARPIDETZAK
Premium planak hilero fakturatzen dira. Edozein unetan ezeztatu dezakezu. Ez dugu dirua itzultzen epe partzialengatik.

5. ERANTZUKIZUNA
Coach AI ez da gure analisietan oinarritutako kirol praktikan gertatutako lesioen erantzule. Kontsultatu beti profesional bati entrenamendu erregimen berri bat hasi aurretik.`,
    acceptContinue: "Onartu eta Jarraitu",

    // Sports Labels
    gym: "Gimnasioa / Fitness",
    athletics: "Atletismoa",
    soccer: "Futbola",
    basketball: "Saskibaloia",
    tennis_padel: "Tenisa / Padela",
    combat: "Borroka Kirolak",
    baseball: "Beisbola / Softbola",
    rugby_football: "Errugbia / Futbol Amerikarra",
    water: "Ur Kirolak",
    cycling: "Txirrindularitza",
    other: "Beste batzuk"
  }
};

// === COMPREHENSIVE SPORTS DATA (Structure Only) ===
const ALL_SPORTS_STRUCTURE = {
  gym: { icon: Dumbbell, disciplines: ['Powerlifting', 'Bodybuilding', 'CrossFit', 'Calistenia', 'Strongman', 'Halterofilia', 'Fitness General', 'Entrenamiento Funcional', 'HIIT', 'Street Lifting', 'Kettlebell', 'Yoga/Pilates', 'Cardio', 'Natural BB', 'Hyrox'] },
  athletics: { icon: Activity, disciplines: ['60m', '100m', '200m', '400m', '800m', '1500m', '3000m', '5000m', '10000m', 'Media Maratón', 'Maratón', 'Ultramaratón', 'Cross Country', 'Trail Running', 'Running', '60m Vallas', '100m Vallas', '110m Vallas', '400m Vallas', '3000m Obst.', 'Salto Longitud', 'Triple Salto', 'Salto Altura', 'Pértiga', 'Lanz. Peso', 'Lanz. Disco', 'Lanz. Jabalina', 'Lanz. Martillo', 'Decatlón', 'Heptatlón', 'Marcha', 'Relevos'] },
  soccer: { icon: Trophy, disciplines: ['Portero', 'Defensa', 'Lateral', 'Carrilero', 'Pivote', 'Interior', 'Mediapunta', 'Extremo', 'Delantero', 'Fútbol Sala (Portero)', 'Fútbol Sala (Jugador)', 'Fútbol 7'] },
  basketball: { icon: Trophy, disciplines: ['Base', 'Escolta', 'Alero', 'Ala-Pívot', 'Pívot', '3x3'] },
  tennis_padel: { icon: Target, disciplines: ['Tenis', 'Pádel', 'Badminton', 'Squash', 'Tenis Mesa', 'Pickleball', 'Frontón'] },
  combat: { icon: Swords, disciplines: ['Boxeo', 'MMA', 'Muay Thai', 'Kickboxing', 'Judo', 'BJJ', 'Karate', 'Taekwondo', 'Lucha', 'Kung Fu', 'Esgrima'] },
  baseball: { icon: Users, disciplines: ['Pitcher', 'Catcher', 'Base', 'Shortstop', 'Outfielder', 'Bateador', 'Softbol'] },
  rugby_football: { icon: Users, disciplines: ['Rugby Forward', 'Rugby Back', 'Rugby 7s', 'QB', 'Running Back', 'Receiver', 'Lineman', 'Linebacker', 'Defensive Back', 'Kicker'] },
  water: { icon: Waves, disciplines: ['Natación', 'Aguas Abiertas', 'Waterpolo', 'Sincronizada', 'Saltos', 'Surf', 'Remo', 'Piragüismo', 'Kitesurf', 'Windsurf', 'Paddle Surf', 'Vela', 'Buceo'] },
  cycling: { icon: Bike, disciplines: ['Ruta', 'MTB XC', 'MTB Downhill', 'Pista', 'BMX', 'Triatlón', 'Duatlón', 'Gravel'] },
  other: { icon: Target, disciplines: ['Golf', 'Escalada', 'Gimnasia', 'Voleibol', 'Balonmano', 'Hockey', 'Tiro con Arco', 'Skate', 'Esquí', 'Snowboard', 'Hípica'] }
};

export const Onboarding: React.FC<OnboardingProps> = ({ user, onComplete, language }) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<Partial<UserProfile>>({
    role: 'athlete',
    takesSupplements: false,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  const t = ONBOARDING_TEXTS[language] || ONBOARDING_TEXTS.es;

  const handleNext = () => {
    if (step < 4) {
      setStep(step + 1);
    } else {
      handleFinish();
    }
  };

  const handleFinish = async () => {
    if (formData.firstName && formData.lastName && formData.age && formData.sport && formData.discipline) {
      const profile = formData as UserProfile;
      try {
        const updatedUser = await StorageService.updateUserProfile(user.id, profile);
        await StorageService.initializeExercisesForSport(user.id, formData.sport);
        onComplete(updatedUser);
      } catch (e) {
        console.error("Failed to save profile", e);
      }
    }
  };

  const selectSportCategory = (categoryKey: string) => {
    // Label is now purely for internal logic or fallback, displayed label comes from t[key]
    const autoDiscipline = formData.role === 'coach' ? (t[categoryKey as keyof typeof t] || categoryKey) : undefined;

    setFormData({
      ...formData,
      sport: categoryKey,
      discipline: autoDiscipline
    });
  };

  const isStep1Valid = !!formData.firstName && !!formData.lastName && !!formData.age && !!formData.gender && !!formData.height && !!formData.weight && acceptedTerms;
  const isStep2Valid = !!formData.role;
  const isStep3Valid = !!formData.sport && (formData.role === 'coach' || !!formData.discipline);

  const selectedSportData = formData.sport ? ALL_SPORTS_STRUCTURE[formData.sport as keyof typeof ALL_SPORTS_STRUCTURE] : null;
  const filteredDisciplines = selectedSportData
    ? selectedSportData.disciplines.filter(d => d.toLowerCase().includes(searchTerm.toLowerCase()))
    : [];

  return (
    <div className="min-h-screen w-full bg-gray-50 dark:bg-neutral-950 flex items-center justify-center p-4 transition-colors duration-300">
      <div className="max-w-md w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh] transition-colors">

        {/* Progress Bar */}
        <div className="absolute top-0 left-0 w-full h-1 bg-neutral-200 dark:bg-neutral-800">
          <div
            className="h-full bg-orange-600 transition-all duration-500 ease-out"
            style={{ width: `${(step / 4) * 100}%` }}
          ></div>
        </div>

        <div className="mb-6 mt-2 flex-shrink-0">
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2 transition-colors">
            {step === 1 && t.step1Title}
            {step === 2 && t.step2Title}
            {step === 3 && (formData.role === 'coach' ? t.step3TitleCoach : t.step3Title)}
            {step === 4 && t.step4Title}
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 text-sm transition-colors">
            {step === 1 && t.step1Desc}
            {step === 2 && t.step2Desc}
            {step === 3 && (formData.role === 'coach' ? t.step3DescCoach : t.step3Desc)}
            {step === 4 && t.step4Desc}
          </p>
        </div>

        {/* STEP 1: Personal Info & Terms */}
        {step === 1 && (
          <div className="space-y-4 animate-in slide-in-from-right fade-in duration-300 overflow-y-auto no-scrollbar pb-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-neutral-500 dark:text-neutral-400 ml-1 mb-1 block">{t.name}</label>
                <input
                  type="text"
                  value={formData.firstName || ''}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full bg-neutral-100 dark:bg-black/50 border border-neutral-300 dark:border-neutral-700 rounded-xl p-3 text-neutral-900 dark:text-white focus:border-orange-500 focus:outline-none text-sm transition-colors"
                  placeholder="Ej. Carlos"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 dark:text-neutral-400 ml-1 mb-1 block">{t.lastName}</label>
                <input
                  type="text"
                  value={formData.lastName || ''}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full bg-neutral-100 dark:bg-black/50 border border-neutral-300 dark:border-neutral-700 rounded-xl p-3 text-neutral-900 dark:text-white focus:border-orange-500 focus:outline-none text-sm transition-colors"
                  placeholder="Ej. Pérez"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-neutral-500 dark:text-neutral-400 ml-1 mb-1 block">{t.age}</label>
              <input
                type="number"
                value={formData.age || ''}
                onChange={(e) => setFormData({ ...formData, age: parseInt(e.target.value) })}
                className="w-full bg-neutral-100 dark:bg-black/50 border border-neutral-300 dark:border-neutral-700 rounded-xl p-3 text-neutral-900 dark:text-white focus:border-orange-500 focus:outline-none text-sm transition-colors"
                placeholder="24"
              />
            </div>

            <div>
              <label className="text-xs text-neutral-500 dark:text-neutral-400 ml-1 mb-2 block">{t.gender}</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setFormData({ ...formData, gender: 'male' })}
                  className={`p-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${formData.gender === 'male'
                      ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-500 text-blue-700 dark:text-white'
                      : 'bg-neutral-100 dark:bg-black/50 border-neutral-300 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800'
                    }`}
                >
                  <span className="font-bold text-sm">{t.male}</span>
                </button>
                <button
                  onClick={() => setFormData({ ...formData, gender: 'female' })}
                  className={`p-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${formData.gender === 'female'
                      ? 'bg-pink-100 dark:bg-pink-900/30 border-pink-500 text-pink-700 dark:text-white'
                      : 'bg-neutral-100 dark:bg-black/50 border-neutral-300 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800'
                    }`}
                >
                  <span className="font-bold text-sm">{t.female}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-neutral-500 dark:text-neutral-400 ml-1 mb-1 block">{t.height}</label>
                <input
                  type="number"
                  value={formData.height || ''}
                  onChange={(e) => setFormData({ ...formData, height: parseInt(e.target.value) })}
                  className="w-full bg-neutral-100 dark:bg-black/50 border border-neutral-300 dark:border-neutral-700 rounded-xl p-3 text-neutral-900 dark:text-white focus:border-orange-500 focus:outline-none text-sm transition-colors"
                  placeholder="180"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 dark:text-neutral-400 ml-1 mb-1 block">{t.weight}</label>
                <input
                  type="number"
                  value={formData.weight || ''}
                  onChange={(e) => setFormData({ ...formData, weight: parseFloat(e.target.value) })}
                  className="w-full bg-neutral-100 dark:bg-black/50 border border-neutral-300 dark:border-neutral-700 rounded-xl p-3 text-neutral-900 dark:text-white focus:border-orange-500 focus:outline-none text-sm transition-colors"
                  placeholder="75.5"
                />
              </div>
            </div>

            <div className="pt-2">
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className={`mt-0.5 w-5 h-5 min-w-[1.25rem] aspect-square flex-shrink-0 rounded-md border flex items-center justify-center transition-all ${acceptedTerms ? 'bg-orange-600 border-orange-600' : 'bg-transparent border-neutral-300 dark:border-neutral-600 group-hover:border-neutral-400'}`}>
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                  />
                  {acceptedTerms && <Check size={14} className="text-white" />}
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                  {t.terms} <button onClick={(e) => { e.preventDefault(); setShowTermsModal(true); }} className="text-orange-600 dark:text-orange-500 hover:text-orange-500 dark:hover:text-orange-400 underline decoration-orange-500/50 underline-offset-2">{t.termsLink}</button> {t.and}
                </div>
              </label>
            </div>

            <button
              onClick={handleNext}
              disabled={!isStep1Valid}
              className="w-full py-3 bg-orange-600 rounded-xl text-white font-bold mt-2 disabled:opacity-50 hover:bg-orange-500 transition-colors"
            >
              {t.next}
            </button>
          </div>
        )}

        {/* STEP 2: Role */}
        {step === 2 && (
          <div className="space-y-4 animate-in slide-in-from-right fade-in duration-300">
            <button
              onClick={() => setFormData({ ...formData, role: 'athlete' })}
              className={`w-full p-4 rounded-xl border flex items-center gap-4 transition-all ${formData.role === 'athlete'
                  ? 'bg-orange-600/10 border-orange-500 text-orange-600 dark:text-white ring-1 ring-orange-500'
                  : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-700'
                }`}
            >
              <div className="p-2 bg-neutral-100 dark:bg-neutral-900 rounded-lg text-neutral-900 dark:text-white"><UserIcon size={24} /></div>
              <div className="text-left">
                <span className="block font-bold">{t.athlete}</span>
                <span className="text-xs opacity-70">{t.athleteDesc}</span>
              </div>
            </button>

            <button
              onClick={() => setFormData({ ...formData, role: 'coach' })}
              className={`w-full p-4 rounded-xl border flex items-center gap-4 transition-all ${formData.role === 'coach'
                  ? 'bg-orange-600/10 border-orange-500 text-orange-600 dark:text-white ring-1 ring-orange-500'
                  : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-700'
                }`}
            >
              <div className="p-2 bg-neutral-100 dark:bg-neutral-900 rounded-lg text-neutral-900 dark:text-white"><Activity size={24} /></div>
              <div className="text-left">
                <span className="block font-bold">{t.coach}</span>
                <span className="text-xs opacity-70">{t.coachDesc}</span>
              </div>
            </button>

            <button
              onClick={handleNext}
              disabled={!isStep2Valid}
              className="w-full py-3 bg-neutral-900 dark:bg-white text-white dark:text-black rounded-xl font-bold mt-4 hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors"
            >
              {t.next}
            </button>
          </div>
        )}

        {/* STEP 3: Sport & Discipline */}
        {step === 3 && (
          <div className="flex flex-col h-full animate-in slide-in-from-right fade-in duration-300 overflow-hidden">

            <div className="flex-1 overflow-y-auto pr-1 space-y-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-neutral-300 dark:[&::-webkit-scrollbar-thumb]:bg-neutral-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-orange-500">

              {formData.sport && formData.role === 'athlete' && (
                <button
                  onClick={() => { setFormData({ ...formData, sport: '', discipline: '' }); setSearchTerm(''); }}
                  className="flex items-center text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white mb-2"
                >
                  <ChevronRight className="rotate-180 mr-1" size={14} /> {t.backToCat}
                </button>
              )}

              {(!formData.sport || formData.role === 'coach') && (
                <div>
                  <label className="text-xs text-neutral-500 dark:text-neutral-400 mb-2 block ml-1">
                    {formData.role === 'coach' ? t.speciality : t.selectCat}
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(ALL_SPORTS_STRUCTURE).map(([key, data]) => {
                      const isSelected = formData.sport === key;
                      const Icon = data.icon;
                      // Translate the label dynamically based on key
                      const label = t[key as keyof typeof t] || key;
                      return (
                        <button
                          key={key}
                          onClick={() => selectSportCategory(key)}
                          className={`p-4 rounded-xl border text-left transition-all relative flex flex-col items-start gap-2 ${isSelected
                              ? 'bg-orange-600 border-orange-500 text-white shadow-lg'
                              : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-700'
                            }`}
                        >
                          <Icon size={24} className={isSelected ? "text-white" : "text-neutral-500 dark:text-neutral-400"} />
                          <span className="font-bold block text-sm leading-tight">{label}</span>
                          {isSelected && <div className="absolute top-2 right-2"><Check size={14} /></div>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {formData.sport && formData.role === 'athlete' && selectedSportData && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 h-full flex flex-col">
                  <div className="flex items-center gap-2 mb-3">
                    <selectedSportData.icon className="text-orange-600 dark:text-orange-500" size={18} />
                    <span className="font-bold text-neutral-900 dark:text-white text-lg">{t[formData.sport as keyof typeof t] || formData.sport}</span>
                  </div>

                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
                    <input
                      type="text"
                      placeholder={t.search}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg py-2 pl-9 pr-4 text-sm text-neutral-900 dark:text-white focus:border-orange-500 focus:outline-none placeholder-neutral-500"
                    />
                  </div>

                  <div className="flex-1 overflow-y-auto bg-neutral-50 dark:bg-neutral-800/50 rounded-xl border border-neutral-200 dark:border-neutral-800 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-neutral-300 dark:[&::-webkit-scrollbar-thumb]:bg-neutral-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-orange-500">
                    {filteredDisciplines.length > 0 ? filteredDisciplines.map((disc) => (
                      <button
                        key={disc}
                        onClick={() => setFormData({ ...formData, discipline: disc })}
                        className={`w-full p-3 text-left text-sm border-b border-neutral-200 dark:border-neutral-800 last:border-0 flex justify-between items-center transition-colors ${formData.discipline === disc
                            ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400 font-medium'
                            : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                          }`}
                      >
                        {getTranslatedDiscipline(disc, language)}
                        {formData.discipline === disc && <Check size={16} />}
                      </button>
                    )) : (
                      <p className="p-4 text-center text-neutral-500 text-sm">{t.noResults}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleNext}
              disabled={!isStep3Valid}
              className="w-full py-3 bg-neutral-900 dark:bg-white text-white dark:text-black rounded-xl font-bold mt-4 flex-shrink-0 flex items-center justify-center gap-2 hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>{t.next}</span>
            </button>
          </div>
        )}

        {/* STEP 4: Supplementation */}
        {step === 4 && (
          <div className="flex flex-col h-full animate-in slide-in-from-right fade-in duration-300">
            <div className="flex-1 flex flex-col justify-center gap-4">
              <button
                onClick={() => setFormData({ ...formData, takesSupplements: true })}
                className={`relative p-6 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-3 h-40 ${formData.takesSupplements
                    ? 'bg-orange-600/10 border-orange-500 shadow-lg shadow-orange-500/20'
                    : 'bg-white dark:bg-neutral-800/50 border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                  }`}
              >
                <div className={`p-3 rounded-full ${formData.takesSupplements ? 'bg-orange-500 text-white' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400'}`}>
                  <Pill size={32} />
                </div>
                <span className={`text-lg font-bold ${formData.takesSupplements ? 'text-orange-600 dark:text-white' : 'text-neutral-500 dark:text-neutral-400'}`}>
                  {t.yesSupp}
                </span>
                {formData.takesSupplements && (
                  <div className="absolute top-3 right-3 text-orange-500"><CheckCircle2 size={20} /></div>
                )}
              </button>

              <button
                onClick={() => setFormData({ ...formData, takesSupplements: false })}
                className={`relative p-6 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-3 h-40 ${formData.takesSupplements === false
                    ? 'bg-neutral-100 dark:bg-neutral-700/50 border-neutral-300 dark:border-neutral-500 shadow-lg'
                    : 'bg-white dark:bg-neutral-800/50 border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                  }`}
              >
                <div className={`p-3 rounded-full ${formData.takesSupplements === false ? 'bg-neutral-500 text-white' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400'}`}>
                  <XCircle size={32} />
                </div>
                <span className={`text-lg font-bold ${formData.takesSupplements === false ? 'text-neutral-700 dark:text-white' : 'text-neutral-500 dark:text-neutral-400'}`}>
                  {t.noSupp}
                </span>
                {formData.takesSupplements === false && (
                  <div className="absolute top-3 right-3 text-neutral-400"><CheckCircle2 size={20} /></div>
                )}
              </button>
            </div>

            <button
              onClick={handleFinish}
              className="w-full py-3 bg-orange-600 rounded-xl text-white font-bold mt-4 flex-shrink-0 flex items-center justify-center gap-2 hover:bg-orange-500 transition-colors"
            >
              <span>{t.start}</span>
              <ArrowRight size={18} />
            </button>
          </div>
        )}

      </div>

      {/* TERMS AND CONDITIONS MODAL */}
      {showTermsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex justify-between items-center bg-neutral-50 dark:bg-neutral-950 rounded-t-2xl">
              <h3 className="font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="text-orange-600" size={20} />
                {t.termsTitle}
              </h3>
              <button onClick={() => setShowTermsModal(false)} className="text-neutral-500 hover:text-neutral-900 dark:hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed whitespace-pre-line">
              {t.termsContent}
            </div>

            <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 rounded-b-2xl flex justify-end">
              <button
                onClick={() => { setAcceptedTerms(true); setShowTermsModal(false); }}
                className="px-6 py-2 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl transition-colors"
              >
                {t.acceptContinue}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
