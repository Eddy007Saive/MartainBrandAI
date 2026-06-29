import { useState, useEffect } from 'react';
import { Loader2, Save, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { adminService } from '../../services/adminService';

const ACTION_LABELS = {
  subject: 'Sujets', post: 'Posts', image_standard: 'Images standard',
  image_pro: 'Images HD', carousel: 'Carrousels', video: 'Vidéos',
};
const ACTION_OPTIONS = Object.keys(ACTION_LABELS);
const eur = (cents) => (cents / 100).toFixed(2);

const inputCls = 'w-full rounded-lg bg-slate-950/60 border border-white/10 text-slate-200 text-[13px] px-2.5 py-1.5 outline-none focus:border-[#5B6CFF]/50';
const btnCls = 'inline-flex items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium px-3 py-1.5 disabled:opacity-50';

export default function QuotaConfigTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [newPack, setNewPack] = useState({ action_type: 'image_pro', name: '', quantity: '', price_cents: '' });

  const load = () => {
    setLoading(true);
    adminService.getQuotaConfig().then(setData).catch(() => toast.error('Erreur de chargement')).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const patch = (where, id, key, value) => {
    setData((d) => {
      const next = structuredClone(d);
      if (where === 'plan') {
        const p = next.plans.find((x) => x.id === id); if (p) p[key] = value;
      } else if (where === 'quota') {
        for (const p of next.plans) { const q = (p.quotas || []).find((x) => x.id === id); if (q) { q[key] = value; break; } }
      } else { const k = next.packs.find((x) => x.id === id); if (k) k[key] = value; }
      return next;
    });
  };

  const savePlan = async (p) => {
    setBusy(p.id);
    try {
      await adminService.updatePlan(p.id, { name: p.name, price_cents: Math.round(Number(p.price_cents)), is_active: p.is_active });
      toast.success('Offre enregistrée');
    } catch { toast.error('Échec'); } finally { setBusy(null); }
  };
  const saveQuota = async (q) => {
    setBusy(q.id);
    try {
      await adminService.updatePlanQuota(q.id, {
        included_quantity: Math.round(Number(q.included_quantity)),
        internal_unit_cost_cents: Math.round(Number(q.internal_unit_cost_cents)),
      });
      toast.success('Quota enregistré');
    } catch { toast.error('Échec'); } finally { setBusy(null); }
  };
  const savePack = async (k) => {
    setBusy(k.id);
    try {
      await adminService.updatePack(k.id, { name: k.name, action_type: k.action_type, quantity: Math.round(Number(k.quantity)), price_cents: Math.round(Number(k.price_cents)), is_active: k.is_active });
      toast.success('Pack enregistré');
    } catch { toast.error('Échec'); } finally { setBusy(null); }
  };
  const delPack = async (id) => {
    if (!window.confirm('Supprimer ce pack ?')) return;
    setBusy(id);
    try { await adminService.deletePack(id); toast.success('Supprimé'); load(); }
    catch { toast.error('Échec'); } finally { setBusy(null); }
  };
  const addPack = async () => {
    if (!newPack.name || !newPack.quantity || !newPack.price_cents) return toast.error('Champs requis');
    setBusy('new');
    try {
      await adminService.createPack({ ...newPack, quantity: Math.round(Number(newPack.quantity)), price_cents: Math.round(Number(newPack.price_cents)) });
      toast.success('Pack créé'); setNewPack({ action_type: 'image_pro', name: '', quantity: '', price_cents: '' }); load();
    } catch { toast.error('Échec'); } finally { setBusy(null); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-[#5B6CFF]" /></div>;
  if (!data) return null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold font-sora text-white">Offres & quotas</h2>
        <p className="text-slate-400 text-sm font-inter mt-1">Quotas inclus par type, coûts internes (marge) et packs de rachat. Prix en euros, quotas en résultats. Aucune valeur en dur.</p>
      </div>

      {/* Offres + quotas */}
      {data.plans.map((p) => {
        const coutMax = (p.quotas || []).reduce((s, q) => s + (q.included_quantity * q.internal_unit_cost_cents), 0);
        const marge = p.price_cents > 0 ? Math.round((1 - coutMax / p.price_cents) * 100) : 0;
        return (
          <div key={p.id} className="bg-slate-900/40 border border-white/5 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[140px]">
                <label className="text-[11px] text-slate-500">Nom de l'offre</label>
                <input className={inputCls} value={p.name} onChange={(e) => patch('plan', p.id, 'name', e.target.value)} />
              </div>
              <div className="w-32">
                <label className="text-[11px] text-slate-500">Prix / mois (€)</label>
                <input className={inputCls} type="number" value={eur(p.price_cents)} onChange={(e) => patch('plan', p.id, 'price_cents', Math.round(Number(e.target.value) * 100))} />
              </div>
              <label className="flex items-center gap-2 text-[13px] text-slate-300 pb-1.5">
                <input type="checkbox" checked={!!p.is_active} onChange={(e) => patch('plan', p.id, 'is_active', e.target.checked)} /> Active
              </label>
              <span className="text-[12px] text-slate-500 pb-1.5">Coût max ≈ {eur(coutMax)} € · marge ≈ {marge}%</span>
              <button onClick={() => savePlan(p)} disabled={busy === p.id} className={`${btnCls} bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white`}>
                {busy === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Enregistrer
              </button>
            </div>

            <table className="w-full text-sm">
              <thead><tr className="text-[11px] text-slate-500 text-left">
                <th className="pb-2 font-medium">Type</th><th className="pb-2 font-medium">Quota inclus</th>
                <th className="pb-2 font-medium">Coût interne unitaire (€)</th><th></th>
              </tr></thead>
              <tbody>
                {(p.quotas || []).map((q) => (
                  <tr key={q.id} className="border-t border-white/5">
                    <td className="py-2 pr-3 text-slate-300">{ACTION_LABELS[q.action_type] || q.action_type}</td>
                    <td className="py-2 pr-3 w-28"><input className={inputCls} type="number" value={q.included_quantity} onChange={(e) => patch('quota', q.id, 'included_quantity', e.target.value)} /></td>
                    <td className="py-2 pr-3 w-32"><input className={inputCls} type="number" step="0.01" value={eur(q.internal_unit_cost_cents)} onChange={(e) => patch('quota', q.id, 'internal_unit_cost_cents', Math.round(Number(e.target.value) * 100))} /></td>
                    <td className="py-2 text-right"><button onClick={() => saveQuota(q)} disabled={busy === q.id} className={`${btnCls} bg-white/5 text-slate-200 hover:bg-white/10`}>{busy === q.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      {/* Packs de rachat */}
      <div className="bg-slate-900/40 border border-white/5 rounded-xl p-5 space-y-4">
        <h3 className="text-white font-semibold font-sora">Packs de rachat</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-[11px] text-slate-500 text-left">
            <th className="pb-2 font-medium">Type</th><th className="pb-2 font-medium">Nom (client)</th>
            <th className="pb-2 font-medium">Quantité</th><th className="pb-2 font-medium">Prix (€)</th><th className="pb-2 font-medium">Active</th><th></th>
          </tr></thead>
          <tbody>
            {data.packs.map((k) => (
              <tr key={k.id} className="border-t border-white/5">
                <td className="py-2 pr-2 w-36">
                  <select className={inputCls} value={k.action_type} onChange={(e) => patch('pack', k.id, 'action_type', e.target.value)}>
                    {ACTION_OPTIONS.map((a) => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}
                  </select>
                </td>
                <td className="py-2 pr-2"><input className={inputCls} value={k.name} onChange={(e) => patch('pack', k.id, 'name', e.target.value)} /></td>
                <td className="py-2 pr-2 w-24"><input className={inputCls} type="number" value={k.quantity} onChange={(e) => patch('pack', k.id, 'quantity', e.target.value)} /></td>
                <td className="py-2 pr-2 w-24"><input className={inputCls} type="number" step="0.01" value={eur(k.price_cents)} onChange={(e) => patch('pack', k.id, 'price_cents', Math.round(Number(e.target.value) * 100))} /></td>
                <td className="py-2 pr-2"><input type="checkbox" checked={!!k.is_active} onChange={(e) => patch('pack', k.id, 'is_active', e.target.checked)} /></td>
                <td className="py-2 text-right whitespace-nowrap">
                  <button onClick={() => savePack(k)} disabled={busy === k.id} className={`${btnCls} bg-white/5 text-slate-200 hover:bg-white/10 mr-1`}>{busy === k.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}</button>
                  <button onClick={() => delPack(k.id)} className={`${btnCls} bg-red-500/10 text-red-400 hover:bg-red-500/20`}><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
            {/* Nouveau pack */}
            <tr className="border-t border-white/10">
              <td className="py-2 pr-2"><select className={inputCls} value={newPack.action_type} onChange={(e) => setNewPack({ ...newPack, action_type: e.target.value })}>{ACTION_OPTIONS.map((a) => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}</select></td>
              <td className="py-2 pr-2"><input className={inputCls} placeholder="+25 images HD" value={newPack.name} onChange={(e) => setNewPack({ ...newPack, name: e.target.value })} /></td>
              <td className="py-2 pr-2"><input className={inputCls} type="number" placeholder="25" value={newPack.quantity} onChange={(e) => setNewPack({ ...newPack, quantity: e.target.value })} /></td>
              <td className="py-2 pr-2"><input className={inputCls} type="number" step="0.01" placeholder="9" value={newPack.price_cents} onChange={(e) => setNewPack({ ...newPack, price_cents: e.target.value })} /></td>
              <td></td>
              <td className="py-2 text-right"><button onClick={addPack} disabled={busy === 'new'} className={`${btnCls} bg-[#3AFFA3]/10 text-[#3AFFA3] hover:bg-[#3AFFA3]/20`}>{busy === 'new' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Ajouter</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
