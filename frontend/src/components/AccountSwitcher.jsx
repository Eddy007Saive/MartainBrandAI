import { useState, useEffect, useRef } from 'react';
import { ChevronsUpDown, Plus, Check, Loader2, Briefcase, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { accountService } from '../services/accountService';
import { setToken } from '../lib/auth';

export default function AccountSwitcher() {
  const [accounts, setAccounts] = useState([]);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(null);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nom: '', email: '', password: '' });
  const ref = useRef(null);

  const load = () => accountService.list().then((d) => setAccounts(d.accounts || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  // Ferme au clic extérieur
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const current = accounts.find((a) => a.is_current);

  const doSwitch = async (id) => {
    if (switching) return;
    setSwitching(id);
    try {
      const d = await accountService.switch(id);
      setToken(d.token);
      window.location.reload(); // recharge le contexte avec le nouveau compte
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Bascule impossible');
      setSwitching(null);
    }
  };

  const doCreate = async (e) => {
    e.preventDefault();
    if (!form.nom.trim() || !form.email.trim() || form.password.length < 6) {
      toast.error('Nom, email et mot de passe (6+ caractères) requis');
      return;
    }
    setCreating(true);
    try {
      await accountService.create(form);
      toast.success('Marque créée 🎉');
      setForm({ nom: '', email: '', password: '' });
      setShowForm(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Création impossible');
    } finally {
      setCreating(false);
    }
  };

  const doDelete = async (id, nom) => {
    if (!window.confirm(`Supprimer la marque « ${nom} » et toutes ses données ?`)) return;
    try {
      await accountService.remove(id);
      toast.success('Marque supprimée');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Suppression impossible');
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition-colors text-left">
        <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] grid place-items-center text-white shrink-0">
          <Briefcase className="w-3.5 h-3.5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-semibold text-slate-100 truncate">{current?.nom || 'Ma marque'}</span>
          <span className="block text-[10.5px] text-slate-500">{current?.is_master ? 'Compte principal' : 'Marque'}</span>
        </span>
        <ChevronsUpDown className="w-4 h-4 text-slate-500 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-2 z-50 rounded-xl border border-white/10 bg-[#0f172a] shadow-2xl overflow-hidden">
          <div className="max-h-64 overflow-y-auto p-1.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-600 px-2.5 py-1.5">Mes marques</p>
            {accounts.map((a) => (
              <div key={a.telegram_id} className="group flex items-center gap-2 rounded-lg hover:bg-white/[0.05]">
                <button onClick={() => doSwitch(a.telegram_id)} disabled={a.is_current}
                  className="flex-1 flex items-center gap-2.5 px-2.5 py-2 text-left disabled:cursor-default">
                  <span className="w-6 h-6 rounded-md bg-slate-700 grid place-items-center text-white text-[11px] font-semibold shrink-0 overflow-hidden"
                    style={a.logo_url || a.photo_url ? { backgroundImage: `url(${a.logo_url || a.photo_url})`, backgroundSize: 'cover' } : {}}>
                    {!(a.logo_url || a.photo_url) && (a.nom || '?').charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] text-slate-200 truncate">{a.nom || 'Sans nom'}{a.is_master && <span className="text-slate-500"> · principal</span>}</span>
                  </span>
                  {a.is_current && <Check className="w-4 h-4 text-[#3AFFA3] shrink-0" />}
                  {switching === a.telegram_id && <Loader2 className="w-4 h-4 animate-spin text-slate-400 shrink-0" />}
                </button>
                {!a.is_master && !a.is_current && (
                  <button onClick={() => doDelete(a.telegram_id, a.nom)} title="Supprimer"
                    className="opacity-0 group-hover:opacity-100 px-2 text-slate-500 hover:text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-white/[0.06] p-1.5">
            {!showForm ? (
              <button onClick={() => setShowForm(true)}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] text-[#3AFFA3] hover:bg-[#3AFFA3]/10">
                <Plus className="w-4 h-4" /> Nouvelle marque
              </button>
            ) : (
              <form onSubmit={doCreate} className="p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wider text-slate-500">Nouvelle marque</span>
                  <button type="button" onClick={() => setShowForm(false)} className="text-slate-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
                </div>
                <input value={form.nom} onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))} placeholder="Nom de la marque"
                  className="w-full rounded-lg bg-slate-950/60 border border-white/10 text-slate-200 text-[13px] px-2.5 py-1.5 outline-none focus:border-[#5B6CFF]/50" />
                <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} type="email" placeholder="Email de connexion"
                  className="w-full rounded-lg bg-slate-950/60 border border-white/10 text-slate-200 text-[13px] px-2.5 py-1.5 outline-none focus:border-[#5B6CFF]/50" />
                <input value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} type="password" placeholder="Mot de passe (6+ car.)"
                  className="w-full rounded-lg bg-slate-950/60 border border-white/10 text-slate-200 text-[13px] px-2.5 py-1.5 outline-none focus:border-[#5B6CFF]/50" />
                <button type="submit" disabled={creating}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white text-[13px] font-medium py-2 disabled:opacity-50">
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Créer la marque
                </button>
                <p className="text-[10.5px] text-slate-500 leading-snug">Crédits partagés avec ton compte principal. Elle aura son propre login (email/mot de passe).</p>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
