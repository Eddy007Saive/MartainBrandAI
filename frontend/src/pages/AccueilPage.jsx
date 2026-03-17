import { useUser } from '../context/UserContext';

export default function AccueilPage() {
  const { user } = useUser();

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-sora text-white">
          Bonjour, {user?.nom || 'Utilisateur'} 👋
        </h1>
        <p className="text-slate-400 mt-1 font-inter">
          Voici un aperçu de vos performances
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Placeholder KPI cards */}
        {['Vues totales', 'Likes', 'Commentaires', 'Taux d\'engagement'].map((label) => (
          <div
            key={label}
            className="bg-slate-900/50 border border-white/5 rounded-xl p-6"
            data-testid={`kpi-${label.toLowerCase().replace(/['\s]/g, '-')}`}
          >
            <p className="text-sm text-slate-400 font-inter">{label}</p>
            <p className="text-2xl font-bold text-white mt-2 font-sora">—</p>
          </div>
        ))}
      </div>

      <div className="bg-slate-900/50 border border-white/5 rounded-xl p-6">
        <p className="text-slate-400 font-inter text-center py-12">
          Les statistiques seront disponibles prochainement.
        </p>
      </div>
    </div>
  );
}
