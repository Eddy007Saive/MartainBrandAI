import { useState, useEffect } from 'react';
import { useUser } from '../context/UserContext';
import { Eye, Heart, MessageCircle, Share2, TrendingUp, FileText, Loader2 } from 'lucide-react';
import api from '../lib/api';

export default function AccueilPage() {
  const { user } = useUser();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await api.get('/analytics/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Erreur chargement stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const kpis = stats ? [
    { label: 'Vues totales', value: stats.vues?.toLocaleString() || '0', icon: Eye, color: 'text-blue-400' },
    { label: 'Likes', value: stats.likes?.toLocaleString() || '0', icon: Heart, color: 'text-pink-400' },
    { label: 'Commentaires', value: stats.commentaires?.toLocaleString() || '0', icon: MessageCircle, color: 'text-green-400' },
    { label: "Taux d'engagement", value: `${stats.taux_engagement || 0}%`, icon: TrendingUp, color: 'text-purple-400' },
  ] : [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold font-sora text-white">
          Bonjour, {user?.nom || 'Utilisateur'} 👋
        </h1>
        <p className="text-slate-400 mt-2 font-inter">
          Voici un aperçu de vos performances
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#5B6CFF]" />
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map((kpi, index) => {
              const Icon = kpi.icon;
              return (
                <div
                  key={index}
                  className="bg-slate-900/40 border border-white/5 rounded-xl p-6 hover:border-[#5B6CFF]/30 transition-all duration-300"
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-slate-400 text-sm font-inter">{kpi.label}</span>
                    <Icon className={`w-5 h-5 ${kpi.color}`} />
                  </div>
                  <p className="text-3xl font-bold font-sora text-white">{kpi.value}</p>
                </div>
              );
            })}
          </div>

          {/* Status Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Contenus à valider */}
            <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-white font-semibold font-sora">Contenus à valider</p>
                  <p className="text-slate-400 text-sm font-inter">En attente de votre validation</p>
                </div>
              </div>
              <p className="text-4xl font-bold text-amber-400 font-sora">
                {stats?.contenus_stats?.['A valider'] || 0}
              </p>
            </div>

            {/* Nouveaux commentaires */}
            <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-white font-semibold font-sora">Nouveaux commentaires</p>
                  <p className="text-slate-400 text-sm font-inter">À traiter</p>
                </div>
              </div>
              <p className="text-4xl font-bold text-blue-400 font-sora">
                {stats?.nouveaux_commentaires || 0}
              </p>
            </div>

            {/* Posts performants */}
            <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-white font-semibold font-sora">Posts performants</p>
                  <p className="text-slate-400 text-sm font-inter">Au-dessus de la moyenne</p>
                </div>
              </div>
              <p className="text-4xl font-bold text-emerald-400 font-sora">
                {stats?.posts_performants || 0}
              </p>
            </div>
          </div>

          {/* Contenus par statut */}
          {stats?.contenus_stats && Object.keys(stats.contenus_stats).length > 0 && (
            <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white font-sora mb-4">Répartition des contenus</h2>
              <div className="flex flex-wrap gap-3">
                {Object.entries(stats.contenus_stats).map(([statut, count]) => (
                  <div key={statut} className="bg-slate-800/50 rounded-lg px-4 py-2 flex items-center gap-2">
                    <span className="text-slate-300 font-inter">{statut}</span>
                    <span className="bg-[#5B6CFF]/20 text-[#5B6CFF] px-2 py-0.5 rounded text-sm font-semibold">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
