import { useState, useEffect, useCallback } from 'react';
import { TicketPercent, Plus, Loader2, RefreshCw, Infinity as InfinityIcon } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { adminService } from '../services/adminService';

// Libellés des durées Stripe
const DUREES = {
  once: '1ᵉʳ paiement',
  repeating: (m) => `${m} mois`,
  forever: 'À vie',
};

const fmtReduc = (p) =>
  p.percent_off != null ? `−${p.percent_off}%` : `−${((p.amount_off || 0) / 100).toFixed(2).replace('.00', '')} €`;

const fmtDuree = (p) =>
  p.duration === 'repeating' ? DUREES.repeating(p.duration_in_months) : (DUREES[p.duration] || p.duration);

const FORM_VIDE = {
  code: '', name: '', type: 'percent', valeur: '', duration: 'once',
  duration_in_months: '3', max_redemptions: '', expires: '',
};

export default function AdminPromos() {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(FORM_VIDE);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminService.getPromos();
      setPromos(res.promos || []);
    } catch {
      toast.error('Impossible de charger les codes promo');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const creer = async () => {
    if (!form.code.trim()) return toast.error('Donne un code (ex. BIENVENUE50)');
    if (!form.valeur || Number(form.valeur) <= 0) return toast.error('Indique la valeur de la réduction');
    if (form.duration === 'repeating' && (!form.duration_in_months || Number(form.duration_in_months) < 1))
      return toast.error('Indique le nombre de mois');
    setSaving(true);
    try {
      const body = {
        code: form.code, name: form.name || undefined, type: form.type,
        valeur: Number(form.valeur), duration: form.duration,
      };
      if (form.duration === 'repeating') body.duration_in_months = Number(form.duration_in_months);
      if (form.max_redemptions) body.max_redemptions = Number(form.max_redemptions);
      if (form.expires) body.expires_at = Math.floor(new Date(form.expires + 'T23:59:59').getTime() / 1000);
      const res = await adminService.createPromo(body);
      toast.success(`Code ${res.code} créé 🎟️`);
      setOpen(false); setForm(FORM_VIDE);
      load();
    } catch (e) {
      toast.error(e.message || 'Création impossible');
    } finally {
      setSaving(false);
    }
  };

  const basculer = async (p) => {
    setToggling(p.id);
    try {
      await adminService.togglePromo(p.id, !p.active);
      setPromos((list) => list.map((x) => (x.id === p.id ? { ...x, active: !p.active } : x)));
      toast.success(!p.active ? `${p.code} réactivé` : `${p.code} désactivé`);
    } catch (e) {
      toast.error(e.message || 'Modification impossible');
    } finally {
      setToggling(null);
    }
  };

  const epuise = (p) => p.max_redemptions && p.times_redeemed >= p.max_redemptions;
  const expire = (p) => p.expires_at && p.expires_at * 1000 < Date.now();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold font-sora text-white flex items-center gap-2.5">
            <TicketPercent className="w-6 h-6 text-orange-400" />Codes promo
          </h2>
          <p className="text-sm text-slate-500 font-inter mt-1">
            Réductions saisies au paiement Stripe — 1ᵉʳ mois, N mois ou à vie.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={load} className="text-slate-400 hover:text-white">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={() => setOpen(true)}
            className="bg-gradient-to-r from-red-500 to-orange-500 text-white hover:opacity-90">
            <Plus className="w-4 h-4 mr-1.5" />Nouveau code
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
      ) : promos.length === 0 ? (
        <div className="text-center py-16 text-slate-500 font-inter text-sm border border-dashed border-white/10 rounded-2xl">
          Aucun code promo. Crée le premier — par exemple <b className="text-slate-300">BIENVENUE50</b> (−50 % pendant 3 mois).
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.07] overflow-hidden">
          <table className="w-full text-sm font-inter">
            <thead>
              <tr className="bg-white/[0.03] text-slate-500 text-xs uppercase tracking-wider text-left">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Réduction</th>
                <th className="px-4 py-3">Durée</th>
                <th className="px-4 py-3">Utilisations</th>
                <th className="px-4 py-3">Expire</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3 text-right">Actif</th>
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => (
                <tr key={p.id} className="border-t border-white/[0.05] text-slate-300">
                  <td className="px-4 py-3 font-semibold text-white font-mono tracking-wide">{p.code}</td>
                  <td className="px-4 py-3 text-[#3AFFA3] font-semibold">{fmtReduc(p)}</td>
                  <td className="px-4 py-3">{fmtDuree(p)}</td>
                  <td className="px-4 py-3">
                    {p.times_redeemed}{p.max_redemptions
                      ? ` / ${p.max_redemptions}`
                      : <span className="inline-flex items-center text-slate-500"> / <InfinityIcon className="w-3.5 h-3.5 ml-1" /></span>}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {p.expires_at ? new Date(p.expires_at * 1000).toLocaleDateString('fr-FR') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {epuise(p) ? <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">Épuisé</span>
                      : expire(p) ? <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">Expiré</span>
                      : p.active ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">Actif</span>
                      : <span className="text-xs px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400">Désactivé</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {toggling === p.id
                      ? <Loader2 className="w-4 h-4 animate-spin inline text-slate-500" />
                      : <Switch checked={p.active} onCheckedChange={() => basculer(p)} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Création */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#0f172a] border-white/10 text-white sm:max-w-md">
          <DialogHeader><DialogTitle className="font-sora">Nouveau code promo</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 font-inter">Code *</label>
                <Input value={form.code} onChange={(e) => set('code')(e.target.value.toUpperCase())}
                  placeholder="BIENVENUE50" className="mt-1 bg-slate-900 border-white/10 font-mono" />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-inter">Nom interne</label>
                <Input value={form.name} onChange={(e) => set('name')(e.target.value)}
                  placeholder="Lancement" className="mt-1 bg-slate-900 border-white/10" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 font-inter">Type de réduction</label>
                <Select value={form.type} onValueChange={set('type')}>
                  <SelectTrigger className="mt-1 bg-slate-900 border-white/10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Pourcentage (%)</SelectItem>
                    <SelectItem value="amount">Montant fixe (€)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-slate-400 font-inter">Valeur * {form.type === 'percent' ? '(%)' : '(€)'}</label>
                <Input type="number" min="1" value={form.valeur} onChange={(e) => set('valeur')(e.target.value)}
                  placeholder={form.type === 'percent' ? '50' : '20'} className="mt-1 bg-slate-900 border-white/10" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 font-inter">Durée de la réduction</label>
                <Select value={form.duration} onValueChange={set('duration')}>
                  <SelectTrigger className="mt-1 bg-slate-900 border-white/10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">1ᵉʳ paiement uniquement</SelectItem>
                    <SelectItem value="repeating">Pendant N mois</SelectItem>
                    <SelectItem value="forever">À vie (forever)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.duration === 'repeating' && (
                <div>
                  <label className="text-xs text-slate-400 font-inter">Nombre de mois *</label>
                  <Input type="number" min="1" value={form.duration_in_months}
                    onChange={(e) => set('duration_in_months')(e.target.value)}
                    className="mt-1 bg-slate-900 border-white/10" />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 font-inter">Limite d'utilisations</label>
                <Input type="number" min="1" value={form.max_redemptions}
                  onChange={(e) => set('max_redemptions')(e.target.value)}
                  placeholder="Vide = illimité" className="mt-1 bg-slate-900 border-white/10" />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-inter">Expire le</label>
                <Input type="date" value={form.expires} onChange={(e) => set('expires')(e.target.value)}
                  className="mt-1 bg-slate-900 border-white/10" />
              </div>
            </div>

            {/* Aperçu humain de ce que le client verra */}
            <div className="text-xs text-slate-400 bg-white/[0.04] border border-white/[0.07] rounded-xl px-3.5 py-2.5 font-inter">
              {form.valeur > 0 ? (
                <>Le client paiera <b className="text-white">
                  {form.type === 'percent' ? `−${form.valeur}%` : `−${form.valeur} €`}
                </b>{' '}
                {form.duration === 'once' && 'sur son premier paiement, puis plein tarif.'}
                {form.duration === 'repeating' && `chaque mois pendant ${form.duration_in_months || '…'} mois, puis plein tarif.`}
                {form.duration === 'forever' && 'sur tous ses paiements, à vie.'}</>
              ) : 'Renseigne la valeur pour voir le résumé.'}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} className="text-slate-400">Annuler</Button>
            <Button onClick={creer} disabled={saving}
              className="bg-gradient-to-r from-red-500 to-orange-500 text-white hover:opacity-90">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Plus className="w-4 h-4 mr-1.5" />}
              Créer le code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
