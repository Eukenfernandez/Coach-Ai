
import React, { useState } from 'react';
import { User } from './types';
import { StorageService } from './svcs/storageService';
import { User as UserIcon, Lock, ArrowRight, Loader2, AlertCircle, CloudOff, Cloud } from 'lucide-react';

interface LoginProps {
  onLogin: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isCloud = StorageService.isCloudMode();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const cleanUser = username.trim();
    const cleanPass = password.trim();

    try {
      if (!cleanUser || !cleanPass) {
        throw new Error('Por favor completa todos los campos.');
      }

      let user: User;
      if (isRegistering) {
        user = await StorageService.register(cleanUser, cleanPass);
      } else {
        user = await StorageService.login(cleanUser, cleanPass);
      }
      onLogin(user);
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error. Verifica tus credenciales.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative h-screen w-full bg-black overflow-hidden flex items-center justify-center">
      {/* Background Image (Sprinter) */}
      <div className="absolute inset-0 z-0">
        <img 
          src="https://images.unsplash.com/photo-1552674605-46d530310524?q=80&w=2067&auto=format&fit=crop" 
          alt="Sprinter starting block" 
          className="w-full h-full object-cover opacity-40 grayscale" 
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-transparent"></div>
      </div>

      {/* SVG Analysis Overlay */}
      <svg className="absolute inset-0 w-full h-full z-10 pointer-events-none opacity-30">
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(234, 88, 12, 0.2)" strokeWidth="0.5"/>
        </pattern>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
      
      {/* Cloud/Local Indicator */}
      <div className="absolute top-4 right-4 z-30">
        {isCloud ? (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-900/40 border border-green-500/30 rounded-full text-green-400 text-xs font-mono">
            <Cloud size={14} />
            <span>MODO NUBE ACTIVO</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800/80 border border-neutral-700 rounded-full text-neutral-400 text-xs font-mono backdrop-blur-md">
            <CloudOff size={14} />
            <span>MODO LOCAL (OFFLINE)</span>
          </div>
        )}
      </div>

      {/* Auth Card */}
      <div className="relative z-20 w-full max-w-md p-8 m-4 bg-neutral-900/90 backdrop-blur-xl border border-neutral-800 rounded-3xl shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="flex flex-col items-center text-center mb-8">
           <div className="w-14 h-14 bg-orange-600 rounded-2xl flex items-center justify-center mb-4 rotate-3 shadow-[0_0_20px_rgba(234,88,12,0.4)]">
             <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
           </div>
           
           <h1 className="text-3xl font-bold text-white tracking-tight">Coach <span className="text-orange-500">AI</span></h1>
           <p className="text-neutral-400 text-sm mt-2">
             {isRegistering ? 'Crea tu perfil de atleta para comenzar.' : 'Bienvenido de nuevo, atleta.'}
           </p>
           {!isCloud && (
              <p className="text-[10px] text-yellow-600 mt-2 bg-yellow-900/20 px-2 py-1 rounded">
                ⚠️ Sin base de datos configurada. Los datos solo se guardan en este dispositivo.
              </p>
           )}
        </div>

        <div className="space-y-4">
          
          {/* Manual Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1">
               <label className="text-xs text-neutral-400 ml-1">Correo o Usuario</label>
               <div className="relative">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
                  <input 
                    type="text" 
                    name="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-black/50 border border-neutral-700 rounded-xl py-3 pl-11 pr-4 text-white placeholder-neutral-600 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                    placeholder="Usuario"
                    autoCapitalize="none"
                    autoComplete="username"
                    autoCorrect="off"
                    spellCheck="false"
                  />
               </div>
            </div>

            <div className="space-y-1">
               <label className="text-xs text-neutral-400 ml-1">Contraseña</label>
               <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
                  <input 
                    type="password" 
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-black/50 border border-neutral-700 rounded-xl py-3 pl-11 pr-4 text-white placeholder-neutral-600 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                    placeholder="••••••••"
                    autoCapitalize="none"
                    autoComplete="current-password"
                    autoCorrect="off"
                    spellCheck="false"
                  />
               </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-red-400 bg-red-900/20 p-3 rounded-lg text-sm border border-red-900/50 animate-in slide-in-from-top-2">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
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
                   <span>{isRegistering ? 'Crear Cuenta' : 'Iniciar Sesión'}</span>
                   <ArrowRight size={16} />
                 </>
               )}
             </button>
          </form>

          <div className="mt-6 text-center">
            <button 
              onClick={() => {
                setIsRegistering(!isRegistering);
                setError(null);
                setUsername('');
                setPassword('');
              }}
              className="text-sm text-neutral-400 hover:text-white transition-colors underline decoration-neutral-700 underline-offset-4"
            >
              {isRegistering ? '¿Ya tienes cuenta? Inicia Sesión' : '¿No tienes cuenta? Regístrate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
