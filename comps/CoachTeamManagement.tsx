
import React, { useState, useEffect } from 'react';
import { User, Language } from '../types';
import { StorageService } from '../svcs/storageService';
import { Users, Mail, Plus, UserPlus, Trash2, Loader2, AlertTriangle } from 'lucide-react';

interface CoachTeamManagementProps {
   currentUser: User;
   onSelectAthlete: (athleteId: string) => void;
   activeAthleteId: string | null;
   language: Language;
   onAthleteRemoved?: (athleteId: string) => void;  // New callback to sync parent state
}

const TEXTS = {
   es: {
      title: 'Gestión del Equipo',
      subtitle: 'Administra a tus atletas y accede a sus perfiles para análisis.',
      myAthletes: 'Mis Atletas',
      empty: 'No tienes atletas vinculados aún.',
      active: 'Activo',
      linkNew: 'Vincular Nuevo Atleta',
      emailLabel: 'Correo electrónico del atleta',
      placeholder: 'atleta@email.com',
      send: 'Enviar Solicitud',
      note: 'El atleta recibirá una notificación en su aplicación para aceptar la vinculación.',
      removeConfirm: '¿Estás seguro de que quieres eliminar a {name} de tu equipo? Dejarás de tener acceso a sus datos.',
      deleteTitle: '¿Eliminar Atleta?',
      cancel: 'Cancelar',
      confirm: 'Sí, eliminar',
      success: 'Solicitud enviada correctamente.',
      error: 'Error al enviar solicitud.',
      removeError: 'Error al eliminar atleta: ',
      requests: 'Solicitudes Enviadas',
      statusPending: 'Pendiente',
      statusAccepted: 'Aceptada',
      statusRejected: 'Rechazada',
      noRequests: 'No hay solicitudes recientes.'
   },
   ing: {
      title: 'Team Management',
      subtitle: 'Manage your athletes and access their profiles for analysis.',
      myAthletes: 'My Athletes',
      empty: 'No athletes linked yet.',
      active: 'Active',
      linkNew: 'Link New Athlete',
      emailLabel: "Athlete's Email",
      placeholder: 'athlete@email.com',
      send: 'Send Request',
      note: 'The athlete will receive a notification in their app to accept the link.',
      removeConfirm: 'Are you sure you want to remove {name} from your team? You will lose access to their data.',
      deleteTitle: 'Remove Athlete?',
      cancel: 'Cancel',
      confirm: 'Yes, remove',
      success: 'Request sent successfully.',
      error: 'Error sending request.',
      removeError: 'Error removing athlete: ',
      requests: 'Sent Requests',
      statusPending: 'Pending',
      statusAccepted: 'Accepted',
      statusRejected: 'Rejected',
      noRequests: 'No recent requests.'
   },
   eus: {
      title: 'Talde Kudeaketa',
      subtitle: 'Kudeatu zure atletak eta sartu haien profiletara analisirako.',
      myAthletes: 'Nire Atletak',
      empty: 'Ez duzu atletarik lotuta oraindik.',
      active: 'Aktiboa',
      linkNew: 'Lotu Atleta Berria',
      emailLabel: 'Atletaren posta elektronikoa',
      placeholder: 'atleta@email.com',
      send: 'Eskaera Bidali',
      note: 'Atletak jakinarazpen bat jasoko du bere aplikazioan lotura onartzeko.',
      removeConfirm: 'Ziur zaude {name} zure taldetik kendu nahi duzula? Bere datuetara sarbidea galduko duzu.',
      deleteTitle: 'Atleta Ezabatu?',
      cancel: 'Utzi',
      confirm: 'Bai, ezabatu',
      success: 'Eskaera ondo bidali da.',
      error: 'Errorea eskaera bidaltzean.',
      removeError: 'Errorea atleta ezabatzean: ',
      requests: 'Bidalitako Eskaerak',
      statusPending: 'Zain',
      statusAccepted: 'Onartua',
      statusRejected: 'Ukatua',
      noRequests: 'Ez dago eskaera berririk.'
   }
};

export const CoachTeamManagement: React.FC<CoachTeamManagementProps> = ({ currentUser, onSelectAthlete, activeAthleteId, language, onAthleteRemoved }) => {
   const t = TEXTS[language] || TEXTS.es;
   const [athletes, setAthletes] = useState<User[]>([]);
   const [requests, setRequests] = useState<any[]>([]);
   const [emailToInvite, setEmailToInvite] = useState('');
   const [isInviting, setIsInviting] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [successMsg, setSuccessMsg] = useState<string | null>(null);

   // State for Delete Modal
   const [athleteToRemove, setAthleteToRemove] = useState<{ id: string, name: string } | null>(null);
   const [isRemoving, setIsRemoving] = useState(false);

   useEffect(() => {
      loadAthletes();
   }, [currentUser]);

   const loadAthletes = async () => {
      try {
         const { db } = await import('../svcs/storageService');
         if (db) {
            const freshCoachDoc = await db.collection("users").doc(currentUser.id).get();
            const freshProfile = freshCoachDoc.exists ? (freshCoachDoc.data() as any)?.profile : null;
            if (freshProfile?.managedAthletes && freshProfile.managedAthletes.length > 0) {
               const list = await StorageService.getManagedAthletes(freshProfile.managedAthletes);
               setAthletes(list);
            } else {
               setAthletes([]);
            }
         }
         
         // Fetch coach's outgoing requests
         const outgoingReqs = await StorageService.getCoachRequests(currentUser.id);
         setRequests(outgoingReqs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));

      } catch (e) {
         console.warn("Could not fetch fresh coach data or requests", e);
      }
   };

   const handleInvite = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!emailToInvite) return;
      setIsInviting(true);
      setError(null);
      setSuccessMsg(null);

      try {
         await StorageService.sendCoachRequest(currentUser, emailToInvite.trim());
         setSuccessMsg(t.success);
         setEmailToInvite('');
         // Refresh requests list
         loadAthletes();
      } catch (err: any) {
         setError(err.message || t.error);
      } finally {
         setIsInviting(false);
      }
   };

   const handleClickRemove = (e: React.MouseEvent, athleteId: string, athleteName: string) => {
      e.stopPropagation(); // Prevent card click (selection)
      setAthleteToRemove({ id: athleteId, name: athleteName });
   };

   const confirmRemove = async () => {
      if (!athleteToRemove) return;

      setIsRemoving(true);
      setError(null);

      try {
         await StorageService.removeAthleteFromCoach(currentUser.id, athleteToRemove.id);

         // Update local list
         setAthletes(prev => prev.filter(a => a.id !== athleteToRemove.id));

         // Notify parent to update its managedAthletes state (for sidebar sync)
         onAthleteRemoved?.(athleteToRemove.id);

         // If the removed athlete was active, deselect (go back to coach view)
         if (activeAthleteId === athleteToRemove.id) {
            onSelectAthlete(currentUser.id);
         }
         setAthleteToRemove(null);
      } catch (err: any) {
         setError(t.removeError + err.message);
         // Close modal even on error so user can see the error message in the form
         setAthleteToRemove(null);
      } finally {
         setIsRemoving(false);
      }
   };

   return (
      <div className="h-full bg-gray-50 dark:bg-neutral-950 p-4 md:p-10 overflow-y-auto transition-colors duration-300 relative">
         <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-2 flex items-center gap-3">
               <Users className="text-orange-600 dark:text-orange-500" />
               {t.title}
            </h1>
            <p className="text-neutral-500 dark:text-neutral-400 mb-8">{t.subtitle}</p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

               {/* List of Athletes */}
               <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-sm dark:shadow-none transition-colors">
                  <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-4">{t.myAthletes} ({athletes.length})</h3>
                  <div className="space-y-3">
                     {athletes.length === 0 ? (
                        <div className="text-center py-8 text-neutral-500 border border-dashed border-neutral-300 dark:border-neutral-800 rounded-xl">
                           {t.empty}
                        </div>
                     ) : (
                        athletes.map(athlete => (
                           <div
                              key={athlete.id}
                              onClick={() => onSelectAthlete(athlete.id)}
                              className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all group ${activeAthleteId === athlete.id
                                 ? 'bg-orange-50 dark:bg-orange-600/10 border-orange-500 ring-1 ring-orange-500'
                                 : 'bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600'
                                 }`}
                           >
                              <div className="flex items-center gap-3">
                                 <div className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-900 dark:text-white font-bold">
                                    {athlete.profile?.firstName.charAt(0)}
                                 </div>
                                 <div>
                                    <p className="font-bold text-neutral-900 dark:text-white text-sm">{athlete.profile?.firstName} {athlete.profile?.lastName}</p>
                                    <p className="text-xs text-neutral-500 capitalize">{athlete.profile?.discipline}</p>
                                 </div>
                              </div>

                              <div className="flex items-center gap-2">
                                 {activeAthleteId === athlete.id && (
                                    <span className="text-xs bg-orange-600 text-white px-2 py-1 rounded">{t.active}</span>
                                 )}
                                 <button
                                    onClick={(e) => handleClickRemove(e, athlete.id, athlete.profile?.firstName || 'Atleta')}
                                    className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                                    title="Eliminar del equipo"
                                 >
                                    <Trash2 size={16} />
                                 </button>
                              </div>
                           </div>
                        ))
                     )}
                  </div>
               </div>

               {/* Outgoing Requests Section */}
               <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-sm dark:shadow-none transition-colors mt-8 lg:mt-0">
                  <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-4">{t.requests}</h3>
                  <div className="space-y-3">
                     {requests.length === 0 ? (
                        <p className="text-sm text-neutral-500 italic py-4">{t.noRequests}</p>
                     ) : (
                        requests.map(req => (
                           <div key={req.id} className="p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-800 rounded-xl flex items-center justify-between text-xs">
                              <div className="flex flex-col">
                                 <span className="font-bold text-neutral-800 dark:text-white uppercase tracking-tighter">
                                    {req.athleteName || req.athleteEmail}
                                 </span>
                                 <span className="text-neutral-500 italic">
                                    {req.athleteDiscipline || t.statusPending}
                                 </span>
                              </div>
                              <div className="flex items-center gap-2">
                                 <span className={`px-2 py-0.5 rounded-full font-bold uppercase ${
                                    req.status === 'pending' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' :
                                    req.status === 'accepted' ? 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400' :
                                    'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                                 }`}>
                                    {req.status === 'pending' ? t.statusPending : 
                                     req.status === 'accepted' ? t.statusAccepted : t.statusRejected}
                                 </span>
                              </div>
                           </div>
                        ))
                     )}
                  </div>
               </div>

               {/* Invite Form */}
               <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 h-fit shadow-sm dark:shadow-none transition-colors">
                  <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-4 flex items-center gap-2">
                     <UserPlus size={20} className="text-orange-600 dark:text-orange-500" />
                     {t.linkNew}
                  </h3>
                  <form onSubmit={handleInvite} className="space-y-4">
                     <div>
                        <label className="text-xs text-neutral-500 ml-1">{t.emailLabel}</label>
                        <div className="relative mt-1">
                           <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
                           <input
                              type="email"
                              value={emailToInvite}
                              onChange={(e) => setEmailToInvite(e.target.value)}
                              className="w-full bg-gray-50 dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl py-3 pl-10 pr-4 text-neutral-900 dark:text-white focus:border-orange-500 focus:outline-none"
                              placeholder={t.placeholder}
                              required
                           />
                        </div>
                     </div>

                     {error && <p className="text-red-500 text-sm bg-red-100 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-900/30">{error}</p>}
                     {successMsg && <p className="text-green-600 dark:text-green-400 text-sm bg-green-100 dark:bg-green-900/20 p-3 rounded-lg border border-green-200 dark:border-green-900/30">{successMsg}</p>}

                     <button
                        type="submit"
                        disabled={isInviting}
                        className="w-full py-3 bg-neutral-900 dark:bg-white text-white dark:text-black font-bold rounded-xl hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                     >
                        {isInviting ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
                        {t.send}
                     </button>
                     <p className="text-xs text-neutral-500 mt-2 text-center">
                        {t.note}
                     </p>
                  </form>
               </div>

            </div>
         </div>

         {/* CUSTOM DELETE MODAL */}
         {athleteToRemove && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
               <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-6 rounded-3xl max-w-sm w-full shadow-2xl scale-100 animate-in zoom-in-95 duration-200 transition-colors">
                  <div className="flex flex-col items-center text-center">
                     <div className="w-16 h-16 bg-red-100 dark:bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                        <AlertTriangle size={32} className="text-red-600 dark:text-red-500" />
                     </div>
                     <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">{t.deleteTitle}</h3>
                     <p className="text-neutral-500 dark:text-neutral-400 text-sm mb-6">
                        {t.removeConfirm.replace('{name}', athleteToRemove.name)}
                     </p>
                     <div className="flex gap-3 w-full">
                        <button
                           onClick={() => setAthleteToRemove(null)}
                           disabled={isRemoving}
                           className="flex-1 py-3 px-4 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-900 dark:text-white font-medium rounded-xl transition-colors"
                        >
                           {t.cancel}
                        </button>
                        <button
                           onClick={confirmRemove}
                           disabled={isRemoving}
                           className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-500 text-white font-medium rounded-xl transition-colors flex justify-center items-center gap-2"
                        >
                           {isRemoving && <Loader2 className="animate-spin" size={16} />}
                           {t.confirm}
                        </button>
                     </div>
                  </div>
               </div>
            </div>
         )}
      </div>
   );
};
