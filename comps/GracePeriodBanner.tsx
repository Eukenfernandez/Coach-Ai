import React, { useEffect, useState } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { db, auth, StorageService } from '../svcs/storageService';

export const GracePeriodBanner: React.FC = () => {
    const [enforcementState, setEnforcementState] = useState<any>(null);
    const [timeLeft, setTimeLeft] = useState<{ days: number, hours: number, min: number } | null>(null);

    useEffect(() => {
        if (!StorageService.isCloudMode() || !auth?.currentUser) return;

        const uid = auth.currentUser.uid;
        const loadEnforcementState = async () => {
            try {
                const snap = await db.collection('account_enforcement').doc(uid).get();
                if (snap.exists) {
                    const data = snap.data();
                    if (data?.status === 'OVER_LIMIT_GRACE_PERIOD') {
                        setEnforcementState(data);
                    } else {
                        setEnforcementState(null);
                    }
                } else {
                    setEnforcementState(null);
                }
            } catch {
                // If Firestore is offline, keep the last known state instead of spamming the console.
            }
        };

        void loadEnforcementState();
        const interval = window.setInterval(() => {
            void loadEnforcementState();
        }, 60000);

        return () => window.clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!enforcementState?.gracePeriodEndsAt) {
            setTimeLeft(null);
            return;
        }

        const calcTime = () => {
            // Firebase timestamp handling
            const targetMs = typeof enforcementState.gracePeriodEndsAt.toDate === 'function' ? 
                              enforcementState.gracePeriodEndsAt.toDate().getTime() : 
                              new Date(enforcementState.gracePeriodEndsAt).getTime();
            const now = Date.now();
            const diff = targetMs - now;

            if (diff <= 0) {
               setTimeLeft({ days: 0, hours: 0, min: 0 });
               return;
            }

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const min = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            setTimeLeft({ days, hours, min });
        };

        calcTime();
        const interval = setInterval(calcTime, 60000); // Check every minute
        return () => clearInterval(interval);
    }, [enforcementState]);

    if (!enforcementState || !timeLeft) return null;

    return (
        <div className="bg-red-600 border-b border-red-500 shadow-xl px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-0 duration-500 z-50 sticky top-0">
            <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-full hidden sm:block">
                   <AlertTriangle size={20} className="text-white" />
                </div>
                <div>
                   <h4 className="text-white font-black text-sm uppercase tracking-wide">
                      Ajuste pendiente por cambio de plan
                   </h4>
                   <p className="text-red-100 text-xs font-medium mt-0.5">
                      Tu plan permite {enforcementState.allowedVideoLimit} vídeos y {enforcementState.allowedPdfLimit ?? 0} PDFs. Tienes {enforcementState.currentVideoCount} vídeos y {enforcementState.currentPdfCount ?? 0} PDFs.
                   </p>
                </div>
            </div>
            
            <div className="flex items-center gap-3 bg-black/30 px-4 py-2 rounded-xl backdrop-blur shrink-0 w-full sm:w-auto justify-center">
                <Clock size={18} className="text-red-300 animate-pulse" />
                <span className="text-white font-mono font-bold tracking-widest text-sm">
                   {timeLeft.days}d {timeLeft.hours}h {timeLeft.min}m
                </span>
            </div>
        </div>
    );
};
