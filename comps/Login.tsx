
import React, { useState, useEffect } from 'react';
import { User, Language } from '../types';
import { StorageService } from '../svcs/storageService';
import { User as UserIcon, Lock, ArrowRight, Loader2, AlertCircle, CloudOff, Cloud, Eye, EyeOff, Moon, Sun, Settings, X, CheckCircle2 } from 'lucide-react';

interface LoginProps {
  onLogin: (user: User) => void;
  language: Language;
  onLanguageChange: (lang: Language) => void;
}

type Theme = 'dark' | 'light';

// Translations Dictionary
const TEXTS = {
  es: {
    welcome: 'Bienvenido de nuevo, atleta',
    create: 'Crea tu perfil de atleta para comenzar.',
    userLabel: 'Correo o Usuario',
    passLabel: 'Contraseña',
    confirmPassLabel: 'Confirmar Contraseña',
    loginBtn: 'Iniciar Sesión',
    createBtn: 'Crear Cuenta',
    continueBtn: 'Continuar',
    toggleLogin: '¿Ya tienes cuenta? Inicia Sesión',
    toggleReg: '¿No tienes cuenta? Regístrate',
    errorMissing: 'Por favor completa todos los campos.',
    errorMismatch: 'Las contraseñas no coinciden.',
    cloud: 'MODO NUBE',
    local: 'MODO LOCAL',
    warn: '⚠️ Sin base de datos. Datos solo locales.',
    settings: 'Ajustes',
    darkMode: 'Modo Oscuro',
    lightMode: 'Modo Claro'
  },
  ing: {
    welcome: 'Welcome back, athlete',
    create: 'Create your athlete profile to start.',
    userLabel: 'Email or Username',
    passLabel: 'Password',
    confirmPassLabel: 'Confirm Password',
    loginBtn: 'Sign In',
    createBtn: 'Create Account',
    continueBtn: 'Continue',
    toggleLogin: 'Already have an account? Sign In',
    toggleReg: "Don't have an account? Sign Up",
    errorMissing: 'Please fill in all fields.',
    errorMismatch: 'Passwords do not match.',
    cloud: 'CLOUD MODE',
    local: 'LOCAL MODE',
    warn: '⚠️ No database. Data is local only.',
    settings: 'Settings',
    darkMode: 'Dark Mode',
    lightMode: 'Light Mode'
  },
  eus: {
    welcome: 'Ongi etorri berriro, atleta',
    create: 'Sortu zure atleta profila hasteko.',
    userLabel: 'Posta edo Erabiltzailea',
    passLabel: 'Pasahitza',
    confirmPassLabel: 'Pasahitza Baieztatu',
    loginBtn: 'Saioa Hasi',
    createBtn: 'Kontua Sortu',
    continueBtn: 'Jarraitu',
    toggleLogin: 'Kontua duzu? Hasi Saioa',
    toggleReg: 'Ez duzu konturik? Eman izena',
    errorMissing: 'Mesedez, bete eremu guztiak.',
    errorMismatch: 'Pasahitzak ez datoz bat.',
    cloud: 'HODEI MODUA',
    local: 'TOKI MODUA',
    warn: '⚠️ Datu-baserik ez. Datuak lokalean bakarrik.',
    settings: 'Ezarpenak',
    darkMode: 'Modu Iluna',
    lightMode: 'Modu Argia'
  }
};

const getFriendlyErrorMessage = (errorMsg: string): string => {
  const msg = errorMsg.toLowerCase();
  // Firebase Auth Specific Errors
  if (msg.includes('auth/invalid-credential') || msg.includes('invalid-credential')) return 'Credenciales incorrectas. Verifica tu correo y contraseña.';
  if (msg.includes('auth/user-not-found')) return 'No existe una cuenta con este correo.';
  if (msg.includes('auth/wrong-password')) return 'La contraseña es incorrecta.';
  if (msg.includes('auth/email-already-in-use')) return 'Este correo ya está registrado.';
  if (msg.includes('auth/invalid-email')) return 'El formato del correo no es válido.';
  if (msg.includes('auth/weak-password')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (msg.includes('auth/too-many-requests')) return 'Demasiados intentos fallidos. Espera unos minutos.';
  if (msg.includes('network-request-failed')) return 'Error de conexión. Verifica tu internet.';
  
  // Generic fallback
  return errorMsg.replace('Firebase: ', '').replace('Error ', '').replace(/\(auth\/.*\)/, '').trim();
};

export const Login: React.FC<LoginProps> = ({ onLogin, language, onLanguageChange }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirm, setShowConfirm] = useState(false); 
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Settings State
  const [theme, setTheme] = useState<Theme>('dark');
  const [showSettings, setShowSettings] = useState(false);

  const isCloud = StorageService.isCloudMode();
  
  const t = TEXTS[language] || TEXTS.es;

  // Theme Handling
  useEffect(() => {
    const savedTheme = localStorage.getItem('coachai_theme') as Theme;
    if (savedTheme) {
      setTheme(savedTheme);
      updateHtmlClass(savedTheme);
    } else {
      updateHtmlClass('dark'); // Default
    }
  }, []);

  const updateHtmlClass = (newTheme: Theme) => {
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('coachai_theme', newTheme);
    updateHtmlClass(newTheme);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUser = username.trim();
    const cleanPass = password.trim();
    const cleanConfirm = confirmPassword.trim();

    if (!cleanUser || !cleanPass) {
      setError(t.errorMissing);
      return;
    }

    if (isRegistering) {
       if (!showConfirm) {
          setShowConfirm(true);
          return; 
       }
       if (!cleanConfirm) {
          setError(t.errorMissing);
          return;
       }
       if (cleanPass !== cleanConfirm) {
          setError(t.errorMismatch);
          return;
       }
    }

    setIsLoading(true);
    try {
      let user: User;
      if (isRegistering) {
        user = await StorageService.register(cleanUser, cleanPass);
      } else {
        user = await StorageService.login(cleanUser, cleanPass);
      }
      onLogin(user);
    } catch (err: any) {
      // Only log full error if it's unexpected. Invalid Credential is expected user error.
      const rawMsg = err.code || err.message || 'Error desconocido';
      if (!rawMsg.includes('invalid-credential') && !rawMsg.includes('wrong-password') && !rawMsg.includes('user-not-found')) {
         console.error("Login Error Object:", err);
      }
      setError(getFriendlyErrorMessage(rawMsg));
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleMode = () => {
    setIsRegistering(!isRegistering);
    setError(null);
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setShowConfirm(false); 
  };

  return (
    <div className="relative h-screen w-full bg-white dark:bg-black overflow-hidden flex items-center justify-center transition-colors duration-300">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <img 
          src="https://images.unsplash.com/photo-1552674605-46d530310524?q=80&w=2067&auto=format&fit=crop" 
          alt="Sprinter starting block" 
          className="w-full h-full object-cover opacity-10 dark:opacity-40 grayscale transition-opacity duration-300" 
        />
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/80 to-transparent dark:from-black dark:via-black/80 dark:to-transparent transition-colors duration-300"></div>
      </div>

      {/* Settings Panel */}
      <div className="absolute safe-top-4 safe-left-4 z-40 flex flex-col items-start gap-2">
         <button 
            onClick={() => setShowSettings(!showSettings)}
            className="p-2.5 rounded-full bg-white/80 dark:bg-neutral-800/80 backdrop-blur border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:text-orange-600 dark:hover:text-orange-500 shadow-sm transition-all"
         >
            {showSettings ? <X className="w-5 h-5" /> : <Settings className="w-5 h-5" />}
         </button>

         <div className={`flex flex-col gap-2 transition-all duration-200 origin-top-left ${showSettings ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
            <div className="flex bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md rounded-xl p-1 border border-neutral-200 dark:border-neutral-800 shadow-lg">
               {(['es', 'ing', 'eus'] as Language[]).map((lang) => (
                  <button
                     key={lang}
                     onClick={() => onLanguageChange(lang)}
                     className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-colors ${
                        language === lang 
                        ? 'bg-orange-500 text-white shadow' 
                        : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                     }`}
                  >
                     {lang}
                  </button>
               ))}
            </div>

            <button 
               onClick={toggleTheme}
               className="flex items-center gap-2 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md rounded-xl px-4 py-2 border border-neutral-200 dark:border-neutral-800 shadow-lg text-xs font-bold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors w-fit"
            >
               {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
               <span>{theme === 'dark' ? t.lightMode : t.darkMode}</span>
            </button>
         </div>
      </div>
      
      {/* Cloud Indicator */}
      <div className="absolute safe-top-4 safe-right-4 z-30">
        {isCloud ? (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 dark:bg-green-900/40 border border-green-200 dark:border-green-500/30 rounded-full text-green-700 dark:text-green-400 text-xs font-mono">
            <Cloud size={14} />
            <span>{t.cloud}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-200/80 dark:bg-neutral-800/80 border border-neutral-300 dark:border-neutral-700 rounded-full text-neutral-600 dark:text-neutral-400 text-xs font-mono backdrop-blur-md">
            <CloudOff size={14} />
            <span>{t.local}</span>
          </div>
        )}
      </div>

      {/* Auth Card */}
      <div className="relative z-20 w-full max-w-md p-8 m-4 bg-white/80 dark:bg-neutral-900/90 backdrop-blur-xl border border-neutral-200 dark:border-neutral-800 rounded-3xl shadow-2xl animate-in fade-in zoom-in duration-300 transition-colors">
        <div className="flex flex-col items-center text-center mb-8">
           <div className="w-14 h-14 bg-orange-600 rounded-2xl flex items-center justify-center mb-4 rotate-3 shadow-[0_0_20px_rgba(234,88,12,0.4)]">
             <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
           </div>
           
           <h1 className="text-3xl font-bold text-neutral-900 dark:text-white tracking-tight transition-colors">Coach <span className="text-orange-600 dark:text-orange-500">AI</span></h1>
           <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-2 transition-colors">
             {isRegistering ? t.create : t.welcome}
           </p>
           {!isCloud && (
              <p className="text-[10px] text-yellow-700 dark:text-yellow-600 mt-2 bg-yellow-100 dark:bg-yellow-900/20 px-2 py-1 rounded transition-colors">
                {t.warn}
              </p>
           )}
        </div>

        <div className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1">
               <label className="text-xs text-neutral-500 dark:text-neutral-400 ml-1 transition-colors">{t.userLabel}</label>
               <div className="relative">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" size={18} />
                  <input 
                    type="text" 
                    name="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-neutral-100 dark:bg-black/50 border border-neutral-300 dark:border-neutral-700 rounded-xl py-3 pl-11 pr-4 text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-600 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                    placeholder="Usuario"
                    autoCapitalize="none"
                    autoComplete="username"
                    autoCorrect="off"
                    spellCheck="false"
                  />
               </div>
            </div>

            <div className="space-y-1">
               <label className="text-xs text-neutral-500 dark:text-neutral-400 ml-1 transition-colors">{t.passLabel}</label>
               <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" size={18} />
                  <input 
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-neutral-100 dark:bg-black/50 border border-neutral-300 dark:border-neutral-700 rounded-xl py-3 pl-11 pr-12 text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-600 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                    placeholder="••••••••"
                    autoCapitalize="none"
                    autoComplete="current-password"
                    autoCorrect="off"
                    spellCheck="false"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-white transition-colors p-1"
                    title={showPassword ? "Ocultar" : "Mostrar"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
               </div>
            </div>

            {isRegistering && showConfirm && (
               <div className="space-y-1 animate-in slide-in-from-top-4 fade-in duration-300">
                  <label className="text-xs text-neutral-500 dark:text-neutral-400 ml-1 transition-colors">{t.confirmPassLabel}</label>
                  <div className="relative">
                     <CheckCircle2 className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${confirmPassword && confirmPassword === password ? 'text-green-500' : 'text-neutral-400 dark:text-neutral-500'}`} size={18} />
                     <input 
                        type="password" 
                        name="confirmPassword"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={`w-full bg-neutral-100 dark:bg-black/50 border rounded-xl py-3 pl-11 pr-4 text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-600 focus:outline-none focus:ring-1 transition-all ${
                           confirmPassword && confirmPassword !== password 
                           ? 'border-red-500 focus:border-red-500 focus:ring-red-500' 
                           : 'border-neutral-300 dark:border-neutral-700 focus:border-orange-500 focus:ring-orange-500'
                        }`}
                        placeholder="••••••••"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck="false"
                        autoFocus
                     />
                  </div>
               </div>
            )}

            {/* Error Message with High Visibility */}
            {error && (
              <div className="flex items-start gap-3 bg-red-600/10 dark:bg-red-500/10 border border-red-500/50 p-4 rounded-xl animate-in slide-in-from-top-2 transition-all">
                <AlertCircle size={20} className="text-red-600 dark:text-red-500 flex-shrink-0 mt-0.5" />
                <span className="text-sm font-semibold text-red-700 dark:text-red-400 leading-tight">{error}</span>
              </div>
            )}

            <button 
               type="submit"
               disabled={isLoading}
               className="w-1/2 mx-auto py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold rounded-full transition-all transform hover:scale-[1.02] shadow-lg flex items-center justify-center gap-2 mt-8 disabled:opacity-50 disabled:cursor-not-allowed"
             >
               {isLoading ? (
                 <Loader2 className="animate-spin" size={16} />
               ) : (
                 <>
                   <span>
                     {isRegistering 
                        ? (!showConfirm ? t.continueBtn : t.createBtn) 
                        : t.loginBtn}
                   </span>
                   <ArrowRight size={16} />
                 </>
               )}
             </button>
          </form>

          <div className="mt-6 text-center">
            <button 
              onClick={handleToggleMode}
              className="text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors underline decoration-neutral-300 dark:decoration-neutral-700 underline-offset-4"
            >
              {isRegistering ? t.toggleLogin : t.toggleReg}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
