import { useState, useEffect } from 'react';
import { Loader2, Sparkles, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { agentService } from '../services/agentService';
import { billingService } from '../services/billingService';

// Ordre d'affichage + on ne propose le rachat QUE sur les postes chers (image HD + carrousels)
const ORDER = ['post', 'image_standard', 'image_pro', 'carousel', 'subject'];
const RACHAT = new Set(['image_pro', 'carousel']);

function joursRestants(end) {
  if (!end) return null;
  const d = Math.ceil((new Date(end) - new Date()) / 86400000);
  return d > 0 ? d : 0;
}

function Bar({ g, onRachat }) {
  const pct = g.limit > 0 ? Math.min(100, Math.round((g.used / g.limit) * 100)) : 0;
  const presqueFini = pct >= 80;
  const fini = g.used >= g.limit;
  const couleur = fini ? 'from-red-500 to-red-400'
    : presqueFini ? 'from-amber-500 to-amber-400'
    : 'from-[#5B6CFF] to-[#8A6CFF]';
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[13px] text-slate-300 font-inter capitalize">{g.label}</span>
        <span className="text-[12px] text-slate-400 font-inter tabular-nums">{g.used} / {g.limit}</span>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r ${couleur} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      {presqueFini && RACHAT.has(g.action_type) && (
        <button onClick={() => onRachat(g)}
          className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-[#3AFFA3] hover:underline">
          <Plus className="w-3 h-3" />
          {fini ? `Tu as fini tes ${g.label} — ajoute un pack` : `Bientôt à court — ajoute un pack`}
        </button>
      )}
    </div>
  );
}

export default function QuotaGauge() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rachat, setRachat] = useState(null); // { label, packs, loading }
  const [buying, setBuying] = useState(null);

  useEffect(() => {
    agentService.usage().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const openRachat = async (g) => {
    setRachat({ label: g.label, packs: [], loading: true });
    try {
      const d = await billingService.getPacks(g.action_type);
      setRachat({ label: g.label, packs: d.packs || [], loading: false });
    } catch {
      setRachat(null);
      toast.error('Packs indisponibles');
    }
  };

  const buy = async (pack) => {
    setBuying(pack.id);
    try {
      await billingService.packCheckout(pack.id); // redirige vers Stripe
    } catch (e) {
      setBuying(null);
      toast.error(e.response?.data?.detail || 'Paiement indisponible');
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-[#5B6CFF]" />
      </div>
    );
  }
  if (!data || !data.gauges?.length) return null;

  const gauges = [...data.gauges].sort((a, b) => ORDER.indexOf(a.action_type) - ORDER.indexOf(b.action_type));
  const sub = data.subscription;
  const jours = sub?.status === 'trialing' ? joursRestants(sub.current_period_end) : null;

  return (
    <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <p className="text-white font-semibold font-sora leading-tight">Ce que tu peux créer ce mois-ci</p>
            <p className="text-slate-500 text-[12px] font-inter">Tes résultats inclus, remis à zéro chaque période</p>
          </div>
        </div>
        {jours != null && (
          <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-[#3AFFA3]/10 text-[#3AFFA3] border border-[#3AFFA3]/20 whitespace-nowrap">
            Essai · {jours} j restants
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5">
        {gauges.map((g) => <Bar key={g.action_type} g={g} onRachat={openRachat} />)}
      </div>

      {/* Modale de rachat de pack */}
      {rachat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setRachat(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-[#0f172a] border border-white/10 p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-white font-semibold font-sora">Ajouter des {rachat.label}</p>
              <button onClick={() => setRachat(null)} className="text-slate-500 hover:text-white"><X className="w-4.5 h-4.5" /></button>
            </div>
            {rachat.loading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-[#5B6CFF]" /></div>
            ) : rachat.packs.length === 0 ? (
              <p className="text-slate-400 text-sm py-3">Aucun pack disponible pour le moment.</p>
            ) : (
              <div className="space-y-2">
                {rachat.packs.map((p) => (
                  <button key={p.id} onClick={() => buy(p)} disabled={!!buying}
                    className="w-full flex items-center justify-between gap-3 rounded-xl border border-white/10 hover:border-[#3AFFA3]/50 bg-white/[0.03] px-4 py-3 transition-colors disabled:opacity-50">
                    <span className="text-white text-sm font-medium">{p.name}</span>
                    <span className="text-[#3AFFA3] text-sm font-semibold whitespace-nowrap">
                      {buying === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : `${(p.price_cents / 100).toFixed(0)} €`}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-500">Paiement unique, valable jusqu'à la fin de ta période.</p>
          </div>
        </div>
      )}
    </div>
  );
}
