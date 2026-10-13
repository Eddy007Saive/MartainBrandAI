import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, Clock, ExternalLink, ImagePlus, Link2, Loader2, MapPin, Plus, Sparkles, Star, Store, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { googleBusinessService as gb } from '../services/googleBusinessService';
import { contenuService } from '../services/contenuService';

const JOURS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const CATEGORIES = ['COVER', 'PROFILE', 'LOGO', 'EXTERIOR', 'INTERIOR', 'PRODUCT', 'FOOD_AND_DRINK', 'MENU', 'TEAMS', 'AT_WORK', 'ADDITIONAL'];
const TYPES_LIEN = ['APPOINTMENT', 'ONLINE_APPOINTMENT', 'DINING_RESERVATION', 'FOOD_ORDERING', 'FOOD_DELIVERY', 'FOOD_TAKEOUT', 'SHOP_ONLINE'];
const ONGLETS = [
  { id: 'avis', icon: Star },
  { id: 'photos', icon: ImagePlus },
  { id: 'infos', icon: Clock },
  { id: 'liens', icon: Link2 },
];

const carte = 'rounded-2xl border border-white/[0.06] bg-[#0f172a] p-5';
const champ = 'w-full bg-[#0c111f] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-slate-200 font-inter outline-none focus:border-[#4285F4]/50';
const etiquette = 'text-[11px] uppercase tracking-wider text-slate-500 font-inter mb-1 block';
const erreurDe = (e, defaut) => e?.response?.data?.message || e?.response?.data?.detail || defaut;

/** Gérer sa fiche Google depuis Postorico : avis, photos, infos et horaires, liens d'action. */
export default function FicheGooglePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [onglet, setOnglet] = useState('avis');
  const [infos, setInfos] = useState(null);
  const [etat, setEtat] = useState('chargement'); // chargement | ok | absente | erreur
  const [erreur, setErreur] = useState('');
  const [etabs, setEtabs] = useState(null);

  const charger = () => {
    setEtat('chargement');
    gb.infos()
      .then((d) => { setInfos(d); setEtat('ok'); })
      .catch((e) => { setErreur(erreurDe(e, t('ficheGoogle.erreur'))); setEtat(e?.response?.status === 404 ? 'absente' : 'erreur'); });
    gb.etablissements().then(setEtabs).catch(() => setEtabs(null));
  };
  useEffect(() => { charger(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const changerEtab = async (id) => {
    try { await gb.choisirEtablissement(id); toast.success(t('ficheGoogle.etabChoisi')); charger(); } catch (e) { toast.error(erreurDe(e, t('ficheGoogle.erreur'))); }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5" data-testid="fiche-google">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-11 h-11 rounded-xl bg-[#4285F4]/15 border border-[#4285F4]/30 grid place-items-center"><Store className="w-5 h-5 text-[#8ab4f8]" /></div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold font-sora text-white">{t('ficheGoogle.titre')}</h1>
          <p className="text-sm text-slate-500 font-inter truncate">
            {infos?.nom ? `${infos.nom}${infos.categorie ? ` · ${infos.categorie}` : ''}` : t('ficheGoogle.sousTitre')}
          </p>
        </div>
        {infos && (
          <span className={`text-[11px] font-semibold font-inter px-2.5 py-1 rounded-full border ${infos.verifiee === false ? 'border-amber-400/40 text-amber-300 bg-amber-400/10' : 'border-[#3AFFA3]/30 text-[#3AFFA3] bg-[#3AFFA3]/10'}`}>
            {infos.verifiee === false ? t('ficheGoogle.nonVerifiee') : t('ficheGoogle.verifiee')}
          </span>
        )}
        {infos?.lien_maps && (
          <a href={infos.lien_maps} target="_blank" rel="noreferrer" className="text-[12.5px] font-inter text-[#8ab4f8] hover:text-white inline-flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" />{t('ficheGoogle.voirMaps')}<ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {etabs?.etablissements?.length > 1 && (
        <div className={`${carte} !p-3.5 flex items-center gap-3 flex-wrap`}>
          <span className="text-[12.5px] text-slate-400 font-inter">{t('ficheGoogle.etablissement')}</span>
          <select className={`${champ} !w-auto min-w-[240px]`} value={etabs.selection || ''} onChange={(e) => changerEtab(e.target.value)}>
            {etabs.etablissements.map((l) => <option key={l.id} value={l.id}>{l.nom}{l.adresse ? ` · ${l.adresse}` : ''}</option>)}
          </select>
        </div>
      )}

      {etat === 'chargement' && <div className={`${carte} flex items-center gap-2 text-slate-400 text-sm font-inter`}><Loader2 className="w-4 h-4 animate-spin" />{t('ficheGoogle.chargement')}</div>}
      {etat === 'absente' && (
        <div className={`${carte} text-center space-y-3`}>
          <p className="text-white font-sora font-semibold">{t('ficheGoogle.absenteTitre')}</p>
          <p className="text-sm text-slate-400 font-inter">{t('ficheGoogle.absenteAide')}</p>
          <Button onClick={() => navigate('/dashboard/parametres?s=connections')} className="bg-[#4285F4] hover:bg-[#4285F4]/90 text-white">{t('ficheGoogle.connecter')}</Button>
        </div>
      )}
      {etat === 'erreur' && (
        <div className={`${carte} flex items-center justify-between gap-3`}>
          <p className="text-sm text-red-300 font-inter">{erreur}</p>
          <Button variant="ghost" onClick={charger} className="text-slate-300">{t('ficheGoogle.reessayer')}</Button>
        </div>
      )}

      {etat === 'ok' && (
        <>
          <div className="flex gap-1 p-1 rounded-xl bg-[#0c111f] border border-white/[0.06] overflow-x-auto">
            {ONGLETS.map(({ id, icon: Icon }) => (
              <button key={id} type="button" onClick={() => setOnglet(id)} data-testid={`fiche-google-onglet-${id}`}
                className={`flex-1 min-w-[110px] py-2 rounded-lg text-[13px] font-sora font-semibold inline-flex items-center justify-center gap-2 transition-colors ${onglet === id ? 'bg-[#4285F4] text-white' : 'text-slate-400 hover:text-white'}`}>
                <Icon className="w-4 h-4" />{t(`ficheGoogle.onglets.${id}`)}
              </button>
            ))}
          </div>
          {onglet === 'avis' && <OngletAvis />}
          {onglet === 'photos' && <OngletPhotos />}
          {onglet === 'infos' && <OngletInfos infos={infos} onMaj={setInfos} />}
          {onglet === 'liens' && <OngletLiens />}
        </>
      )}
    </div>
  );
}

function Etoiles({ note, taille = 'w-4 h-4' }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${note}/5`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`${taille} ${i <= note ? 'fill-[#FBBC04] text-[#FBBC04]' : 'text-slate-600'}`} />)}
    </span>
  );
}

// ------------------------------------------------------------------ avis

function OngletAvis() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(null);
  const [filtre, setFiltre] = useState('tous');
  const [plus, setPlus] = useState(false);
  const charger = () => gb.avis().then(setData).catch((e) => { setData({ avis: [] }); toast.error(erreurDe(e, t('ficheGoogle.erreur'))); });
  useEffect(() => { charger(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const suite = async () => {
    setPlus(true);
    try { const d = await gb.avis(data.suite); setData({ ...d, avis: [...data.avis, ...d.avis] }); } catch (e) { toast.error(erreurDe(e, t('ficheGoogle.erreur'))); } finally { setPlus(false); }
  };
  const majAvis = (id, reponse) => setData((d) => ({ ...d, avis: d.avis.map((a) => (a.id === id ? { ...a, reponse } : a)) }));

  if (!data) return <div className={`${carte} flex items-center gap-2 text-slate-400 text-sm`}><Loader2 className="w-4 h-4 animate-spin" />{t('ficheGoogle.chargement')}</div>;
  const liste = data.avis.filter((a) => (filtre === 'sansReponse' ? !a.reponse : filtre === 'critiques' ? a.note <= 3 : true));
  return (
    <div className="space-y-4">
      <div className={`${carte} flex items-center gap-5 flex-wrap`}>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold font-sora text-white tabular-nums">{data.moyenne ?? '–'}</span>
          {data.moyenne ? <Etoiles note={Math.round(data.moyenne)} /> : null}
        </div>
        <span className="text-sm text-slate-400 font-inter">{t('ficheGoogle.avis.total', { n: data.total || 0 })}</span>
        <div className="ml-auto flex gap-2 flex-wrap">
          {['tous', 'sansReponse', 'critiques'].map((f) => (
            <button key={f} type="button" onClick={() => setFiltre(f)}
              className={`px-3 py-1.5 rounded-lg text-[12.5px] font-inter border ${filtre === f ? 'border-[#4285F4] bg-[#4285F4]/15 text-white' : 'border-white/10 text-slate-400 hover:text-white'}`}>
              {t(`ficheGoogle.avis.filtres.${f}`)}
            </button>
          ))}
        </div>
      </div>
      {!liste.length && <p className="text-sm text-slate-500 font-inter text-center py-6">{t('ficheGoogle.avis.vide')}</p>}
      {liste.map((a) => <CarteAvis key={a.id} avis={a} langue={i18n.language} onMaj={(r) => majAvis(a.id, r)} />)}
      {data.suite && (
        <div className="text-center">
          <Button variant="ghost" onClick={suite} disabled={plus} className="text-slate-300">{plus && <Loader2 className="w-4 h-4 animate-spin mr-2" />}{t('ficheGoogle.avis.plus')}</Button>
        </div>
      )}
    </div>
  );
}

function CarteAvis({ avis, langue, onMaj }) {
  const { t } = useTranslation();
  const [edition, setEdition] = useState(null); // texte en cours d'édition, ou null
  const [ia, setIa] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const proposer = async () => {
    setIa(true);
    try { const r = await gb.suggestion(avis); setEdition(r.texte); } catch (e) { toast.error(erreurDe(e, t('ficheGoogle.erreur'))); } finally { setIa(false); }
  };
  const publier = async () => {
    setEnvoi(true);
    try {
      await gb.repondre(avis.id, edition.trim());
      onMaj({ texte: edition.trim(), date: new Date().toISOString() });
      setEdition(null);
      toast.success(t('ficheGoogle.avis.publiee'));
    } catch (e) { toast.error(erreurDe(e, t('ficheGoogle.erreur'))); } finally { setEnvoi(false); }
  };
  const supprimer = async () => {
    if (!window.confirm(t('ficheGoogle.avis.confirmerSuppression'))) return;
    try { await gb.supprimerReponse(avis.id); onMaj(null); toast.success(t('ficheGoogle.avis.supprimee')); } catch (e) { toast.error(erreurDe(e, t('ficheGoogle.erreur'))); }
  };
  const date = avis.date ? new Date(avis.date).toLocaleDateString(langue || 'fr', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  return (
    <div className={`${carte} space-y-3 ${avis.note <= 3 && !avis.reponse ? 'border-l-2 !border-l-amber-400/60' : ''}`} data-testid="avis-google">
      <div className="flex items-center gap-3">
        {avis.photo ? <img src={avis.photo} alt="" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" /> : <div className="w-8 h-8 rounded-full bg-white/10" />}
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] text-white font-inter font-medium truncate">{avis.auteur || t('ficheGoogle.avis.anonyme')}</p>
          <p className="text-[11.5px] text-slate-500 font-inter">{date}</p>
        </div>
        <Etoiles note={avis.note} />
      </div>
      {avis.texte ? <p className="text-[13.5px] text-slate-300 font-inter leading-relaxed whitespace-pre-line">{avis.texte}</p> : <p className="text-[12.5px] text-slate-500 font-inter italic">{t('ficheGoogle.avis.sansTexte')}</p>}

      {avis.reponse && edition === null && (
        <div className="rounded-xl bg-[#0c111f] border border-white/[0.06] p-3">
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-inter mb-1">{t('ficheGoogle.avis.votreReponse')}</p>
          <p className="text-[13px] text-slate-300 font-inter whitespace-pre-line">{avis.reponse.texte}</p>
          <div className="flex gap-3 mt-2">
            <button type="button" onClick={() => setEdition(avis.reponse.texte)} className="text-[12px] text-[#8ab4f8] hover:text-white font-inter">{t('ficheGoogle.avis.modifier')}</button>
            <button type="button" onClick={supprimer} className="text-[12px] text-slate-500 hover:text-red-300 font-inter">{t('ficheGoogle.avis.supprimer')}</button>
          </div>
        </div>
      )}

      {edition !== null ? (
        <div className="space-y-2">
          <textarea rows={4} maxLength={4000} value={edition} onChange={(e) => setEdition(e.target.value)} className={champ} data-testid="avis-google-reponse" />
          <div className="flex gap-2 flex-wrap">
            <Button onClick={publier} disabled={envoi || !edition.trim()} className="bg-[#4285F4] hover:bg-[#4285F4]/90 text-white gap-2">
              {envoi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{t('ficheGoogle.avis.publier')}
            </Button>
            <Button variant="ghost" onClick={proposer} disabled={ia} className="text-slate-300 gap-2">{ia ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}{t('ficheGoogle.avis.reproposer')}</Button>
            <Button variant="ghost" onClick={() => setEdition(null)} className="text-slate-500">{t('ficheGoogle.annuler')}</Button>
          </div>
        </div>
      ) : !avis.reponse && (
        <div className="flex gap-2 flex-wrap">
          <Button onClick={proposer} disabled={ia} className="bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white gap-2" data-testid="avis-google-ia">
            {ia ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}{t('ficheGoogle.avis.proposer')}
          </Button>
          <Button variant="ghost" onClick={() => setEdition('')} className="text-slate-300">{t('ficheGoogle.avis.ecrire')}</Button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ photos

function OngletPhotos() {
  const { t } = useTranslation();
  const [photos, setPhotos] = useState(null);
  const [banque, setBanque] = useState([]);
  const [choix, setChoix] = useState(null);
  const [categorie, setCategorie] = useState('ADDITIONAL');
  const [envoi, setEnvoi] = useState(false);
  const charger = () => gb.photos().then((d) => setPhotos(d.photos)).catch((e) => { setPhotos([]); toast.error(erreurDe(e, t('ficheGoogle.erreur'))); });
  useEffect(() => {
    charger();
    contenuService.reelBanque().then((l) => setBanque((l || []).filter((a) => a.type !== 'video'))).catch(() => setBanque([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const ajouter = async () => {
    if (!choix) return;
    setEnvoi(true);
    try {
      await gb.ajouterPhoto(choix.url, categorie, choix.description || '');
      toast.success(t('ficheGoogle.photos.ajoutee'));
      setChoix(null);
      charger();
    } catch (e) { toast.error(erreurDe(e, t('ficheGoogle.erreur'))); } finally { setEnvoi(false); }
  };
  const supprimer = async (p) => {
    if (!window.confirm(t('ficheGoogle.photos.confirmerSuppression'))) return;
    try { await gb.supprimerPhoto(p.id); setPhotos((l) => l.filter((x) => x.id !== p.id)); toast.success(t('ficheGoogle.photos.supprimee')); } catch (e) { toast.error(erreurDe(e, t('ficheGoogle.erreur'))); }
  };
  return (
    <div className="space-y-4">
      <div className={`${carte} space-y-3`}>
        <p className="text-[14px] text-white font-sora font-semibold">{t('ficheGoogle.photos.ajouterTitre')}</p>
        <p className="text-[12.5px] text-slate-400 font-inter">{t('ficheGoogle.photos.ajouterAide')}</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {banque.map((a) => (
            <button key={a.id || a.url} type="button" onClick={() => setChoix(a)}
              className={`shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 ${choix?.url === a.url ? 'border-[#4285F4]' : 'border-transparent hover:border-white/20'}`}>
              <img src={a.apercu_url || a.url} alt={a.description || ''} className="w-full h-full object-cover" loading="lazy" />
            </button>
          ))}
          {!banque.length && <p className="text-[12.5px] text-slate-600 font-inter">{t('ficheGoogle.photos.banqueVide')}</p>}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <select className={`${champ} !w-auto`} value={categorie} onChange={(e) => setCategorie(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{t(`ficheGoogle.photos.categories.${c}`)}</option>)}
          </select>
          <Button onClick={ajouter} disabled={!choix || envoi} className="bg-[#4285F4] hover:bg-[#4285F4]/90 text-white gap-2">
            {envoi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}{t('ficheGoogle.photos.ajouter')}
          </Button>
        </div>
      </div>
      {photos === null ? (
        <div className={`${carte} flex items-center gap-2 text-slate-400 text-sm`}><Loader2 className="w-4 h-4 animate-spin" />{t('ficheGoogle.chargement')}</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {photos.map((p) => (
            <div key={p.id} className="relative rounded-xl overflow-hidden border border-white/[0.06] bg-[#0c111f] group">
              <img src={p.miniature} alt={p.description} className="w-full aspect-[4/3] object-cover" loading="lazy" referrerPolicy="no-referrer" />
              <div className="flex items-center justify-between px-2.5 py-1.5">
                <span className="text-[11.5px] text-slate-400 font-inter truncate">{t(`ficheGoogle.photos.categories.${p.categorie}`, p.categorie)}</span>
                <button type="button" onClick={() => supprimer(p)} aria-label={t('ficheGoogle.photos.supprimer')} className="text-slate-500 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
          {!photos.length && <p className="col-span-full text-sm text-slate-500 font-inter text-center py-6">{t('ficheGoogle.photos.vide')}</p>}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ infos et horaires

function OngletInfos({ infos, onMaj }) {
  const { t } = useTranslation();
  const [f, setF] = useState(() => ({
    description: infos.description || '',
    telephone: infos.telephone || '',
    site: infos.site || '',
    horaires: infos.horaires || {},
    horaires_speciaux: infos.horaires_speciaux || [],
  }));
  const [ia, setIa] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const maj = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const plages = (j) => f.horaires[j] || [];
  const setPlages = (j, l) => maj('horaires', { ...f.horaires, [j]: l });
  const ouvert24 = (j) => plages(j).length === 1 && plages(j)[0].debut === '00:00' && plages(j)[0].fin === '24:00';

  const rediger = async () => {
    setIa(true);
    try { const r = await gb.genererDescription(); maj('description', r.texte); } catch (e) { toast.error(erreurDe(e, t('ficheGoogle.erreur'))); } finally { setIa(false); }
  };
  const enregistrer = async () => {
    setEnvoi(true);
    try {
      const horaires = Object.fromEntries(JOURS.map((j) => [j, plages(j)]).filter(([, l]) => l.length));
      const r = await gb.majInfos({ ...f, horaires });
      onMaj(r);
      toast.success(t('ficheGoogle.infos.enregistre'));
    } catch (e) { toast.error(erreurDe(e, t('ficheGoogle.erreur'))); } finally { setEnvoi(false); }
  };

  return (
    <div className="space-y-4">
      <div className={`${carte} space-y-3`}>
        <div className="flex items-center justify-between gap-2">
          <span className={etiquette}>{t('ficheGoogle.infos.description')}</span>
          <Button variant="ghost" onClick={rediger} disabled={ia} className="text-[#b9a6ff] gap-2 h-8">{ia ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}{t('ficheGoogle.infos.rediger')}</Button>
        </div>
        <textarea rows={5} maxLength={750} value={f.description} onChange={(e) => maj('description', e.target.value)} className={champ} />
        <p className="text-[11px] text-slate-600 font-inter text-right tabular-nums">{f.description.length} / 750</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label><span className={etiquette}>{t('ficheGoogle.infos.telephone')}</span><input className={champ} value={f.telephone} onChange={(e) => maj('telephone', e.target.value)} /></label>
          <label><span className={etiquette}>{t('ficheGoogle.infos.site')}</span><input className={champ} placeholder="https://" value={f.site} onChange={(e) => maj('site', e.target.value)} /></label>
        </div>
      </div>

      <div className={`${carte} space-y-3`}>
        <p className="text-[14px] text-white font-sora font-semibold">{t('ficheGoogle.infos.horaires')}</p>
        {JOURS.map((j) => (
          <div key={j} className="flex items-start gap-3 flex-wrap border-b border-white/[0.04] pb-2.5 last:border-0">
            <span className="w-24 pt-2 text-[13px] text-slate-300 font-inter">{t(`ficheGoogle.jours.${j}`)}</span>
            <div className="flex-1 space-y-1.5">
              {!plages(j).length && <p className="pt-2 text-[12.5px] text-slate-500 font-inter">{t('ficheGoogle.infos.ferme')}</p>}
              {ouvert24(j) && <p className="pt-2 text-[12.5px] text-[#3AFFA3] font-inter">{t('ficheGoogle.infos.h24')}</p>}
              {!ouvert24(j) && plages(j).map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="time" className={`${champ} !w-auto`} value={p.debut} onChange={(e) => setPlages(j, plages(j).map((x, k) => (k === i ? { ...x, debut: e.target.value } : x)))} />
                  <span className="text-slate-500">–</span>
                  <input type="time" className={`${champ} !w-auto`} value={p.fin === '24:00' ? '23:59' : p.fin} onChange={(e) => setPlages(j, plages(j).map((x, k) => (k === i ? { ...x, fin: e.target.value } : x)))} />
                  <button type="button" onClick={() => setPlages(j, plages(j).filter((_, k) => k !== i))} aria-label={t('ficheGoogle.supprimer')} className="text-slate-500 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setPlages(j, [...(ouvert24(j) ? [] : plages(j)), { debut: '09:00', fin: '18:00' }])} className="text-[12px] text-[#8ab4f8] hover:text-white font-inter">{t('ficheGoogle.infos.ajouterPlage')}</button>
              <button type="button" onClick={() => setPlages(j, ouvert24(j) ? [] : [{ debut: '00:00', fin: '24:00' }])} className="text-[12px] text-slate-400 hover:text-white font-inter">{t('ficheGoogle.infos.basculer24')}</button>
              {plages(j).length > 0 && <button type="button" onClick={() => setPlages(j, [])} className="text-[12px] text-slate-500 hover:text-white font-inter">{t('ficheGoogle.infos.fermer')}</button>}
            </div>
          </div>
        ))}
      </div>

      <div className={`${carte} space-y-3`}>
        <p className="text-[14px] text-white font-sora font-semibold">{t('ficheGoogle.infos.speciaux')}</p>
        <p className="text-[12.5px] text-slate-400 font-inter">{t('ficheGoogle.infos.speciauxAide')}</p>
        {f.horaires_speciaux.map((s, i) => {
          const set = (v) => maj('horaires_speciaux', f.horaires_speciaux.map((x, k) => (k === i ? { ...x, ...v } : x)));
          return (
            <div key={i} className="flex items-center gap-2 flex-wrap">
              <input type="date" className={`${champ} !w-auto`} value={s.date} onChange={(e) => set({ date: e.target.value })} />
              <select className={`${champ} !w-auto`} value={s.ferme ? 'ferme' : 'ouvert'} onChange={(e) => set(e.target.value === 'ferme' ? { ferme: true, debut: undefined, fin: undefined } : { ferme: false, debut: '09:00', fin: '13:00' })}>
                <option value="ferme">{t('ficheGoogle.infos.ferme')}</option>
                <option value="ouvert">{t('ficheGoogle.infos.horairesSpeciales')}</option>
              </select>
              {!s.ferme && <>
                <input type="time" className={`${champ} !w-auto`} value={s.debut || ''} onChange={(e) => set({ debut: e.target.value })} />
                <span className="text-slate-500">–</span>
                <input type="time" className={`${champ} !w-auto`} value={s.fin || ''} onChange={(e) => set({ fin: e.target.value })} />
              </>}
              <button type="button" onClick={() => maj('horaires_speciaux', f.horaires_speciaux.filter((_, k) => k !== i))} aria-label={t('ficheGoogle.supprimer')} className="text-slate-500 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          );
        })}
        <button type="button" onClick={() => maj('horaires_speciaux', [...f.horaires_speciaux, { date: new Date().toISOString().slice(0, 10), ferme: true }])} className="text-[12.5px] text-[#8ab4f8] hover:text-white font-inter inline-flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" />{t('ficheGoogle.infos.ajouterJour')}</button>
      </div>

      <div className="flex justify-end">
        <Button onClick={enregistrer} disabled={envoi} className="bg-[#4285F4] hover:bg-[#4285F4]/90 text-white gap-2" data-testid="fiche-google-enregistrer">
          {envoi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{t('ficheGoogle.infos.enregistrer')}
        </Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ liens d'action

function OngletLiens() {
  const { t } = useTranslation();
  const [liens, setLiens] = useState(null);
  const [type, setType] = useState('APPOINTMENT');
  const [url, setUrl] = useState('');
  const [envoi, setEnvoi] = useState(false);
  useEffect(() => { gb.liens().then((d) => setLiens(d.liens)).catch((e) => { setLiens([]); toast.error(erreurDe(e, t('ficheGoogle.erreur'))); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const ajouter = async () => {
    setEnvoi(true);
    try { const d = await gb.ajouterLien(url.trim(), type); setLiens(d.liens); setUrl(''); toast.success(t('ficheGoogle.liens.ajoute')); } catch (e) { toast.error(erreurDe(e, t('ficheGoogle.erreur'))); } finally { setEnvoi(false); }
  };
  const supprimer = async (l) => {
    try { const d = await gb.supprimerLien(l.id); setLiens(d.liens); } catch (e) { toast.error(erreurDe(e, t('ficheGoogle.erreur'))); }
  };
  return (
    <div className={`${carte} space-y-4`}>
      <p className="text-[12.5px] text-slate-400 font-inter">{t('ficheGoogle.liens.aide')}</p>
      {liens === null ? <Loader2 className="w-4 h-4 animate-spin text-slate-500" /> : liens.map((l) => (
        <div key={l.id} className="flex items-center gap-3 rounded-lg bg-[#0c111f] border border-white/[0.06] px-3 py-2">
          <span className="text-[12.5px] text-white font-inter shrink-0">{t(`ficheGoogle.liens.types.${l.type}`, l.type)}</span>
          <a href={l.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate text-[12.5px] text-[#8ab4f8] font-inter">{l.url}</a>
          <button type="button" onClick={() => supprimer(l)} aria-label={t('ficheGoogle.supprimer')} className="text-slate-500 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      {liens && !liens.length && <p className="text-sm text-slate-500 font-inter">{t('ficheGoogle.liens.vide')}</p>}
      <div className="flex gap-2 flex-wrap">
        <select className={`${champ} !w-auto`} value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES_LIEN.map((ty) => <option key={ty} value={ty}>{t(`ficheGoogle.liens.types.${ty}`)}</option>)}
        </select>
        <input className={`${champ} flex-1 min-w-[200px]`} placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Button onClick={ajouter} disabled={envoi || !url.trim()} className="bg-[#4285F4] hover:bg-[#4285F4]/90 text-white gap-2">{envoi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}{t('ficheGoogle.liens.ajouter')}</Button>
      </div>
    </div>
  );
}
