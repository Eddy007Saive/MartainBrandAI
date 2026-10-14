import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, MapPin, Rocket, Sparkles, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { publiciteService } from '../services/publiciteService';

const OBJECTIFS = ['engagement', 'awareness', 'traffic', 'video_views'];
const BOUTONS = ['LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'CONTACT_US'];
const champ = 'w-full bg-[#0c111f] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-slate-200 font-inter outline-none focus:border-[#1877F2]/60';
const etiquette = 'text-[11px] uppercase tracking-wider text-slate-500 font-inter mb-1 block';
const erreurDe = (e, defaut) => e?.response?.data?.message || e?.response?.data?.detail || defaut;
const dateDans = (jours) => { const d = new Date(); d.setDate(d.getDate() + jours); return d.toISOString().slice(0, 10); };

/** Booster un post publié sur Facebook ou Instagram (pub Meta payée par le client à Meta). */
export default function BoosterDialog({ contenu, onClose }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [etat, setEtat] = useState(null);
  const [erreur, setErreur] = useState('');
  const [f, setF] = useState({
    compte_pub: '', objectif: 'engagement', budget: 5, type_budget: 'daily',
    debut: dateDans(0), fin: dateDans(6), villes: [], age_min: 18, age_max: 65, lien: '', bouton: 'LEARN_MORE',
  });
  const [recherche, setRecherche] = useState('');
  const [lieux, setLieux] = useState([]);
  const [conseil, setConseil] = useState(null);
  const [enCours, setEnCours] = useState('');
  const minuteur = useRef(null);
  const maj = (p) => setF((x) => ({ ...x, ...p }));

  useEffect(() => {
    if (!contenu) return;
    setEtat(null); setErreur(''); setConseil(null);
    publiciteService.etat()
      .then((d) => {
        setEtat(d);
        const c = (d.comptes || []).find((x) => x.utilisable) || (d.comptes || [])[0];
        if (c) maj({ compte_pub: c.id, budget: Math.max(5, c.budget_min_jour) });
      })
      .catch((e) => setErreur(erreurDe(e, t('publicite.erreur'))));
  }, [contenu]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    clearTimeout(minuteur.current);
    if (recherche.trim().length < 2) { setLieux([]); return undefined; }
    minuteur.current = setTimeout(() => {
      publiciteService.lieux(recherche).then((d) => setLieux(d.lieux || [])).catch(() => setLieux([]));
    }, 350);
    return () => clearTimeout(minuteur.current);
  }, [recherche]);

  const compte = (etat?.comptes || []).find((c) => c.id === f.compte_pub);
  const jours = f.fin ? Math.max(1, Math.round((new Date(f.fin) - new Date(f.debut || dateDans(0))) / 86400000) + 1) : null;
  const total = f.type_budget === 'daily' ? (jours ? f.budget * jours : null) : f.budget;
  const devise = compte?.devise || 'EUR';

  const demanderConseil = async () => {
    setEnCours('conseil');
    try {
      const c = await publiciteService.conseil(contenu.id);
      setConseil(c);
      maj({ objectif: c.objectif, budget: c.budget_jour, type_budget: 'daily', fin: dateDans(c.jours - 1), age_min: c.age_min, age_max: c.age_max });
    } catch (e) { toast.error(erreurDe(e, t('publicite.erreur'))); }
    setEnCours('');
  };

  const lancer = async () => {
    setEnCours('boost');
    try {
      await publiciteService.booster({
        contenu_id: contenu.id, compte_pub: f.compte_pub, objectif: f.objectif,
        budget: Number(f.budget), type_budget: f.type_budget, debut: f.debut || null, fin: f.fin || null,
        villes: f.villes.map((v) => ({ id: v.id, nom: v.nom, rayon_km: v.rayon_km })),
        age_min: Number(f.age_min), age_max: Number(f.age_max),
        lien: f.objectif === 'traffic' ? f.lien : null, bouton: f.objectif === 'traffic' ? f.bouton : null,
      });
      toast.success(t('publicite.boost.lance'), { action: { label: t('publicite.boost.voir'), onClick: () => navigate('/dashboard/publicite') } });
      onClose();
    } catch (e) { toast.error(erreurDe(e, t('publicite.erreur'))); }
    setEnCours('');
  };

  const bloquant = !etat ? null
    : !etat.page_connectee ? 'pageAbsente'
    : etat.reconnexion ? 'reconnexion'
    : !(etat.comptes || []).length ? 'sansCompte'
    : compte && !compte.utilisable ? 'compteBloque'
    : compte?.alertes?.includes('sans_carte') ? 'sansCarte' : null;

  return (
    <Dialog open={!!contenu} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-[#0f172a] border-slate-800 max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="booster-dialog">
        <DialogHeader>
          <DialogTitle className="text-white font-sora flex items-center gap-2"><Rocket className="w-5 h-5 text-[#6fa8ff]" />{t('publicite.boost.titre')}</DialogTitle>
        </DialogHeader>
        <p className="text-[13px] text-slate-400 font-inter -mt-1 line-clamp-2">{contenu?.titre || contenu?.contenu}</p>

        {!etat && !erreur && <div className="py-10 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>}
        {erreur && <p className="text-sm text-red-400 font-inter">{erreur}</p>}

        {bloquant && (
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-[13px] text-amber-200 font-inter space-y-2">
            <p className="flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{t(`publicite.bloquant.${bloquant}`)}</p>
            {['pageAbsente', 'reconnexion'].includes(bloquant) && (
              <button type="button" onClick={() => navigate('/dashboard/parametres?s=connections')} className="underline text-amber-100">{t('publicite.allerReseaux')}</button>
            )}
            {['sansCarte', 'compteBloque', 'sansCompte'].includes(bloquant) && (
              <a href="https://adsmanager.facebook.com/billing_hub/payment_settings" target="_blank" rel="noopener noreferrer" className="underline text-amber-100">{t('publicite.ouvrirMeta')}</a>
            )}
          </div>
        )}

        {etat && !['pageAbsente', 'reconnexion', 'sansCompte'].includes(bloquant) && (
          <div className="space-y-4">
            {(etat.comptes || []).length > 1 && (
              <label className="block"><span className={etiquette}>{t('publicite.comptePub')}</span>
                <select className={champ} value={f.compte_pub} onChange={(e) => maj({ compte_pub: e.target.value })}>
                  {etat.comptes.map((c) => <option key={c.id} value={c.id}>{c.nom || c.id} · {c.devise}</option>)}
                </select>
              </label>
            )}

            <button type="button" onClick={demanderConseil} disabled={!!enCours} data-testid="booster-conseil"
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-[#8A6CFF]/40 bg-[#8A6CFF]/10 text-[#c4b5ff] text-[13px] font-semibold font-inter py-2 hover:bg-[#8A6CFF]/20 disabled:opacity-50">
              {enCours === 'conseil' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}{t('publicite.boost.conseil')}
            </button>
            {conseil?.raison && <p className="text-[12px] text-slate-400 font-inter italic -mt-2">{conseil.raison}</p>}

            <div>
              <span className={etiquette}>{t('publicite.boost.objectif')}</span>
              <div className="grid grid-cols-2 gap-2">
                {OBJECTIFS.filter((o) => o !== 'video_views' || contenu?.video_url).map((o) => (
                  <button key={o} type="button" onClick={() => maj({ objectif: o })}
                    className={`text-left rounded-lg border px-3 py-2 font-inter transition-colors ${f.objectif === o ? 'border-[#1877F2]/70 bg-[#1877F2]/15 text-white' : 'border-white/10 text-slate-300 hover:border-white/25'}`}>
                    <span className="block text-[13px] font-semibold">{t(`publicite.objectifs.${o}`)}</span>
                    <span className="block text-[11px] text-slate-500">{t(`publicite.objectifsAide.${o}`)}</span>
                  </button>
                ))}
              </div>
            </div>

            {f.objectif === 'traffic' && (
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <label className="block"><span className={etiquette}>{t('publicite.boost.lien')}</span>
                  <input className={champ} placeholder="https://" value={f.lien} onChange={(e) => maj({ lien: e.target.value })} /></label>
                <label className="block"><span className={etiquette}>{t('publicite.boost.boutonAction')}</span>
                  <select className={champ} value={f.bouton} onChange={(e) => maj({ bouton: e.target.value })}>
                    {BOUTONS.map((b) => <option key={b} value={b}>{t(`publicite.boutons.${b}`)}</option>)}
                  </select></label>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className={etiquette}>{t('publicite.boost.budget')} ({devise})</span>
                <input type="number" min={compte?.budget_min_jour || 1} step="1" className={`${champ} tabular-nums`} value={f.budget} onChange={(e) => maj({ budget: e.target.value })} /></label>
              <label className="block"><span className={etiquette}>{t('publicite.boost.typeBudget')}</span>
                <select className={champ} value={f.type_budget} onChange={(e) => maj({ type_budget: e.target.value })}>
                  <option value="daily">{t('publicite.boost.parJour')}</option>
                  <option value="lifetime">{t('publicite.boost.auTotal')}</option>
                </select></label>
              <label className="block"><span className={etiquette}>{t('publicite.boost.debut')}</span>
                <input type="date" min={dateDans(0)} className={champ} value={f.debut} onChange={(e) => maj({ debut: e.target.value })} /></label>
              <label className="block"><span className={etiquette}>{t('publicite.boost.fin')}</span>
                <input type="date" min={f.debut || dateDans(0)} className={champ} value={f.fin} onChange={(e) => maj({ fin: e.target.value })} /></label>
            </div>
            {total != null && (
              <p className="text-[12px] text-slate-400 font-inter tabular-nums">
                {t('publicite.boost.total', { total: Math.round(total * 100) / 100, devise, jours: jours || '?' })}
              </p>
            )}

            <div>
              <span className={etiquette}>{t('publicite.boost.zone')}</span>
              <div className="relative">
                <input className={champ} placeholder={t('publicite.boost.zoneAide')} value={recherche} onChange={(e) => setRecherche(e.target.value)} />
                {lieux.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-white/10 bg-[#0c111f] shadow-xl max-h-52 overflow-y-auto">
                    {lieux.map((l) => (
                      <button key={l.id} type="button" className="w-full text-left px-3 py-2 text-[13px] text-slate-200 hover:bg-white/5 font-inter"
                        onClick={() => { if (!f.villes.some((v) => v.id === l.id)) maj({ villes: [...f.villes, { ...l, rayon_km: 15 }] }); setRecherche(''); setLieux([]); }}>
                        {l.nom}{l.region ? <span className="text-slate-500"> · {l.region}</span> : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-2 space-y-1.5">
                {f.villes.length === 0 && <p className="text-[12px] text-slate-500 font-inter">{t('publicite.boost.toutePays')}</p>}
                {f.villes.map((v) => (
                  <div key={v.id} className="flex items-center gap-2 text-[13px] text-slate-200 font-inter">
                    <MapPin className="w-3.5 h-3.5 text-[#6fa8ff]" /><span className="flex-1 truncate">{v.nom}</span>
                    <select className="bg-[#0c111f] border border-white/10 rounded px-1.5 py-1 text-[12px]" value={v.rayon_km}
                      onChange={(e) => maj({ villes: f.villes.map((x) => (x.id === v.id ? { ...x, rayon_km: Number(e.target.value) } : x)) })}>
                      {[5, 10, 15, 25, 40, 80].map((r) => <option key={r} value={r}>+{r} km</option>)}
                    </select>
                    <button type="button" aria-label={t('publicite.retirer')} onClick={() => maj({ villes: f.villes.filter((x) => x.id !== v.id) })}><X className="w-4 h-4 text-slate-500 hover:text-white" /></button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className={etiquette}>{t('publicite.boost.ageMin')}</span>
                <input type="number" min="18" max="65" className={`${champ} tabular-nums`} value={f.age_min} onChange={(e) => maj({ age_min: e.target.value })} /></label>
              <label className="block"><span className={etiquette}>{t('publicite.boost.ageMax')}</span>
                <input type="number" min="18" max="65" className={`${champ} tabular-nums`} value={f.age_max} onChange={(e) => maj({ age_max: e.target.value })} /></label>
            </div>

            {compte?.alertes?.includes('fuseau') && (
              <p className="text-[12px] text-amber-300 font-inter flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{t('publicite.alertes.fuseau', { fuseau: compte.fuseau })}</p>
            )}
            <p className="text-[11px] text-slate-500 font-inter">{t('publicite.boost.mention')}</p>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={onClose} className="text-slate-400">{t('publicite.annuler')}</Button>
              <Button onClick={lancer} disabled={!!enCours || !!bloquant} data-testid="booster-lancer"
                className="bg-[#1877F2] hover:bg-[#1877F2]/90 text-white font-sora font-semibold rounded-[11px]">
                {enCours === 'boost' ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Rocket className="w-4 h-4 mr-1.5" />}{t('publicite.boost.lancer')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
