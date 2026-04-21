import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CoachRequest, User } from '../types';
import { StorageService } from '../svcs/storageService';
import type { PendingRequestsResult } from '../svcs/storageService';
import { AlertTriangle, Bell, Check, Clock, Loader2, RefreshCw, Shield, X } from 'lucide-react';

interface NotificationsProps {
  currentUser: User;
  onRefreshUser: () => void;
}

type RequestSyncState = 'idle' | 'loading' | 'cache' | 'offline' | 'error';

export const Notifications: React.FC<NotificationsProps> = ({ currentUser, onRefreshUser }) => {
  const [requests, setRequests] = useState<CoachRequest[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [syncState, setSyncState] = useState<RequestSyncState>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const latestLoadIdRef = useRef(0);

  const requestIdentity = useMemo(
    () => (currentUser.email || currentUser.username || '').trim().toLowerCase(),
    [currentUser.email, currentUser.username]
  );

  const loadRequests = async (reason: string = 'mount') => {
    if (!requestIdentity) return;

    const loadId = ++latestLoadIdRef.current;
    setIsRefreshing(true);
    setSyncState((prev) => (prev === 'idle' ? 'loading' : prev));
    setStatusMessage(reason === 'manual-refresh' ? 'Actualizando solicitudes...' : 'Cargando solicitudes...');

    try {
      const result: PendingRequestsResult = await StorageService.getPendingRequests(requestIdentity);
      if (latestLoadIdRef.current !== loadId) return;

      setRequests(result.requests);

      if (result.error) {
        setSyncState(result.source === 'local' ? 'offline' : 'error');
        setStatusMessage(
          result.source === 'local'
            ? 'Sin conexión estable. Mostrando solicitudes guardadas.'
            : 'No se han podido actualizar las solicitudes.'
        );
        return;
      }

      if (result.source === 'cache' || result.source === 'local') {
        setSyncState(result.source === 'local' ? 'offline' : 'cache');
        setStatusMessage(
          result.source === 'local'
            ? 'Sin conexión. Mostrando solicitudes guardadas.'
            : 'Mostrando caché local mientras Firestore se recupera.'
        );
        return;
      }

      setSyncState('idle');
      setStatusMessage('');
    } catch (error) {
      if (latestLoadIdRef.current !== loadId) return;
      console.error('Error loading requests', error);
      setSyncState('error');
      setStatusMessage('Error al cargar solicitudes pendientes.');
    } finally {
      if (latestLoadIdRef.current === loadId) {
        setIsRefreshing(false);
      }
    }
  };

  useEffect(() => {
    if (!requestIdentity) return;
    void loadRequests('identity-change');
  }, [requestIdentity]);

  useEffect(() => {
    if (!requestIdentity) return;
    const handleOnline = () => {
      void loadRequests('online');
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [requestIdentity]);

  const handleResponse = async (req: CoachRequest, accept: boolean) => {
    await StorageService.respondToCoachRequest(req, accept, currentUser);
    setRequests((prev) => prev.filter((request) => request.id !== req.id));
    if (accept) {
      onRefreshUser();
    }
  };

  const statusUi = (() => {
    switch (syncState) {
      case 'loading':
        return {
          icon: Loader2,
          iconClassName: 'animate-spin',
          className: 'text-sky-300',
          message: statusMessage || 'Cargando solicitudes...',
        };
      case 'cache':
        return {
          icon: Clock,
          iconClassName: '',
          className: 'text-amber-300',
          message: statusMessage || 'Mostrando caché local.',
        };
      case 'offline':
        return {
          icon: Clock,
          iconClassName: '',
          className: 'text-amber-300',
          message: statusMessage || 'Sin conexión. Mostrando solicitudes guardadas.',
        };
      case 'error':
        return {
          icon: AlertTriangle,
          iconClassName: '',
          className: 'text-red-300',
          message: statusMessage || 'No se han podido cargar las solicitudes.',
        };
      default:
        return null;
    }
  })();

  const shouldHide = requests.length === 0 && syncState === 'idle' && !isRefreshing;
  if (shouldHide) return null;

  return (
    <div className="relative z-50">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative p-2 text-neutral-400 hover:text-white transition-colors"
        aria-label="Notificaciones"
      >
        <Bell size={20} />
        {(requests.length > 0 || syncState === 'error') && (
          <span className={`absolute top-1 right-1 w-2.5 h-2.5 rounded-full border-2 border-neutral-900 ${syncState === 'error' ? 'bg-red-500' : 'bg-orange-500'}`}></span>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="p-3 border-b border-neutral-800 bg-neutral-950">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-bold text-white">Solicitudes Pendientes</h4>
              <button
                type="button"
                onClick={() => void loadRequests('manual-refresh')}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
                aria-label="Actualizar solicitudes"
              >
                <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              </button>
            </div>
            {statusUi && (
              <div className={`mt-2 flex items-center gap-2 text-[11px] ${statusUi.className}`}>
                <statusUi.icon size={12} className={statusUi.iconClassName} />
                <span>{statusUi.message}</span>
              </div>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto">
            {requests.length === 0 ? (
              <div className="p-4 text-sm text-neutral-400">
                {syncState === 'loading' ? 'Buscando solicitudes...' : 'No tienes solicitudes pendientes.'}
              </div>
            ) : (
              requests.map((req) => (
                <div key={req.id} className="p-4 border-b border-neutral-800 last:border-0 hover:bg-neutral-800/50 transition-colors">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="p-2 bg-orange-900/20 rounded-full text-orange-500">
                      <Shield size={16} />
                    </div>
                    <div>
                      <p className="text-sm text-white font-medium">{req.coachName}</p>
                      <p className="text-xs text-neutral-500">quiere ser tu entrenador.</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleResponse(req, true)}
                      className="flex-1 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1"
                    >
                      <Check size={14} /> Aceptar
                    </button>
                    <button
                      onClick={() => handleResponse(req, false)}
                      className="flex-1 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1"
                    >
                      <X size={14} /> Rechazar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
