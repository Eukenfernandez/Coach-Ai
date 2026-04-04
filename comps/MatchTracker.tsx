
import React, { useState } from 'react';
import { MatchRecord, UserProfile, Language } from '../types';
import { Trophy, Trash2, Calendar, Users, Target, TrendingUp, Minus, ChevronUp, ChevronDown } from 'lucide-react';

interface MatchTrackerProps {
    profile: UserProfile;
    records: MatchRecord[];
    onAddRecord: (record: Omit<MatchRecord, 'id'>) => void;
    onDeleteRecord: (id: string) => void;
    language: Language;
}

const TEXTS = {
    es: {
        title: 'Partidos',
        stats: 'Estadísticas',
        played: 'Jugados',
        wins: 'Victorias',
        draws: 'Empates',
        losses: 'Derrotas',
        register: 'Registrar Partido',
        opponent: 'Rival',
        goalsFor: 'Goles/Puntos a Favor',
        goalsAgainst: 'Goles/Puntos en Contra',
        competition: 'Competición (opcional)',
        date: 'Fecha',
        save: 'Guardar Partido',
        history: 'Historial de Partidos',
        empty: 'No hay partidos registrados.',
        win: 'Victoria',
        draw: 'Empate',
        loss: 'Derrota',
        vs: 'vs'
    },
    ing: {
        title: 'Matches',
        stats: 'Statistics',
        played: 'Played',
        wins: 'Wins',
        draws: 'Draws',
        losses: 'Losses',
        register: 'Register Match',
        opponent: 'Opponent',
        goalsFor: 'Goals/Points For',
        goalsAgainst: 'Goals/Points Against',
        competition: 'Competition (optional)',
        date: 'Date',
        save: 'Save Match',
        history: 'Match History',
        empty: 'No matches registered.',
        win: 'Win',
        draw: 'Draw',
        loss: 'Loss',
        vs: 'vs'
    },
    eus: {
        title: 'Partiduak',
        stats: 'Estatistikak',
        played: 'Jokatuak',
        wins: 'Irabaziak',
        draws: 'Berdinketak',
        losses: 'Galdutakoak',
        register: 'Erregistratu Partida',
        opponent: 'Aurkariak',
        goalsFor: 'Golak/Puntuak Alde',
        goalsAgainst: 'Golak/Puntuak Kontra',
        competition: 'Lehiaketa (aukerakoa)',
        date: 'Data',
        save: 'Gorde Partida',
        history: 'Partiden Historia',
        empty: 'Ez dago partidurik erregistratuta.',
        win: 'Irabazi',
        draw: 'Berdinketa',
        loss: 'Galdu',
        vs: 'vs'
    }
};

export const MatchTracker: React.FC<MatchTrackerProps> = ({ profile, records, onAddRecord, onDeleteRecord, language }) => {
    const t = TEXTS[language] || TEXTS.es;
    const [opponent, setOpponent] = useState('');
    const [goalsFor, setGoalsFor] = useState('');
    const [goalsAgainst, setGoalsAgainst] = useState('');
    const [competition, setCompetition] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!opponent || goalsFor === '' || goalsAgainst === '' || !date) return;

        const gf = parseInt(goalsFor);
        const ga = parseInt(goalsAgainst);
        let result: 'win' | 'draw' | 'loss';

        if (gf > ga) result = 'win';
        else if (gf < ga) result = 'loss';
        else result = 'draw';

        onAddRecord({
            opponent,
            goalsFor: gf,
            goalsAgainst: ga,
            result,
            competition: competition || undefined,
            date
        });

        setOpponent('');
        setGoalsFor('');
        setGoalsAgainst('');
        setCompetition('');
    };

    // Stats calculation
    const totalPlayed = records.length;
    const wins = records.filter(r => r.result === 'win').length;
    const draws = records.filter(r => r.result === 'draw').length;
    const losses = records.filter(r => r.result === 'loss').length;

    const getResultColor = (result: 'win' | 'draw' | 'loss') => {
        switch (result) {
            case 'win': return 'bg-green-500/20 text-green-500 border-green-500/30';
            case 'draw': return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30';
            case 'loss': return 'bg-red-500/20 text-red-500 border-red-500/30';
        }
    };

    const getResultLabel = (result: 'win' | 'draw' | 'loss') => {
        switch (result) {
            case 'win': return t.win;
            case 'draw': return t.draw;
            case 'loss': return t.loss;
        }
    };

    const getResultIcon = (result: 'win' | 'draw' | 'loss') => {
        switch (result) {
            case 'win': return <ChevronUp size={14} />;
            case 'draw': return <Minus size={14} />;
            case 'loss': return <ChevronDown size={14} />;
        }
    };

    return (
        <div className="h-full bg-gray-50 dark:bg-neutral-950 p-4 md:p-10 overflow-y-auto transition-colors duration-300">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-xl md:text-3xl font-bold text-neutral-900 dark:text-white mb-1">{t.title}</h1>
                    <p className="text-sm md:text-base text-neutral-500 dark:text-neutral-400">{profile.discipline}</p>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8">
                    <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 text-center">
                        <span className="block text-[10px] md:text-xs text-neutral-500 uppercase tracking-wider mb-1">{t.played}</span>
                        <span className="text-2xl md:text-3xl font-bold text-neutral-900 dark:text-white">{totalPlayed}</span>
                    </div>
                    <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-green-500/20 text-center">
                        <span className="block text-[10px] md:text-xs text-green-500 uppercase tracking-wider mb-1">{t.wins}</span>
                        <span className="text-2xl md:text-3xl font-bold text-green-500">{wins}</span>
                    </div>
                    <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-yellow-500/20 text-center">
                        <span className="block text-[10px] md:text-xs text-yellow-500 uppercase tracking-wider mb-1">{t.draws}</span>
                        <span className="text-2xl md:text-3xl font-bold text-yellow-500">{draws}</span>
                    </div>
                    <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-red-500/20 text-center">
                        <span className="block text-[10px] md:text-xs text-red-500 uppercase tracking-wider mb-1">{t.losses}</span>
                        <span className="text-2xl md:text-3xl font-bold text-red-500">{losses}</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
                    {/* Add Form */}
                    <div className="bg-white dark:bg-neutral-900 p-4 md:p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 h-fit shadow-sm">
                        <h3 className="text-neutral-900 dark:text-white font-semibold mb-4 text-sm md:text-base flex items-center gap-2">
                            <Trophy size={16} className="text-orange-500" />
                            {t.register}
                        </h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">{t.opponent}</label>
                                <input
                                    type="text"
                                    value={opponent}
                                    onChange={(e) => setOpponent(e.target.value)}
                                    className="w-full bg-gray-50 dark:bg-neutral-800 text-neutral-900 dark:text-white p-3 rounded-lg border border-neutral-300 dark:border-neutral-700 focus:border-orange-500 focus:outline-none"
                                    placeholder="Ej. Real Madrid"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">{t.goalsFor}</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={goalsFor}
                                        onChange={(e) => setGoalsFor(e.target.value)}
                                        className="w-full bg-gray-50 dark:bg-neutral-800 text-neutral-900 dark:text-white p-3 rounded-lg border border-neutral-300 dark:border-neutral-700 focus:border-orange-500 focus:outline-none text-center text-lg font-bold"
                                        placeholder="0"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">{t.goalsAgainst}</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={goalsAgainst}
                                        onChange={(e) => setGoalsAgainst(e.target.value)}
                                        className="w-full bg-gray-50 dark:bg-neutral-800 text-neutral-900 dark:text-white p-3 rounded-lg border border-neutral-300 dark:border-neutral-700 focus:border-orange-500 focus:outline-none text-center text-lg font-bold"
                                        placeholder="0"
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">{t.competition}</label>
                                <input
                                    type="text"
                                    value={competition}
                                    onChange={(e) => setCompetition(e.target.value)}
                                    className="w-full bg-gray-50 dark:bg-neutral-800 text-neutral-900 dark:text-white p-3 rounded-lg border border-neutral-300 dark:border-neutral-700 focus:border-orange-500 focus:outline-none"
                                    placeholder="Ej. Liga, Copa, Amistoso"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">{t.date}</label>
                                <input
                                    type="date"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    className="w-full bg-gray-50 dark:bg-neutral-800 text-neutral-900 dark:text-white p-3 rounded-lg border border-neutral-300 dark:border-neutral-700 focus:border-orange-500 focus:outline-none"
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 rounded-lg transition-colors mt-2"
                            >
                                {t.save}
                            </button>
                        </form>
                    </div>

                    {/* Match List */}
                    <div className="lg:col-span-2 space-y-3">
                        <h3 className="text-neutral-900 dark:text-white font-semibold mb-3 md:mb-4 text-sm md:text-base flex items-center gap-2">
                            <Calendar size={16} className="text-orange-500" />
                            {t.history}
                        </h3>
                        {records.length === 0 && <p className="text-neutral-500 text-sm">{t.empty}</p>}
                        {[...records].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(record => (
                            <div key={record.id} className="flex items-center justify-between bg-white dark:bg-neutral-900 p-3 md:p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 hover:border-orange-500/30 transition-colors shadow-sm">
                                <div className="flex items-center gap-3 md:gap-4 flex-1">
                                    {/* Result Badge */}
                                    <div className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center font-bold shrink-0 border ${getResultColor(record.result)}`}>
                                        {getResultIcon(record.result)}
                                    </div>

                                    {/* Match Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-bold text-neutral-900 dark:text-white text-sm md:text-base">
                                                {record.goalsFor} - {record.goalsAgainst}
                                            </span>
                                            <span className="text-neutral-400 text-xs">{t.vs}</span>
                                            <span className="font-medium text-neutral-700 dark:text-neutral-300 text-sm md:text-base truncate">
                                                {record.opponent}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-1 text-xs text-neutral-500">
                                            <span>{record.date}</span>
                                            {record.competition && (
                                                <>
                                                    <span>•</span>
                                                    <span className="truncate max-w-[150px]">{record.competition}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* Result Label */}
                                    <div className={`hidden md:flex px-3 py-1 rounded-full text-xs font-bold border ${getResultColor(record.result)}`}>
                                        {getResultLabel(record.result)}
                                    </div>
                                </div>

                                <button onClick={() => onDeleteRecord(record.id)} className="text-neutral-400 hover:text-red-500 p-2 ml-2">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
