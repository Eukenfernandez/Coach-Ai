import React, { useState } from 'react';
import { User, UserProfile, Language } from '../types';
import { StorageService } from '../svcs/storageService';
import { User as UserIcon, Save, Trash2, Activity, AlertTriangle, ChevronRight, Check, Search, Dumbbell, Target, Waves, Swords, Bike, Users, Trophy, Settings } from 'lucide-react';
import { getTranslatedSportCategory, getTranslatedDiscipline } from '../utl/sportTranslations';

interface ProfileProps {
   currentUser: User;
   onUpdateUser: (user: User) => void;
   onLogout: () => void;
   language: Language;
   onRefreshData?: () => void; // New prop to refresh data after reset
}

const TEXTS = {
   es: {
      title: 'Mi Perfil',
      subtitle: 'Gestiona tu información personal y ajustes de cuenta.',
      personalInfo: 'Información Personal',
      sportSettings: 'Configuración Deportiva',
      name: 'Nombre',
      lastName: 'Apellidos',
      age: 'Edad',
      height: 'Altura (cm)',
      weight: 'Peso (kg)',
      sport: 'Deporte Principal',
      save: 'Guardar Cambios',
      success: 'Perfil actualizado correctamente.',
      deleteAccount: 'Eliminar Cuenta',
      deleteDesc: 'Esta acción es irreversible. Todos tus datos se perderán.',
      id: 'ID de Usuario',
      // Change Sport Modals
      changeTitle: '¿Cambiar Deporte?',
      changeDesc: 'Estás a punto de cambiar tu deporte principal de "{old}" a "{new}". Esto afectará a tus parámetros de análisis.',
      dataTitle: 'Gestión de Datos',
      dataDesc: 'Has cambiado de deporte. ¿Quieres mantener tus registros de fuerza y ejercicios actuales o reiniciar a los predeterminados del nuevo deporte?',
      keepBtn: 'Sí, mantener datos actuales',
      resetBtn: 'No, cambiar a predeterminados (Borrar RM)',
      confirmChange: 'Confirmar Cambio',
      cancel: 'Cancelar',
      selectDiscipline: 'Selecciona tu Modalidad',
      selectDisciplineDesc: 'Elige la disciplina específica que practicas dentro de {sport}.',
      searchDiscipline: 'Buscar modalidad...',
      noResults: 'No se encontraron resultados.',
      continue: 'Continuar',
      // Category selection
      selectCategory: 'Elige tu Deporte',
      selectCategoryDesc: 'Selecciona la categoría principal de tu deporte.',
      showSupplements: 'Mostrar Suplementación',
      showSupplementsDesc: 'Activa esta opción para ver el apartado de seguimiento de suplementos en el menú.',
      settings: 'Ajustes y Preferencias',
   },
   ing: {
      title: 'My Profile',
      subtitle: 'Manage your personal information and account settings.',
      personalInfo: 'Personal Information',
      sportSettings: 'Sport Settings',
      name: 'First Name',
      lastName: 'Last Name',
      age: 'Age',
      height: 'Height (cm)',
      weight: 'Weight (kg)',
      sport: 'Main Sport',
      save: 'Save Changes',
      success: 'Profile updated successfully.',
      deleteAccount: 'Delete Account',
      deleteDesc: 'This action is irreversible. All your data will be lost.',
      id: 'User ID',
      changeTitle: 'Change Sport?',
      changeDesc: 'You are about to change your main sport from "{old}" to "{new}". This will affect your analysis parameters.',
      dataTitle: 'Data Management',
      dataDesc: 'You changed your sport. Do you want to keep your current strength records and exercises or reset to the new sport defaults?',
      keepBtn: 'Yes, keep current data',
      resetBtn: 'No, switch to defaults (Clear RM)',
      confirmChange: 'Confirm Change',
      cancel: 'Cancel',
      selectDiscipline: 'Select Your Discipline',
      selectDisciplineDesc: 'Choose the specific discipline you practice within {sport}.',
      searchDiscipline: 'Search discipline...',
      noResults: 'No results found.',
      continue: 'Continue',
      selectCategory: 'Choose Your Sport',
      selectCategoryDesc: 'Select the main category of your sport.',
      showSupplements: 'Show Supplements',
      showSupplementsDesc: 'Enable this option to see the supplement tracking section in the menu.',
      settings: 'Settings & Preferences',
   },
   eus: {
      title: 'Nire Profila',
      subtitle: 'Kudeatu zure informazio pertsonala eta kontuaren ezarpenak.',
      personalInfo: 'Informazio Pertsonala',
      sportSettings: 'Kirol Ezarpenak',
      name: 'Izena',
      lastName: 'Abizenak',
      age: 'Adina',
      height: 'Altuera (cm)',
      weight: 'Pisua (kg)',
      sport: 'Kirol Nagusia',
      save: 'Gorde Aldaketak',
      success: 'Profila ondo eguneratu da.',
      deleteAccount: 'Kontua Ezabatu',
      deleteDesc: 'Ekintza hau itzulezina da. Datu guztiak galduko dira.',
      id: 'Erabiltzaile ID',
      changeTitle: 'Kirola Aldatu?',
      changeDesc: 'Zure kirol nagusia "{old}"-etik "{new}"-ra aldatzera zoaz. Honek analisi parametroetan eragina izango du.',
      dataTitle: 'Datuen Kudeaketa',
      dataDesc: 'Kirola aldatu duzu. Zure uneko indar erregistroak eta ariketak mantendu nahi dituzu edo kirol berriaren lehenetsietara berrezarri?',
      keepBtn: 'Bai, mantendu datuak',
      resetBtn: 'Ez, lehenetsietara aldatu (RM Ezabatu)',
      confirmChange: 'Aldaketa Berretsi',
      cancel: 'Utzi',
      selectDiscipline: 'Hautatu Zure Modalitatea',
      selectDisciplineDesc: 'Aukeratu {sport} barruan praktikatzen duzun diziplina zehatza.',
      searchDiscipline: 'Bilatu modalitatea...',
      noResults: 'Ez da emaitzarik aurkitu.',
      continue: 'Jarraitu',
      selectCategory: 'Aukeratu Zure Kirola',
      selectCategoryDesc: 'Hautatu zure kirolaren kategoria nagusia.',
      showSupplements: 'Erakutsi Osagarriak',
      showSupplementsDesc: 'Aktibatu aukera hau menu nagusian osagarrien atala ikusteko.',
      settings: 'Ezarpenak eta Hobespenak',
   },
};

const SPORTS_LIST: Record<string, string> = {
   gym: 'Gimnasio / Fitness',
   athletics: 'Atletismo',
   soccer: 'Fútbol',
   basketball: 'Baloncesto',
   tennis_padel: 'Tenis / Pádel',
   combat: 'Deportes de Combate',
   baseball: 'Béisbol / Softbol',
   rugby_football: 'Rugby / Fútbol Americano',
   water: 'Deportes Acuáticos',
   cycling: 'Ciclismo',
   other: 'Otros'
};

const SPORTS_DISCIPLINES: Record<string, string[]> = {
   gym: ['Powerlifting', 'Bodybuilding', 'CrossFit', 'Calistenia', 'Strongman', 'Halterofilia', 'Fitness General', 'HIIT', 'Street Lifting', 'Kettlebell', 'Yoga/Pilates', 'Cardio', 'Hyrox'],
   athletics: ['60m', '100m', '200m', '400m', '800m', '1500m', '3000m', '5000m', '10000m', 'Media Maratón', 'Maratón', 'Ultramaratón', 'Cross Country', 'Trail Running', 'Running', '60m Vallas', '100m Vallas', '110m Vallas', '400m Vallas', '3000m Obst.', 'Salto Longitud', 'Triple Salto', 'Salto Altura', 'Pértiga', 'Lanz. Peso', 'Lanz. Disco', 'Lanz. Jabalina', 'Lanz. Martillo', 'Decatlón', 'Heptatlón', 'Marcha', 'Relevos'],
   soccer: ['Portero', 'Defensa', 'Lateral', 'Carrilero', 'Pivote', 'Interior', 'Mediapunta', 'Extremo', 'Delantero', 'Fútbol Sala', 'Fútbol 7'],
   basketball: ['Base', 'Escolta', 'Alero', 'Ala-Pívot', 'Pívot', '3x3'],
   tennis_padel: ['Tenis', 'Pádel', 'Badminton', 'Squash', 'Tenis Mesa', 'Pickleball', 'Frontón'],
   combat: ['Boxeo', 'MMA', 'Muay Thai', 'Kickboxing', 'Judo', 'BJJ', 'Karate', 'Taekwondo', 'Lucha', 'Esgrima'],
   baseball: ['Pitcher', 'Catcher', 'Base', 'Shortstop', 'Outfielder', 'Bateador', 'Softbol'],
   rugby_football: ['Rugby Forward', 'Rugby Back', 'Rugby 7s', 'QB', 'Running Back', 'Receiver', 'Lineman', 'Linebacker', 'Defensive Back', 'Kicker'],
   water: ['Natación', 'Aguas Abiertas', 'Waterpolo', 'Sincronizada', 'Saltos', 'Surf', 'Remo', 'Piragüismo', 'Paddle Surf', 'Vela'],
   cycling: ['Ruta', 'MTB XC', 'MTB Downhill', 'Pista', 'BMX', 'Triatlón', 'Duatlón', 'Gravel'],
   other: ['Golf', 'Escalada', 'Gimnasia', 'Voleibol', 'Balonmano', 'Hockey', 'Tiro con Arco', 'Skate', 'Esquí', 'Snowboard', 'Hípica']
};

// Sports with icons for visual selector (like Onboarding)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ALL_SPORTS_STRUCTURE: Record<string, { icon: any; disciplines: string[] }> = {
   gym: { icon: Dumbbell, disciplines: SPORTS_DISCIPLINES.gym },
   athletics: { icon: Activity, disciplines: SPORTS_DISCIPLINES.athletics },
   soccer: { icon: Trophy, disciplines: SPORTS_DISCIPLINES.soccer },
   basketball: { icon: Trophy, disciplines: SPORTS_DISCIPLINES.basketball },
   tennis_padel: { icon: Target, disciplines: SPORTS_DISCIPLINES.tennis_padel },
   combat: { icon: Swords, disciplines: SPORTS_DISCIPLINES.combat },
   baseball: { icon: Users, disciplines: SPORTS_DISCIPLINES.baseball },
   rugby_football: { icon: Users, disciplines: SPORTS_DISCIPLINES.rugby_football },
   water: { icon: Waves, disciplines: SPORTS_DISCIPLINES.water },
   cycling: { icon: Bike, disciplines: SPORTS_DISCIPLINES.cycling },
   other: { icon: Target, disciplines: SPORTS_DISCIPLINES.other }
};

export const Profile: React.FC<ProfileProps> = ({ currentUser, onUpdateUser, onLogout, language, onRefreshData }) => {
   // CORRECCIÓN AQUI: Añadido "as keyof typeof TEXTS"
   const t = TEXTS[language as keyof typeof TEXTS] || TEXTS.es;

   const [formData, setFormData] = useState<Partial<UserProfile>>(currentUser.profile || {});
   const [isSaving, setIsSaving] = useState(false);
   const [message, setMessage] = useState<string | null>(null);

   // Sport Change Logic State
   const [pendingSport, setPendingSport] = useState<string | null>(null);
   const [pendingDiscipline, setPendingDiscipline] = useState<string | null>(null);
   const [disciplineSearch, setDisciplineSearch] = useState('');
   const [step, setStep] = useState<'idle' | 'select_category' | 'select_discipline' | 'confirm_change' | 'confirm_data'>('idle');

   // Filtered disciplines
   const availableDisciplines = pendingSport ? (SPORTS_DISCIPLINES[pendingSport] || []) : [];
   const filteredDisciplines = availableDisciplines.filter(d => d.toLowerCase().includes(disciplineSearch.toLowerCase()));

   const handleSave = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSaving(true);
      setMessage(null);
      try {
         const updatedUser = await StorageService.updateUserProfile(currentUser.id, formData as UserProfile);
         onUpdateUser(updatedUser);
         setMessage(t.success);
      } catch (error) {
         console.error(error);
      } finally {
         setIsSaving(false);
      }
   };

   const handleDelete = async () => {
      if (confirm(t.deleteDesc)) {
         await StorageService.deleteCurrentAccount();
         onLogout();
      }
   };

   // --- SPORT CHANGE FLOW ---
   const initiateSportChange = (newSport: string) => {
      if (newSport === formData.sport) return;
      setPendingSport(newSport);
      setPendingDiscipline(null);
      setDisciplineSearch('');
      setStep('select_discipline');
   };

   const selectDiscipline = (disc: string) => {
      setPendingDiscipline(disc);
   };

   const confirmDisciplineSelection = () => {
      if (!pendingDiscipline) return;
      setStep('confirm_change');
   };

   const confirmChange = () => {
      setStep('confirm_data');
   };

   const cancelChange = () => {
      setPendingSport(null);
      setPendingDiscipline(null);
      setDisciplineSearch('');
      setStep('idle');
   };

   const finalizeSportChange = async (keepData: boolean) => {
      if (!pendingSport) return;
      setIsSaving(true);

      try {
         if (keepData) {
            // Option A: Just update profile (standard save)
            const newProfile = { ...formData, sport: pendingSport, discipline: pendingDiscipline || '' } as UserProfile;
            const updatedUser = await StorageService.updateUserProfile(currentUser.id, newProfile);
            setFormData(newProfile);
            onUpdateUser(updatedUser);
         } else {
            // Option B: Update profile AND reset exercises/records
            const newProfile = { ...formData, sport: pendingSport, discipline: pendingDiscipline || '' } as UserProfile;

            // Update User Profile First
            const updatedUser = await StorageService.updateUserProfile(currentUser.id, newProfile);

            // Reset Data via Service
            await StorageService.resetSportData(currentUser.id, pendingSport);

            setFormData(newProfile);
            onUpdateUser(updatedUser);

            // Trigger App Refresh to clear stale data in other components
            if (onRefreshData) onRefreshData();
         }
         setMessage(t.success);
      } catch (e) {
         console.error("Error changing sport", e);
      } finally {
         setIsSaving(false);
         setStep('idle');
         setPendingSport(null);
         setPendingDiscipline(null);
         setDisciplineSearch('');
      }
   };

   const currentSportLabel = formData.sport && SPORTS_LIST[formData.sport] ? SPORTS_LIST[formData.sport] : formData.sport;
   const newSportLabel = pendingSport && SPORTS_LIST[pendingSport] ? SPORTS_LIST[pendingSport] : pendingSport;

   return (
      <div className="h-full bg-gray-50 dark:bg-neutral-950 p-6 md:p-10 overflow-y-auto transition-colors duration-300 relative">
         <div className="max-w-3xl mx-auto">
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-2">{t.title}</h1>
            <p className="text-neutral-500 dark:text-neutral-400 mb-8">{t.subtitle}</p>

            <form onSubmit={handleSave} className="space-y-8">

               {/* PERSONAL INFO */}
               <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 shadow-sm">
                  <h2 className="text-lg font-bold text-neutral-900 dark:text-white mb-4 flex items-center gap-2">
                     <UserIcon size={20} className="text-orange-500" />
                     {t.personalInfo}
                  </h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                     <div>
                        <label className="block text-xs text-neutral-500 mb-1">{t.name}</label>
                        <input
                           type="text"
                           value={formData.firstName || ''}
                           onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                           className="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-2.5 text-neutral-900 dark:text-white focus:outline-none focus:border-orange-500"
                        />
                     </div>
                     <div>
                        <label className="block text-xs text-neutral-500 mb-1">{t.lastName}</label>
                        <input
                           type="text"
                           value={formData.lastName || ''}
                           onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                           className="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-2.5 text-neutral-900 dark:text-white focus:outline-none focus:border-orange-500"
                        />
                     </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                     <div>
                        <label className="block text-xs text-neutral-500 mb-1">{t.age}</label>
                        <input
                           type="number"
                           value={formData.age || ''}
                           onChange={(e) => setFormData({ ...formData, age: parseInt(e.target.value) })}
                           className="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-2.5 text-neutral-900 dark:text-white focus:outline-none focus:border-orange-500"
                        />
                     </div>
                     <div>
                        <label className="block text-xs text-neutral-500 mb-1">{t.height}</label>
                        <input
                           type="number"
                           value={formData.height || ''}
                           onChange={(e) => setFormData({ ...formData, height: parseInt(e.target.value) })}
                           className="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-2.5 text-neutral-900 dark:text-white focus:outline-none focus:border-orange-500"
                        />
                     </div>
                     <div>
                        <label className="block text-xs text-neutral-500 mb-1">{t.weight}</label>
                        <input
                           type="number"
                           value={formData.weight || ''}
                           onChange={(e) => setFormData({ ...formData, weight: parseFloat(e.target.value) })}
                           className="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-2.5 text-neutral-900 dark:text-white focus:outline-none focus:border-orange-500"
                        />
                     </div>
                  </div>
               </div>

               {/* PREFERENCES */}
               <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 shadow-sm">
                  <h2 className="text-lg font-bold text-neutral-900 dark:text-white mb-4 flex items-center gap-2">
                     <Settings size={20} className="text-purple-500" />
                     {t.settings}
                  </h2>

                  <div className="flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl border border-neutral-100 dark:border-neutral-800">
                     <div>
                        <span className="block font-bold text-neutral-900 dark:text-white mb-1">{t.showSupplements}</span>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm">{t.showSupplementsDesc}</p>
                     </div>

                     <button
                        type="button"
                        onClick={async () => {
                           const newValue = !formData.takesSupplements;
                           const updatedProfile = { ...formData, takesSupplements: newValue } as UserProfile;
                           setFormData(updatedProfile);

                           try {
                              const updatedUser = await StorageService.updateUserProfile(currentUser.id, updatedProfile);
                              onUpdateUser(updatedUser);
                           } catch (error) {
                              console.error(error);
                              setFormData({ ...formData, takesSupplements: !newValue });
                           }
                        }}
                        className={`w-12 h-6 rounded-full transition-colors relative ${formData.takesSupplements
                           ? 'bg-orange-600'
                           : 'bg-neutral-300 dark:bg-neutral-700'
                           }`}
                     >
                        <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${formData.takesSupplements ? 'left-7' : 'left-1'
                           }`} />
                     </button>
                  </div>
               </div>

               {/* SPORT SETTINGS */}
               <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 shadow-sm">
                  <h2 className="text-lg font-bold text-neutral-900 dark:text-white mb-4 flex items-center gap-2">
                     <Activity size={20} className="text-blue-500" />
                     {t.sportSettings}
                  </h2>

                  <div>
                     <label className="block text-xs text-neutral-500 mb-2">{t.sport}</label>
                     <button
                        type="button"
                        onClick={() => setStep('select_category')}
                        className="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-4 text-left hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors group"
                     >
                        <div className="flex items-center gap-3">
                           {formData.sport && ALL_SPORTS_STRUCTURE[formData.sport] && (
                              <div className="w-10 h-10 bg-orange-100 dark:bg-orange-500/20 rounded-lg flex items-center justify-center">
                                 {React.createElement(ALL_SPORTS_STRUCTURE[formData.sport].icon, { size: 20, className: "text-orange-600 dark:text-orange-500" })}
                              </div>
                           )}
                           <div className="flex-1">
                              <span className="block font-bold text-neutral-900 dark:text-white">
                                 {currentSportLabel || 'Seleccionar deporte'}
                              </span>
                              {formData.discipline && (
                                 <span className="block text-xs text-neutral-500">{getTranslatedDiscipline(formData.discipline, language)}</span>
                              )}
                           </div>
                           <ChevronRight size={18} className="text-neutral-400 group-hover:translate-x-1 transition-transform" />
                        </div>
                     </button>
                  </div>
               </div>

               {message && <p className="text-green-500 text-sm mb-4 bg-green-100 dark:bg-green-900/20 p-2 rounded">{message}</p>}

               <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full bg-neutral-900 dark:bg-white text-white dark:text-black font-bold py-3 rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
               >
                  <Save size={18} />
                  {t.save}
               </button>
            </form>

            {/* User ID Section */}
            <div className="mt-8 mb-12">
               <div className="p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl flex items-center justify-between shadow-sm">
                  <span className="text-sm font-medium text-neutral-500">{t.id}</span>
                  <span className="font-mono text-xs text-neutral-400 select-all">{currentUser.id}</span>
               </div>
            </div>

            {/* Delete Button Section */}
            <div className="mt-12 pt-8 border-t border-neutral-200 dark:border-neutral-800">
               <button
                  onClick={handleDelete}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors shadow-lg hover:shadow-red-900/20"
               >
                  <Trash2 size={18} />
                  {t.deleteAccount}
               </button>
               <p className="text-center text-xs text-neutral-400 mt-2">{t.deleteDesc}</p>
            </div>

         </div>

         {/* SPORT CATEGORY SELECTION MODAL */}
         {step === 'select_category' && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
               <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-6 rounded-3xl max-w-4xl w-full shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
                  <div className="flex flex-col items-center text-center mb-6">
                     <div className="w-16 h-16 bg-blue-100 dark:bg-blue-500/10 rounded-full flex items-center justify-center mb-4 text-blue-600 dark:text-blue-500">
                        <Trophy size={32} />
                     </div>
                     <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">{t.selectCategory}</h3>
                     <p className="text-neutral-500 dark:text-neutral-400 text-sm">
                        {t.selectCategoryDesc}
                     </p>
                  </div>

                  <div className="flex-1 overflow-y-auto min-h-[300px] p-1">
                     <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {Object.entries(ALL_SPORTS_STRUCTURE).map(([key, data]) => {
                           // eslint-disable-next-line @typescript-eslint/no-explicit-any
                           const Icon = data.icon as any;
                           const label = getTranslatedSportCategory(key, language);
                           const isSelected = formData.sport === key;

                           return (
                              <button
                                 key={key}
                                 onClick={() => initiateSportChange(key)}
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

                  <div className="mt-6 pt-4 border-t border-neutral-200 dark:border-neutral-800">
                     <button onClick={cancelChange} className="w-full py-3 px-4 bg-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white font-medium rounded-xl transition-colors">
                        {t.cancel}
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* DISCIPLINE SELECTION MODAL */}
         {step === 'select_discipline' && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
               <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-6 rounded-3xl max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200 max-h-[80vh] flex flex-col">
                  <div className="flex flex-col items-center text-center mb-4">
                     <div className="w-16 h-16 bg-orange-100 dark:bg-orange-500/10 rounded-full flex items-center justify-center mb-4 text-orange-600 dark:text-orange-500">
                        <Activity size={32} />
                     </div>
                     <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">{t.selectDiscipline}</h3>
                     <p className="text-neutral-500 dark:text-neutral-400 text-sm">
                        {t.selectDisciplineDesc.replace('{sport}', newSportLabel || '')}
                     </p>
                  </div>

                  {/* Search */}
                  <div className="relative mb-3">
                     <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
                     <input
                        type="text"
                        placeholder={t.searchDiscipline}
                        value={disciplineSearch}
                        onChange={(e) => setDisciplineSearch(e.target.value)}
                        className="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg py-2 pl-9 pr-4 text-sm text-neutral-900 dark:text-white focus:border-orange-500 focus:outline-none placeholder-neutral-500"
                     />
                  </div>

                  {/* Disciplines List */}
                  <div className="flex-1 overflow-y-auto bg-neutral-50 dark:bg-neutral-800/50 rounded-xl border border-neutral-200 dark:border-neutral-700 min-h-[200px] max-h-[300px]">
                     {filteredDisciplines.length > 0 ? filteredDisciplines.map((disc) => (
                        <button
                           key={disc}
                           onClick={() => selectDiscipline(disc)}
                           className={`w-full p-3 text-left text-sm border-b border-neutral-200 dark:border-neutral-700 last:border-0 flex justify-between items-center transition-colors ${pendingDiscipline === disc
                              ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400 font-medium'
                              : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                              }`}
                        >
                           {getTranslatedDiscipline(disc, language)}
                           {pendingDiscipline === disc && <Check size={16} />}
                        </button>
                     )) : (
                        <p className="p-4 text-center text-neutral-500 text-sm">{t.noResults}</p>
                     )}
                  </div>

                  {/* Buttons */}
                  <div className="flex flex-col gap-2 mt-4">
                     <button
                        onClick={confirmDisciplineSelection}
                        disabled={!pendingDiscipline}
                        className="w-full py-3 px-4 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                     >
                        {t.continue}
                     </button>
                     <button onClick={cancelChange} className="w-full py-3 px-4 bg-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white font-medium rounded-xl transition-colors">
                        {t.cancel}
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* CONFIRMATION MODALS FOR SPORT CHANGE */}
         {step === 'confirm_change' && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
               <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-6 rounded-3xl max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
                  <div className="flex flex-col items-center text-center">
                     <div className="w-16 h-16 bg-blue-100 dark:bg-blue-500/10 rounded-full flex items-center justify-center mb-4 text-blue-600 dark:text-blue-500">
                        <Activity size={32} />
                     </div>
                     <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">{t.changeTitle}</h3>
                     <p className="text-neutral-500 dark:text-neutral-400 text-sm mb-6">
                        {t.changeDesc.replace('{old}', currentSportLabel || 'Unknown').replace('{new}', newSportLabel || 'Unknown')}
                     </p>
                     <div className="flex flex-col gap-2 w-full">
                        <button onClick={confirmChange} className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-colors">{t.confirmChange}</button>
                        <button onClick={cancelChange} className="w-full py-3 px-4 bg-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white font-medium rounded-xl transition-colors">{t.cancel}</button>
                     </div>
                  </div>
               </div>
            </div>
         )}

         {step === 'confirm_data' && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
               <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-6 rounded-3xl max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
                  <div className="flex flex-col items-center text-center">
                     <div className="w-16 h-16 bg-orange-100 dark:bg-orange-500/10 rounded-full flex items-center justify-center mb-4 text-orange-600 dark:text-orange-500">
                        <AlertTriangle size={32} />
                     </div>
                     <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">{t.dataTitle}</h3>
                     <p className="text-neutral-600 dark:text-neutral-300 text-sm mb-6 font-medium">
                        {t.dataDesc}
                     </p>

                     <div className="flex flex-col gap-3 w-full">
                        <button
                           onClick={() => finalizeSportChange(true)}
                           className="w-full py-4 px-4 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-900 dark:text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 group"
                        >
                           <Check size={18} className="text-green-500" />
                           {t.keepBtn}
                        </button>

                        <button
                           onClick={() => finalizeSportChange(false)}
                           className="w-full py-4 px-4 bg-red-600/10 border border-red-500/30 hover:bg-red-600/20 text-red-600 dark:text-red-400 font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                        >
                           <Trash2 size={18} />
                           {t.resetBtn}
                        </button>

                        <button onClick={cancelChange} className="mt-2 text-xs text-neutral-400 hover:text-white underline decoration-neutral-700">{t.cancel}</button>
                     </div>
                  </div>
               </div>
            </div>
         )}

      </div>
   );
};