
import React, { useState } from 'react';
import { Screen, User, Language, TEAM_SPORTS, NON_COMPETITIVE_SPORTS, GYM_RELATED_SPORTS } from '../types';
import { LayoutDashboard, Video, Dumbbell, Target, MessageSquareQuote, LogOut, Trophy, FileText, X, Calculator, Users, ChevronDown, User as UserIcon, Settings, Sun, Moon, Trash2, AlertTriangle, Star, Pill, PanelLeft, Dribbble } from 'lucide-react';
import { StorageService } from '../services/storageService';
import { useTheme } from '../hooks/useTheme';

interface SidebarProps {
   currentScreen: Screen;
   onNavigate: (screen: Screen) => void;
   onLogout: () => void;
   onClose?: () => void;
   currentUser: User | null;
   managedAthletes: User[];
   viewedUserId: string | null;
   onSwitchAthlete: (athleteId: string) => void;
   language: Language;
   onLanguageChange: (lang: Language) => void;
}



const SIDEBAR_TEXTS = {
   es: {
      dashboard: 'Inicio',
      gallery: 'Video Análisis',
      strength: 'Fuerza & RM',
      calculator: 'Calculadora Discos',
      planning: 'Entrenamientos',
      competition: 'Competiciones',
      training: 'Práctica Técnica',
      matches: 'Partidos',
      supplements: 'Suplementación',
      coach: 'Entrenador IA',
      team: 'Gestión de Equipo',
      pricing: 'Planes Premium',
      logout: 'Cerrar Sesión',
      settings: 'Ajustes',
      theme: 'Tema',
      lang: 'Idioma',
      myProfile: 'Mi Perfil',
      analyzing: 'Analizando a:',
      deleteAccount: 'Eliminar Cuenta',
      deleteConfirmTitle: '¿Eliminar cuenta permanentemente?',
      deleteConfirmDesc: 'Perderás todos tus datos, vídeos y registros. Esta acción no se puede deshacer.',
      cancel: 'Cancelar',
      confirm: 'Sí, eliminar cuenta'
   },
   ing: {
      dashboard: 'Dashboard',
      gallery: 'Video Analysis',
      strength: 'Strength & RM',
      calculator: 'Plate Calculator',
      planning: 'Workout Plans',
      competition: 'Competitions',
      training: 'Technical Practice',
      matches: 'Matches',
      supplements: 'Supplementation',
      coach: 'AI Coach',
      team: 'Team Management',
      pricing: 'Premium Plans',
      logout: 'Log Out',
      settings: 'Settings',
      theme: 'Theme',
      lang: 'Language',
      myProfile: 'My Profile',
      analyzing: 'Analyzing:',
      deleteAccount: 'Delete Account',
      deleteConfirmTitle: 'Delete account permanently?',
      deleteConfirmDesc: 'You will lose all data, videos, and records. This action cannot be undone.',
      cancel: 'Cancel',
      confirm: 'Yes, delete account'
   },
   eus: {
      dashboard: 'Hasiera',
      gallery: 'Bideo Analisia',
      strength: 'Indarra & RM',
      calculator: 'Disko Kalkulagailua',
      planning: 'Entrenamenduak',
      competition: 'Txapelketak',
      training: 'Praktika Teknikoa',
      matches: 'Partiduak',
      supplements: 'Osagarriak',
      coach: 'AI Entrenatzailea',
      team: 'Talde Kudeaketa',
      pricing: 'Premium Planak',
      logout: 'Saioa Itxi',
      settings: 'Ezarpenak',
      theme: 'Gaia',
      lang: 'Hizkuntza',
      myProfile: 'Nire Profila',
      analyzing: 'Analizatzen:',
      deleteAccount: 'Kontua Ezabatu',
      deleteConfirmTitle: 'Kontua betirako ezabatu?',
      deleteConfirmDesc: 'Datu, bideo eta erregistro guztiak galduko dituzu. Ekintza hau ezin da desegin.',
      cancel: 'Utzi',
      confirm: 'Bai, ezabatu'
   }
};

export const Sidebar: React.FC<SidebarProps> = ({
   currentScreen,
   onNavigate,
   onLogout,
   onClose,
   currentUser,
   managedAthletes,
   viewedUserId,
   onSwitchAthlete,
   language,
   onLanguageChange
}) => {
   const isCoach = currentUser?.profile?.role === 'coach';
   const [showSettings, setShowSettings] = useState(false);
   const { theme, toggleTheme } = useTheme();
   const t = SIDEBAR_TEXTS[language as keyof typeof SIDEBAR_TEXTS] || SIDEBAR_TEXTS.es;

   const isViewingSelf = viewedUserId === currentUser?.id;
   const viewedAthlete = managedAthletes.find(a => a.id === viewedUserId);

   // Determine sport type for current user (or viewed athlete)
   const viewedProfile = isViewingSelf
      ? currentUser?.profile
      : managedAthletes.find(a => a.id === viewedUserId)?.profile || currentUser?.profile;

   const userSport = viewedProfile?.sport || '';
   const isTeamSport = TEAM_SPORTS.includes(userSport);
   const isNonCompetitive = NON_COMPETITIVE_SPORTS.includes(userSport);

   // Enable features based on sport type
   const showCalculator = GYM_RELATED_SPORTS.includes(userSport);
   const showSupplements = true;

   // Define MenuItem type for proper TypeScript inference
   type MenuItem = { id: string; label: string; icon: any; special?: boolean };

   // Build menu items based on sport type
   const baseMenuItems: MenuItem[] = [
      { id: 'dashboard', label: t.dashboard, icon: LayoutDashboard },
      { id: 'gallery', label: t.gallery, icon: Video },
      { id: 'strength', label: t.strength, icon: Dumbbell },
      ...(showCalculator ? [{ id: 'calculator', label: t.calculator, icon: Calculator }] : []),
      { id: 'planning', label: t.planning, icon: FileText },
   ];

   // Add sport-specific menu items
   let sportMenuItems: MenuItem[] = [];
   if (isTeamSport) {
      // Team sports: show Matches instead of Competition/Training
      sportMenuItems = [{ id: 'matches', label: t.matches, icon: Dribbble }];
   } else if (!isNonCompetitive) {
      // Individual competitive sports: show Competition and Training
      sportMenuItems = [
         { id: 'competition', label: t.competition, icon: Trophy },
         { id: 'training', label: t.training, icon: Target },
      ];
   }
   // Non-competitive sports: no additional items

   const menuItems: MenuItem[] = [
      ...baseMenuItems,
      ...sportMenuItems,
      ...(showSupplements ? [{ id: 'supplements', label: t.supplements, icon: Pill }] : []),
      { id: 'coach', label: t.coach, icon: MessageSquareQuote },
      { id: 'pricing', label: t.pricing, icon: Star, special: true },
   ];

   const coachItems = [
      { id: 'team_management', label: t.team, icon: Users },
   ];

   return (
      <div className="bg-white dark:bg-neutral-900 h-full flex flex-col border-r border-neutral-200 dark:border-neutral-800 w-full overflow-hidden transition-colors duration-300">

         <div className="p-6 flex items-center justify-between flex-shrink-0 relative">
            <div className="flex items-center gap-2">
               <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center rotate-3 shadow-lg shadow-orange-500/20">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
               </div>
               <h1 className="text-xl font-bold text-neutral-900 dark:text-white tracking-tight">Coach <span className="text-orange-600">AI</span></h1>
            </div>

            <div className="flex items-center gap-1">
               <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={`p-2 rounded-full transition-all ${showSettings ? 'bg-neutral-100 dark:bg-neutral-800 text-orange-600' : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-white'}`}
                  title={t.settings}
               >
                  <Settings size={20} className={`transition-transform duration-500 ${showSettings ? 'rotate-90' : ''}`} />
               </button>

               {/* Close Button (Both Mobile & Desktop now use onClose to collapse) */}
               {onClose && (
                  <button onClick={onClose} className="p-2 text-neutral-400 hover:text-white ml-1">
                     <PanelLeft size={20} />
                  </button>
               )}
            </div>

            {/* Settings Popover */}
            <div className={`absolute top-full right-4 mt-2 w-52 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl z-50 overflow-hidden transition-all duration-200 origin-top-right ${showSettings ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
               <div className="p-2 space-y-2">
                  <button
                     onClick={() => { onNavigate('profile'); setShowSettings(false); }}
                     className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors text-neutral-700 dark:text-neutral-300"
                  >
                     <UserIcon size={16} />
                     <span className="text-xs font-bold">{t.myProfile}</span>
                  </button>

                  <div className="h-[1px] bg-neutral-100 dark:bg-neutral-800 w-full my-1"></div>

                  <button
                     onClick={toggleTheme}
                     className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                  >
                     <span className="text-xs font-bold text-neutral-600 dark:text-neutral-400">{t.theme}</span>
                     <div className="flex items-center gap-2 text-neutral-800 dark:text-white">
                        {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
                        <span className="text-xs capitalize">{theme === 'dark' ? 'Dark' : 'Light'}</span>
                     </div>
                  </button>

                  <div className="h-[1px] bg-neutral-100 dark:bg-neutral-800 w-full my-1"></div>

                  <div>
                     <span className="text-xs font-bold text-neutral-600 dark:text-neutral-400 px-2 block mb-1">{t.lang}</span>
                     <div className="grid grid-cols-3 gap-1">
                        {(['es', 'ing', 'eus'] as Language[]).map((lang) => (
                           <button
                              key={lang}
                              onClick={() => onLanguageChange(lang)}
                              className={`text-[10px] font-bold py-1.5 rounded uppercase transition-colors ${language === lang
                                 ? 'bg-orange-600 text-white'
                                 : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                                 }`}
                           >
                              {lang}
                           </button>
                        ))}
                     </div>
                  </div>
               </div>
            </div>
         </div>

         {isCoach && currentUser && (
            <div className="px-4 mb-4 flex-shrink-0">
               <div className="relative group">
                  <button className="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl p-3 flex items-center justify-between hover:border-orange-500/50 transition-colors">
                     <div className="flex items-center gap-3 overflow-hidden">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${isViewingSelf ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-white' : 'bg-orange-600 text-white'}`}>
                           {isViewingSelf ? 'YO' : viewedAthlete?.profile?.firstName.charAt(0)}
                        </div>
                        <div className="text-left overflow-hidden">
                           <p className="text-xs text-neutral-500 font-medium uppercase tracking-wider">
                              {isViewingSelf ? t.myProfile : t.analyzing}
                           </p>
                           <p className="text-sm font-bold text-neutral-900 dark:text-white truncate">
                              {isViewingSelf ? (currentUser.profile?.role === 'coach' ? 'Entrenador' : 'Atleta') : `${viewedAthlete?.profile?.firstName} ${viewedAthlete?.profile?.lastName}`}
                           </p>
                        </div>
                     </div>
                     <ChevronDown size={16} className="text-neutral-500 group-hover:text-orange-500" />
                  </button>

                  <div className="absolute top-full left-0 w-full mt-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl z-40 overflow-hidden hidden group-focus-within:block hover:block">
                     <div className="max-h-48 overflow-y-auto">
                        <button
                           onClick={() => onSwitchAthlete(currentUser.id)}
                           className={`w-full p-3 text-left flex items-center gap-3 hover:bg-neutral-100 dark:hover:bg-neutral-800 ${isViewingSelf ? 'bg-neutral-100 dark:bg-neutral-800' : ''}`}
                        >
                           <div className="w-6 h-6 bg-neutral-200 dark:bg-neutral-700 rounded-full flex items-center justify-center text-neutral-600 dark:text-white"><UserIcon size={12} /></div>
                           <span className="text-sm text-neutral-700 dark:text-neutral-300">{t.myProfile}</span>
                        </button>

                        {managedAthletes.length > 0 && (
                           <div className="px-3 py-1 text-[10px] text-neutral-500 uppercase bg-neutral-50 dark:bg-neutral-950/50 font-bold tracking-wider">
                              Atletas
                           </div>
                        )}

                        {managedAthletes.map(athlete => (
                           <button
                              key={athlete.id}
                              onClick={() => onSwitchAthlete(athlete.id)}
                              className={`w-full p-3 text-left flex items-center gap-3 hover:bg-neutral-100 dark:hover:bg-neutral-800 ${viewedUserId === athlete.id ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' : 'text-neutral-700 dark:text-neutral-300'}`}
                           >
                              <div className="w-6 h-6 bg-neutral-200 dark:bg-neutral-800 rounded-full flex items-center justify-center text-xs font-bold">
                                 {athlete.profile?.firstName.charAt(0)}
                              </div>
                              <span className="text-sm truncate">{athlete.profile?.firstName} {athlete.profile?.lastName}</span>
                           </button>
                        ))}
                     </div>
                  </div>
               </div>
            </div>
         )}

         <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-800">
            {menuItems.map((item) => {
               const isActive = currentScreen === item.id ||
                  (currentScreen === 'analyzer' && item.id === 'gallery') ||
                  (currentScreen === 'planViewer' && item.id === 'planning');

               return (
                  <button
                     key={item.id}
                     onClick={() => {
                        onNavigate(item.id as Screen);
                        if (onClose && window.innerWidth < 768) onClose(); // Only close on mobile selection
                     }}
                     className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${isActive
                        ? (item.special ? 'bg-orange-600 text-white shadow-lg' : 'bg-orange-600 text-white shadow-[0_4px_15px_rgba(234,88,12,0.3)]')
                        : (item.special ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 hover:bg-orange-500/20' : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white')
                        }`}
                  >
                     <item.icon size={20} className={isActive ? 'text-white' : (item.special ? 'text-orange-500' : '')} />
                     {item.label}
                  </button>
               );
            })}

            {isCoach && <div className="my-2 border-t border-neutral-200 dark:border-neutral-800 mx-2"></div>}

            {isCoach && coachItems.map((item) => (
               <button
                  key={item.id}
                  onClick={() => {
                     onNavigate(item.id as Screen);
                     if (onClose && window.innerWidth < 768) onClose();
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${currentScreen === item.id
                     ? 'bg-blue-600 text-white shadow-lg'
                     : 'text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-300'
                     }`}
               >
                  <item.icon size={20} />
                  {item.label}
               </button>
            ))}

         </nav>

         <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 flex-shrink-0">
            <button
               onClick={onLogout}
               className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-neutral-500 dark:text-neutral-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors"
            >
               <LogOut size={20} />
               {t.logout}
            </button>
         </div>
      </div>
   );
};
