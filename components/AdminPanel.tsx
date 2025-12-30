
import React, { useState, useEffect } from 'react';
import { StorageService, VideoStorage } from '../services/storageService';
import { User, UserData, StrengthRecord, ThrowRecord, VideoFile } from '../types';
import { Shield, Users, Database, LogOut, Search, Trash2, Video, Dumbbell, FileText, ChevronLeft, MapPin, Calendar, Trophy, Target, Play, X } from 'lucide-react';

interface AdminPanelProps {
  onLogout: () => void;
}

interface UserReport {
  user: User;
  stats: {
    videos: number;
    plans: number;
    strengthRecords: number;
    competitionRecords: number;
    trainingRecords: number;
  };
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onLogout }) => {
  const [users, setUsers] = useState<UserReport[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // State for Detail View
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedUserData, setSelectedUserData] = useState<UserData | null>(null);

  // State for Video Player Modal
  const [playingVideo, setPlayingVideo] = useState<VideoFile | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const report = await StorageService.getSystemReport();
    setUsers(report);
  };

  const handleUserClick = async (user: User) => {
    const data = await StorageService.getUserData(user.id);

    // Hydrate Videos from IndexedDB so they can be played
    // Admin hydration logic assumes local access unless cloud is active, but admin usually runs in a special context.
    // For now we try to hydrate from local VideoStorage just in case admin is on the same device.
    if (data.videos && data.videos.length > 0) {
        const hydratedVideos = await Promise.all(data.videos.map(async (v) => {
            try {
                const blob = await VideoStorage.getVideo(v.id);
                if (blob) {
                    return { ...v, url: URL.createObjectURL(blob), isLocal: true };
                }
            } catch (e) {
                console.error("Could not hydrate video for admin", v.id, e);
            }
            return v;
        }));
        data.videos = hydratedVideos;
    }

    setSelectedUser(user);
    setSelectedUserData(data);
  };

  const handleBackToList = () => {
    setSelectedUser(null);
    setSelectedUserData(null);
  };

  const handleDeleteUser = async (e: React.MouseEvent, id: string, username: string) => {
    e.stopPropagation();
    if (confirm(`¿Estás SEGURO de que quieres eliminar al usuario "${username}" y TODOS sus datos? Esta acción es irreversible.`)) {
      await StorageService.deleteUser(id);
      if (selectedUser?.id === id) {
        handleBackToList();
      }
      loadData();
    }
  };

  const filteredUsers = users.filter(u => 
    u.user.username.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (u.user.profile?.firstName + ' ' + u.user.profile?.lastName).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalVideos = users.reduce((acc, curr) => acc + curr.stats.videos, 0);
  const totalRecords = users.reduce((acc, curr) => acc + curr.stats.strengthRecords + curr.stats.competitionRecords + curr.stats.trainingRecords, 0);

  // --- RENDER: DETAIL VIEW ---
  if (selectedUser && selectedUserData) {
     return (
        <div className="h-screen overflow-y-auto bg-black text-white font-sans pb-20 relative">
           {/* Detail Navbar */}
           <div className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-xl sticky top-0 z-50">
              <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                 <div className="flex items-center gap-4">
                    <button 
                       onClick={handleBackToList}
                       className="p-2 hover:bg-neutral-800 rounded-full text-neutral-400 hover:text-white transition-colors"
                    >
                       <ChevronLeft size={24} />
                    </button>
                    <div>
                       <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                          {selectedUser.profile?.firstName} {selectedUser.profile?.lastName}
                          <span className="text-xs bg-orange-600 px-2 py-0.5 rounded text-white font-mono">
                             {selectedUser.profile?.role}
                          </span>
                       </h1>
                       <p className="text-xs text-neutral-500 font-mono">ID: {selectedUser.id}</p>
                    </div>
                 </div>
                 <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                        <p className="text-xs text-neutral-400 uppercase">Credenciales</p>
                        <p className="text-sm font-mono text-white">
                           {selectedUser.username} <span className="text-neutral-600">|</span> {selectedUser.password || 'OAuth'}
                        </p>
                    </div>
                    {selectedUser.username !== 'admin@coachai.com' && (
                       <button 
                          onClick={(e) => handleDeleteUser(e, selectedUser.id, selectedUser.username)}
                          className="p-2 bg-red-900/20 text-red-500 rounded-lg hover:bg-red-900/40 transition-colors"
                          title="Eliminar Usuario"
                       >
                          <Trash2 size={20} />
                       </button>
                    )}
                 </div>
              </div>
           </div>

           <div className="max-w-7xl mx-auto px-6 py-8 space-y-10">
              
              {/* 1. Profile Summary */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                 <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800">
                    <p className="text-neutral-500 text-xs uppercase mb-1">Deporte</p>
                    <p className="text-xl font-bold text-orange-500 capitalize">{selectedUser.profile?.sport || 'N/A'}</p>
                 </div>
                 <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800">
                    <p className="text-neutral-500 text-xs uppercase mb-1">Disciplina</p>
                    <p className="text-xl font-bold text-white">{selectedUser.profile?.discipline || 'N/A'}</p>
                 </div>
                 <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800">
                    <p className="text-neutral-500 text-xs uppercase mb-1">Edad</p>
                    <p className="text-xl font-bold text-white">{selectedUser.profile?.age} años</p>
                 </div>
                 <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800">
                    <p className="text-neutral-500 text-xs uppercase mb-1">Total Datos</p>
                    <p className="text-xl font-bold text-white">
                       {selectedUserData.videos.length + selectedUserData.strengthRecords.length + selectedUserData.competitionRecords.length}
                    </p>
                 </div>
              </div>

              {/* 2. VIDEOS SECTION */}
              <div>
                 <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <Video className="text-blue-500" />
                    Videos Subidos ({selectedUserData.videos.length})
                 </h2>
                 {selectedUserData.videos.length === 0 ? (
                    <div className="p-8 border border-dashed border-neutral-800 rounded-2xl text-center text-neutral-500">
                       El usuario no ha subido vídeos.
                    </div>
                 ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                       {selectedUserData.videos.map(video => (
                          <div 
                             key={video.id} 
                             onClick={() => setPlayingVideo(video)}
                             className="bg-neutral-900 rounded-xl overflow-hidden border border-neutral-800 group cursor-pointer hover:border-orange-500 transition-colors"
                          >
                             <div className="aspect-video relative bg-black">
                                <img src={video.thumbnail} alt={video.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-60 transition-opacity" />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/20 transition-opacity">
                                   <div className="w-12 h-12 bg-orange-600 rounded-full flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                                      <Play className="text-white fill-white ml-1" size={20} />
                                   </div>
                                </div>
                                <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 rounded font-mono">
                                   {video.duration}
                                </div>
                             </div>
                             <div className="p-3">
                                <p className="text-sm font-medium text-white truncate group-hover:text-orange-400 transition-colors">{video.name}</p>
                                <p className="text-xs text-neutral-500 mt-1">{video.date}</p>
                                {video.isLocal && <p className="text-[10px] text-yellow-500 mt-1">*Local Storage</p>}
                             </div>
                          </div>
                       ))}
                    </div>
                 )}
              </div>

              {/* 3. RECORDS SECTION (Two Columns) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                 
                 {/* Competition Records */}
                 <div>
                    <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                       <Trophy className="text-orange-500" />
                       Competiciones ({selectedUserData.competitionRecords.length})
                    </h2>
                    <div className="bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden max-h-80 overflow-y-auto">
                       <table className="w-full text-left text-sm">
                          <thead className="bg-neutral-950 text-neutral-500 text-xs uppercase sticky top-0">
                             <tr>
                                <th className="p-3">Fecha</th>
                                <th className="p-3">Lugar</th>
                                <th className="p-3 text-right">Marca</th>
                             </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-800">
                             {selectedUserData.competitionRecords.length === 0 && (
                                <tr><td colSpan={3} className="p-4 text-center text-neutral-500">Sin datos.</td></tr>
                             )}
                             {selectedUserData.competitionRecords.map(rec => (
                                <tr key={rec.id} className="hover:bg-neutral-800/50">
                                   <td className="p-3 text-neutral-400">{rec.date}</td>
                                   <td className="p-3 text-white">{rec.location}</td>
                                   <td className="p-3 text-right font-bold text-orange-400">{rec.distance}</td>
                                </tr>
                             ))}
                          </tbody>
                       </table>
                    </div>
                 </div>

                 {/* Strength Records */}
                 <div>
                    <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                       <Dumbbell className="text-purple-500" />
                       Fuerza ({selectedUserData.strengthRecords.length})
                    </h2>
                    <div className="bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden max-h-80 overflow-y-auto">
                       <table className="w-full text-left text-sm">
                          <thead className="bg-neutral-950 text-neutral-500 text-xs uppercase sticky top-0">
                             <tr>
                                <th className="p-3">Fecha</th>
                                <th className="p-3">Ejercicio</th>
                                <th className="p-3 text-right">Peso</th>
                             </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-800">
                             {selectedUserData.strengthRecords.length === 0 && (
                                <tr><td colSpan={3} className="p-4 text-center text-neutral-500">Sin datos.</td></tr>
                             )}
                             {selectedUserData.strengthRecords.map(rec => (
                                <tr key={rec.id} className="hover:bg-neutral-800/50">
                                   <td className="p-3 text-neutral-400">{rec.date}</td>
                                   <td className="p-3 text-white">{rec.exercise}</td>
                                   <td className="p-3 text-right font-bold text-purple-400">{rec.weight}</td>
                                </tr>
                             ))}
                          </tbody>
                       </table>
                    </div>
                 </div>

                 {/* Training Records */}
                 <div className="lg:col-span-2">
                    <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                       <Target className="text-emerald-500" />
                       Entrenamientos ({selectedUserData.trainingRecords.length})
                    </h2>
                    <div className="bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden max-h-80 overflow-y-auto">
                       <table className="w-full text-left text-sm">
                          <thead className="bg-neutral-950 text-neutral-500 text-xs uppercase sticky top-0">
                             <tr>
                                <th className="p-3">Fecha</th>
                                <th className="p-3">Notas/Ubicación</th>
                                <th className="p-3 text-right">Resultado</th>
                             </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-800">
                             {selectedUserData.trainingRecords.length === 0 && (
                                <tr><td colSpan={3} className="p-4 text-center text-neutral-500">Sin datos.</td></tr>
                             )}
                             {selectedUserData.trainingRecords.map(rec => (
                                <tr key={rec.id} className="hover:bg-neutral-800/50">
                                   <td className="p-3 text-neutral-400">{rec.date}</td>
                                   <td className="p-3 text-white">{rec.location}</td>
                                   <td className="p-3 text-right font-bold text-emerald-400">{rec.distance}</td>
                                </tr>
                             ))}
                          </tbody>
                       </table>
                    </div>
                 </div>

              </div>

           </div>

           {/* --- VIDEO PLAYER MODAL --- */}
           {playingVideo && (
              <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                 <button 
                    onClick={() => setPlayingVideo(null)}
                    className="absolute top-4 right-4 p-3 text-white/50 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all z-50 group"
                 >
                    <X size={28} className="group-hover:scale-110 transition-transform" />
                 </button>
                 
                 <div className="w-full max-w-6xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 relative">
                    <video 
                       src={playingVideo.url} 
                       controls 
                       autoPlay 
                       className="w-full h-full object-contain"
                    />
                    <div className="absolute bottom-6 left-6 bg-black/70 backdrop-blur-md px-4 py-2 rounded-lg text-white border border-white/10">
                       <p className="font-bold text-sm">{playingVideo.name}</p>
                       <p className="text-xs text-neutral-400">{playingVideo.date}</p>
                    </div>
                 </div>
              </div>
           )}

        </div>
     );
  }

  // --- RENDER: LIST VIEW (Default) ---
  return (
    <div className="h-screen overflow-y-auto bg-black text-white font-sans">
      {/* Navbar */}
      <div className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(220,38,38,0.5)]">
                <Shield size={20} className="text-white" />
             </div>
             <div>
               <h1 className="text-xl font-bold tracking-tight">Panel Maestro</h1>
               <p className="text-xs text-red-500 font-mono">ACCESO RESTRINGIDO: NIVEL 1</p>
             </div>
          </div>
          <button 
            onClick={onLogout}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm text-neutral-300 transition-colors"
          >
            <LogOut size={16} />
            Salir
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-10">
        
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
           <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                 <Users size={64} />
              </div>
              <p className="text-neutral-500 text-sm font-medium">Usuarios Totales</p>
              <p className="text-4xl font-bold text-white mt-1">{users.length}</p>
           </div>
           
           <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                 <Dumbbell size={64} />
              </div>
              <p className="text-neutral-500 text-sm font-medium">Registros de Datos</p>
              <p className="text-4xl font-bold text-white mt-1">{totalRecords}</p>
           </div>

           <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                 <Database size={64} />
              </div>
              <p className="text-neutral-500 text-sm font-medium">Videos Almacenados</p>
              <p className="text-4xl font-bold text-white mt-1">{totalVideos}</p>
           </div>
        </div>

        {/* Search Bar */}
        <div className="mb-6 relative">
           <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={20} />
           <input 
              type="text" 
              placeholder="Buscar por usuario o nombre..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl py-4 pl-12 pr-4 text-white focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 transition-all"
           />
        </div>

        {/* Database Table */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl">
           <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                 <thead>
                    <tr className="bg-neutral-950 border-b border-neutral-800 text-xs uppercase text-neutral-500">
                       <th className="p-4 font-semibold">ID / Credenciales</th>
                       <th className="p-4 font-semibold">Perfil</th>
                       <th className="p-4 font-semibold">Deporte</th>
                       <th className="p-4 font-semibold text-center">Datos</th>
                       <th className="p-4 font-semibold text-right">Acciones</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-neutral-800">
                    {filteredUsers.length === 0 ? (
                       <tr>
                          <td colSpan={5} className="p-8 text-center text-neutral-500">No se encontraron usuarios.</td>
                       </tr>
                    ) : filteredUsers.map((item) => (
                       <tr 
                         key={item.user.id} 
                         onClick={() => handleUserClick(item.user)}
                         className="hover:bg-neutral-800/50 transition-colors cursor-pointer group"
                       >
                          <td className="p-4">
                             <div className="flex flex-col">
                                <span className="font-mono text-xs text-neutral-600 mb-1">{item.user.id.substring(0,8)}...</span>
                                <span className="font-bold text-white text-sm group-hover:text-blue-400 transition-colors">{item.user.username}</span>
                                <span className="text-xs text-neutral-500">{item.user.password ? `Pass: ***` : 'OAuth User'}</span>
                             </div>
                          </td>
                          <td className="p-4">
                             {item.user.profile ? (
                                <div className="flex flex-col">
                                   <span className="text-neutral-200 text-sm font-medium">{item.user.profile.firstName} {item.user.profile.lastName}</span>
                                   <span className="text-xs text-neutral-500">{item.user.profile.age} años • {item.user.profile.role}</span>
                                </div>
                             ) : (
                                <span className="px-2 py-1 bg-yellow-500/10 text-yellow-500 text-xs rounded border border-yellow-500/20">Incompleto</span>
                             )}
                          </td>
                          <td className="p-4">
                             {item.user.profile ? (
                                <div className="flex flex-col">
                                   <span className="text-orange-400 text-xs uppercase font-bold">{item.user.profile.sport}</span>
                                   <span className="text-neutral-400 text-xs">{item.user.profile.discipline}</span>
                                </div>
                             ) : (
                                <span className="text-neutral-600">-</span>
                             )}
                          </td>
                          <td className="p-4">
                             <div className="flex items-center justify-center gap-4 text-xs">
                                <div className="flex items-center gap-1 text-blue-400" title="Videos">
                                   <Video size={14} /> {item.stats.videos}
                                </div>
                                <div className="flex items-center gap-1 text-purple-400" title="Registros">
                                   <Dumbbell size={14} /> {item.stats.strengthRecords + item.stats.competitionRecords + item.stats.trainingRecords}
                                </div>
                                <div className="flex items-center gap-1 text-green-400" title="Planes">
                                   <FileText size={14} /> {item.stats.plans}
                                </div>
                             </div>
                          </td>
                          <td className="p-4 text-right">
                             {item.user.username !== 'admin@coachai.com' && (
                                <button 
                                   onClick={(e) => handleDeleteUser(e, item.user.id, item.user.username)}
                                   className="p-2 text-neutral-600 hover:text-red-500 hover:bg-red-900/20 rounded-lg transition-all"
                                   title="Borrar Usuario"
                                >
                                   <Trash2 size={18} />
                                </button>
                             )}
                          </td>
                       </tr>
                    ))}
                 </tbody>
              </table>
           </div>
        </div>
      </div>
    </div>
  );
};
