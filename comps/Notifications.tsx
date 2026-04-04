
import React, { useEffect, useState } from 'react';
import { CoachRequest, User } from '../types';
import { StorageService } from '../svcs/storageService';
import { Bell, Check, X, Shield } from 'lucide-react';

interface NotificationsProps {
  currentUser: User;
  onRefreshUser: () => void;
}

export const Notifications: React.FC<NotificationsProps> = ({ currentUser, onRefreshUser }) => {
  const [requests, setRequests] = useState<CoachRequest[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    loadRequests();
  }, [currentUser]);

  const loadRequests = async () => {
    const list = await StorageService.getPendingRequests(currentUser.username);
    setRequests(list);
  };

  const handleResponse = async (req: CoachRequest, accept: boolean) => {
    await StorageService.respondToCoachRequest(req, accept, currentUser);
    // Refresh local list
    setRequests(prev => prev.filter(r => r.id !== req.id));
    if (accept) {
       onRefreshUser(); // Trigger full user refresh to update permissions in app
    }
  };

  if (requests.length === 0) return null;

  return (
    <div className="relative z-50">
       <button 
          onClick={() => setIsOpen(!isOpen)}
          className="relative p-2 text-neutral-400 hover:text-white transition-colors"
       >
          <Bell size={20} />
          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-neutral-900"></span>
       </button>

       {isOpen && (
          <div className="absolute top-full right-0 mt-2 w-80 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
             <div className="p-3 border-b border-neutral-800 bg-neutral-950">
                <h4 className="text-sm font-bold text-white">Solicitudes Pendientes</h4>
             </div>
             <div className="max-h-64 overflow-y-auto">
                {requests.map(req => (
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
                ))}
             </div>
          </div>
       )}
    </div>
  );
};
