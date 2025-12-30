
import React, { useState, useEffect } from 'react';
import { User, Language, CoachRequest } from '@/types';
import { StorageService } from '../services/storageService';
import { Bell, Check, X, Loader2, UserPlus } from 'lucide-react';

interface AthleteNotificationsProps {
  currentUser: User;
  language: Language;
  onUpdateProfile?: () => void; // Para refrescar datos si acepta
}

const TEXTS = {
  es: {
    title: 'Notificaciones',
    noRequests: 'No tienes solicitudes pendientes.',
    requestText: '{coach} quiere ser tu entrenador.',
    accept: 'Aceptar',
    decline: 'Rechazar',
    error: 'Error al procesar la solicitud.',
    coachAdded: '¡Entrenador añadido a tu equipo!'
  },
  ing: {
    title: 'Notifications',
    noRequests: 'No pending requests.',
    requestText: '{coach} wants to be your coach.',
    accept: 'Accept',
    decline: 'Decline',
    error: 'Error processing request.',
    coachAdded: 'Coach added to your team!'
  },
  eus: {
    title: 'Jakinarazpenak',
    noRequests: 'Ez duzu eskaerarik zain.',
    requestText: '{coach} zure entrenatzailea izan nahi du.',
    accept: 'Onartu',
    decline: 'Baztertu',
    error: 'Errorea eskaera prozesatzean.',
    coachAdded: 'Entrenatzailea zure taldera gehitu da!'
  }
};

export const AthleteNotifications: React.FC<AthleteNotificationsProps> = ({ currentUser, language, onUpdateProfile }) => {
  const t = TEXTS[language as keyof typeof TEXTS];
  const [requests, setRequests] = useState<CoachRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  useEffect(() => {
    loadRequests();
  }, [currentUser]);

  const loadRequests = async () => {
    try {
      // Usamos el email o el username como fallback
      // Usamos 'as any' para acceder a email aunque no esté en la interfaz User
      const emailToCheck = (currentUser as any).email || currentUser.username;      const list = await StorageService.getPendingRequests(emailToCheck);
      setRequests(list);
    } catch (error) {
      console.error("Error loading requests", error);
    } finally {
      setLoading(false);
    }
  };

  const handleResponse = async (request: CoachRequest, accept: boolean) => {
    setProcessingId(request.id);
    setMessage(null);

    try {
      await StorageService.respondToCoachRequest(request, accept, currentUser);
      
      // Eliminamos la solicitud de la lista local visualmente
      setRequests(prev => prev.filter(r => r.id !== request.id));
      
      if (accept) {
        setMessage({ type: 'success', text: t.coachAdded });
        // Si hay una función para recargar el perfil (para ver al nuevo coach), la llamamos
        if (onUpdateProfile) onUpdateProfile();
      }
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: t.error });
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin text-neutral-400" /></div>;

  // Si no hay solicitudes, mostramos un estado vacío discreto o nada
  if (requests.length === 0) {
    return (
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 text-center">
         <div className="w-12 h-12 bg-neutral-100 dark:bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-3">
            <Bell className="text-neutral-400" size={20} />
         </div>
         <p className="text-neutral-500 dark:text-neutral-400 text-sm">{t.noRequests}</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-sm">
      <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-4 flex items-center gap-2">
        <Bell className="text-orange-600 dark:text-orange-500" size={20} />
        {t.title} 
        <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full ml-2">{requests.length}</span>
      </h3>

      {message && (
        <div className={`mb-4 p-3 rounded-xl text-sm ${message.type === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700'}`}>
          {message.text}
        </div>
      )}

      <div className="space-y-3">
        {requests.map(req => (
          <div key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-gray-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl">
            
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/20 rounded-full flex items-center justify-center text-orange-600 dark:text-orange-500">
                <UserPlus size={20} />
              </div>
              <div>
                <p className="font-medium text-neutral-900 dark:text-white text-sm">
                  {t.requestText.replace('{coach}', req.coachName)}
                </p>
                <p className="text-xs text-neutral-500">
                  {new Date(req.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button 
                onClick={() => handleResponse(req, false)}
                disabled={processingId === req.id}
                className="flex-1 sm:flex-none py-2 px-3 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 rounded-lg text-sm hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50"
              >
                 {processingId === req.id ? <Loader2 className="animate-spin mx-auto" size={16}/> : <X size={18} className="mx-auto sm:mx-0"/>}
                 <span className="sm:hidden ml-2">{t.decline}</span>
              </button>

              <button 
                onClick={() => handleResponse(req, true)}
                disabled={processingId === req.id}
                className="flex-1 sm:flex-none py-2 px-4 bg-neutral-900 dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                 {processingId === req.id ? <Loader2 className="animate-spin" size={16}/> : <Check size={16} />}
                 <span>{t.accept}</span>
              </button>
            </div>

          </div>
        ))}
      </div>
    </div>
  );
};
