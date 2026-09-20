import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  ArrowLeft, Play, Pause, Scissors, Copy, Trash2, Undo2, Redo2, Loader2, Download, Check, ZoomIn, ZoomOut, Monitor, Image as ImageIcon,
} from 'lucide-react';
import { editeurService } from '../services/editeurService';
import useProjet from '../components/editeur/useProjet';
import Timeline from '../components/editeur/Timeline';
import Apercu from '../components/editeur/Apercu';
import PanneauMedias from '../components/editeur/PanneauMedias';
import PanneauProprietes from '../components/editeur/PanneauProprietes';
import {
  fmtTemps, placerElement, nouvelElement, nouvelId, majElement, supprimerElement, couperElement, dupliquerElement, separerAudio, dureeProjet, dureeMedia,
} from '../components/editeur/outils';

/**
 * Éditeur vidéo manuel (façon CapCut) : médias à gauche, aperçu au centre, réglages à droite,
 * timeline en bas. Le projet est un JSON partagé avec la composition Remotion « Montage » :
 * l'aperçu et le rendu final sont le même code. Sauvegarde automatique 1,5 s après chaque
 * changement ; « Exporter » lance le rendu serveur (1 reel de quota) et la vidéo arrive dans Contenus.
 */
const RESEAUX = ['Instagram', 'TikTok', 'Facebook', 'LinkedIn', 'YouTube'];

export default function EditeurVideo() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const { projet, setProjet, figer, charger, annuler, retablir, peutAnnuler, peutRetablir } = useProjet(null);
  const [montage, setMontage] = useState(null);
  const [titre, setTitre] = useState('');
  const [medias, setMedias] = useState(null);
  // Sélection multiple : `selection` est l'élément principal (le dernier), `selectionIds` le groupe.
  const [selectionIds, setSelectionIds] = useState([]);
  const selection = selectionIds.length ? selectionIds[selectionIds.length - 1] : null;
  const setSelection = useCallback((id) => setSelectionIds(id ? [id] : []), []);
  const basculerSelection = useCallback((id) => setSelectionIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])), []);
  const presse = useRef([]);   // presse-papiers de l'éditeur (éléments copiés)
  const [tete, setTete] = useState(0);
  const [lecture, setLecture] = useState(false);
  const [zoom, setZoom] = useState(60);        // px par seconde
  const [sauvegarde, setSauvegarde] = useState('ok'); // ok | attente | envoi | erreur
  const [exportOuvert, setExportOuvert] = useState(false);
  const [reseau, setReseau] = useState('Instagram');
  const [exportEnCours, setExportEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [transcription, setTranscription] = useState(null); // id du plan en cours de transcription
  const [silences, setSilences] = useState(null); // id du plan en cours de nettoyage des silences
  const premierChargement = useRef(true);
  const minuterie = useRef(null);
  const petitEcran = typeof window !== 'undefined' && window.innerWidth < 900;

  // ---- chargement ----
  useEffect(() => {
    if (!id) {
      editeurService.creer({}).then((m) => navigate(`/dashboard/editeur/${m.id}`, { replace: true }))
        .catch((e) => setErreur(e.response?.data?.detail || t('editeur.echecChargement')));
      return;
    }
    premierChargement.current = true;
    Promise.all([editeurService.lire(id), editeurService.medias().catch(() => ({ banque: [], videos: [], musiques: [] }))])
      .then(([m, med]) => {
        setMontage(m); setTitre(m.titre || ''); charger(m.projet); setMedias(med);
        if (m.reseau) setReseau(m.reseau);
      })
      .catch((e) => setErreur(e.response?.data?.detail || t('editeur.echecChargement')));
  }, [id, charger, navigate, t]);

  // ---- sauvegarde automatique ----
  useEffect(() => {
    if (!projet || !id) return undefined;
    if (premierChargement.current) { premierChargement.current = false; return undefined; }
    setSauvegarde('attente');
    clearTimeout(minuterie.current);
    minuterie.current = setTimeout(async () => {
      setSauvegarde('envoi');
      try {
        const r = await editeurService.modifier(id, { projet, titre });
        setSauvegarde('ok');
        if (r.statut && montage && r.statut !== montage.statut) setMontage((m) => ({ ...m, statut: r.statut }));
      } catch { setSauvegarde('erreur'); }
    }, 1500);
    return () => clearTimeout(minuterie.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projet, titre, id]);

  // ---- suivi du rendu ----
  useEffect(() => {
    if (!montage || montage.statut !== 'rendu_en_cours') return undefined;
    const it = setInterval(async () => {
      try {
        const m = await editeurService.lire(id);
        if (m.statut !== 'rendu_en_cours') {
          setMontage((prev) => ({ ...prev, statut: m.statut, video_url: m.video_url, contenu_id: m.contenu_id }));
          if (m.statut === 'rendu') toast.success(t('editeur.export.pret'));
          else toast.error(t('editeur.export.echec'));
        }
      } catch { /* on réessaie au tick suivant */ }
    }, 6000);
    return () => clearInterval(it);
  }, [montage, id, t]);

  // ---- actions ----
  const element = useMemo(() => projet?.elements.find((e) => e.id === selection) || null, [projet, selection]);
  const onTete = useCallback((v) => setTete(v), []);
  const onLecture = useCallback((v) => setLecture(v), []);

  // Les identifiants sont tirés HORS des updaters : React (StrictMode) peut exécuter un updater
  // deux fois, et la sélection doit désigner l'élément réellement conservé.
  const ajouter = useCallback((type, extra) => {
    if (!projet) return;
    const e = nouvelElement(projet, type, extra);
    setProjet((p) => placerElement(p, e, tete));
    setSelection(e.id);
  }, [projet, setProjet, tete]);

  // Dépôt depuis le panneau médias : la durée du média est lue, puis l'élément est posé à l'instant lâché.
  const deposer = useCallback(async (d, temps) => {
    if (!projet || !d?.url) return;
    let extra = { src: d.url };
    if (d.type === 'video') { const dur = await dureeMedia(d.url, 'video'); extra = { ...extra, duree: dur ? Math.round(dur * 100) / 100 : 5, apercu_url: d.apercu || null }; }
    else if (d.type === 'audio') { const dur = await dureeMedia(d.url, 'audio'); extra = { ...extra, duree: dur ? Math.round(dur * 100) / 100 : 30, volume: 0.5, fonduSortie: 1.5 }; }
    else extra = { ...extra, duree: 4 };
    const e = nouvelElement(projet, d.type, extra);
    setProjet((p) => placerElement(p, e, temps));
    setSelection(e.id);
  }, [projet, setProjet]);

  const couper = useCallback(() => {
    if (!selection) return;
    const id = nouvelId();
    let fait = false;
    setProjet((p) => { const r = couperElement(p, selection, tete, id); fait = !!r.nouveau; return r.projet; });
    setTimeout(() => { if (fait) setSelection(id); }, 0);
  }, [selection, tete, setProjet]);
  const dupliquer = useCallback(() => {
    if (!selectionIds.length) return;
    const nouveaux = Object.fromEntries(selectionIds.map((sid) => [sid, nouvelId()]));
    setProjet((p) => selectionIds.reduce((acc, sid) => dupliquerElement(acc, sid, nouveaux[sid]).projet, p));
    setSelectionIds(Object.values(nouveaux));
  }, [selectionIds, setProjet]);
  // « Séparer l'audio » : plan muet + élément audio indépendant, sélectionné aussitôt.
  const separerLAudio = useCallback((elementId) => {
    const nid = nouvelId();
    setProjet((p) => separerAudio(p, elementId, nid, `p-audio-${nid}`).projet);
    setSelection(nid);
    toast.success(t('editeur.prop.separerAudioOk'));
  }, [setProjet, t]);
  // « Couverture ici » : l'instant de la tête de lecture devient la miniature de la vidéo exportée.
  const definirCouverture = useCallback(() => {
    const instant = Math.round(tete * 10) / 10;
    setProjet((p) => ({ ...p, couverture: instant }));
    toast.success(t('editeur.couvertureOk', { t: instant.toFixed(1) }));
  }, [tete, setProjet, t]);
  const supprimer = useCallback(() => {
    if (!selectionIds.length) return;
    setProjet((p) => selectionIds.reduce((acc, sid) => supprimerElement(acc, sid), p)); setSelection(null);
  }, [selectionIds, setProjet, setSelection]);

  // Copier / couper / coller : le collage se fait à la tête de lecture, en gardant l'écart entre les éléments.
  const copier = useCallback(() => {
    if (!projet || !selectionIds.length) return false;
    presse.current = projet.elements.filter((e) => selectionIds.includes(e.id)).map((e) => JSON.parse(JSON.stringify(e)));
    return presse.current.length > 0;
  }, [projet, selectionIds]);
  const couperPresse = useCallback(() => { if (copier()) supprimer(); }, [copier, supprimer]);
  const coller = useCallback(() => {
    if (!presse.current.length) return;
    const base = Math.min(...presse.current.map((e) => e.debut));
    const copies = presse.current.map((e) => ({ ...JSON.parse(JSON.stringify(e)), id: nouvelId(), debut: Math.max(0, Math.round((tete + (e.debut - base)) * 1000) / 1000) }));
    setProjet((p) => ({ ...p, elements: [...p.elements, ...copies.filter((c) => p.pistes.some((x) => x.id === c.piste))] }));
    setSelectionIds(copies.map((c) => c.id));
  }, [tete, setProjet]);
  const toutSelectionner = useCallback(() => {
    if (!projet) return;
    const verrouilles = new Set(projet.pistes.filter((p) => p.verrou).map((p) => p.id));
    setSelectionIds(projet.elements.filter((e) => !verrouilles.has(e.piste)).map((e) => e.id));
  }, [projet]);
  const changerZoom = useCallback((facteur) => setZoom((z) => Math.min(240, Math.max(15, Math.round(z * facteur)))), []);

  // Raccourcis : espace lecture, S couper, D dupliquer, Suppr, Ctrl+Z / Ctrl+Y, flèches
  useEffect(() => {
    const onKey = (e) => {
      const cible = e.target;
      if (cible && (cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA' || cible.tagName === 'SELECT')) return;
      if (e.code === 'Space') { e.preventDefault(); setLecture((l) => !l); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); copier(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') { e.preventDefault(); couperPresse(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { e.preventDefault(); coller(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); toutSelectionner(); }
      else if (e.key === 'Escape') { setSelection(null); }
      else if (e.key === 'Home') { e.preventDefault(); setTete(0); }
      else if (e.key === 'End') { e.preventDefault(); setTete(dureeProjet(projet)); }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); changerZoom(1.25); }
      else if (e.key === '-') { e.preventDefault(); changerZoom(0.8); }
      else if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); couper(); }
      else if (e.key.toLowerCase() === 'd' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); dupliquer(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); supprimer(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); annuler(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); retablir(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setTete((v) => Math.max(0, v - (e.shiftKey ? 1 : 1 / 30))); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setTete((v) => v + (e.shiftKey ? 1 : 1 / 30)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [couper, dupliquer, supprimer, annuler, retablir, copier, couperPresse, coller, toutSelectionner, changerZoom, projet, setSelection]);

  // « Générer les sous-titres » : le serveur transcrit le plan et renvoie le projet complété ;
  // il remplace le projet local (une entrée d'annulation), la sauvegarde auto suit.
  const transcrire = async (elementId) => {
    setTranscription(elementId);
    try {
      const r = await editeurService.transcrire(id, elementId);
      if (r.projet) setProjet(r.projet);
      toast.success(t('editeur.prop.transcrireOk', { count: r.nb || 0 }));
    } catch (e) {
      toast.error(e.response?.data?.detail || t('editeur.prop.transcrireEchec'));
    } finally { setTranscription(null); }
  };

  // « Couper les silences » : remplace le plan par ses sous-plans parlés, sélectionne le dernier.
  const couperSilences = async (elementId, intensite) => {
    setSilences(elementId);
    try {
      const r = await editeurService.couperSilences(id, elementId, intensite);
      if (r.projet) setProjet(r.projet);
      if (r.dernier_id) setSelection(r.dernier_id);
      toast.success(t('editeur.prop.silencesOk', { count: r.nb, gagne: r.gagne }));
    } catch (e) {
      toast.error(e.response?.data?.detail || t('editeur.prop.silencesEchec'));
    } finally { setSilences(null); }
  };

  const exporter = async () => {
    setExportEnCours(true);
    try {
      const r = await editeurService.rendre(id, { reseau, titre });
      setMontage((m) => ({ ...m, ...r.montage, statut: 'rendu_en_cours', contenu_id: r.contenu_id }));
      setExportOuvert(false);
      toast.success(t('editeur.export.lance'));
    } catch (e) {
      if (!e.__handled) toast.error(e.response?.data?.detail?.message || e.response?.data?.detail || t('editeur.export.echec'));
    } finally { setExportEnCours(false); }
  };

  if (erreur) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-300 font-inter">{erreur}</p>
        <button type="button" onClick={() => navigate('/dashboard/contenus')} className="mt-4 text-[#a5b0ff] underline">{t('editeur.retour')}</button>
      </div>
    );
  }
  if (petitEcran) {
    return (
      <div className="p-8 text-center max-w-sm mx-auto" data-testid="editeur-petit-ecran">
        <Monitor className="w-10 h-10 text-[#8A6CFF] mx-auto mb-3" />
        <h1 className="text-lg font-sora font-bold text-white">{t('editeur.titre')}</h1>
        <p className="mt-2 text-[13.5px] text-slate-400 font-inter leading-relaxed">{t('editeur.petitEcran')}</p>
        <button type="button" onClick={() => navigate('/dashboard/contenus')} className="mt-5 text-[#a5b0ff] underline">{t('editeur.retour')}</button>
      </div>
    );
  }
  if (!projet) {
    return <div className="h-[70vh] grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;
  }

  const duree = dureeProjet(projet);
  const rendu = montage?.statut === 'rendu_en_cours';

  return (
    <div className="fixed inset-y-0 right-0 left-0 md:left-64 z-30 flex flex-col bg-[#020617] text-slate-200" data-testid="editeur-video">
      {/* Barre du haut */}
      <header className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-white/[0.08] bg-[#0a0f1c]">
        <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/dashboard/editeur'))} className="w-9 h-9 grid place-items-center rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-white" title={t('editeur.retour')} data-testid="editeur-retour">
          <ArrowLeft className="w-4.5 h-4.5" />
        </button>
        <input value={titre} onChange={(e) => setTitre(e.target.value)} maxLength={120} data-testid="editeur-titre"
          className="bg-transparent font-sora font-semibold text-[15px] text-white outline-none border-b border-transparent focus:border-[#5B6CFF]/60 px-1 min-w-[160px] max-w-[360px]" />
        <span className="text-[11px] font-inter text-slate-500 flex items-center gap-1.5" data-testid="editeur-sauvegarde">
          {sauvegarde === 'envoi' ? <Loader2 className="w-3 h-3 animate-spin" /> : sauvegarde === 'ok' ? <Check className="w-3 h-3 text-[#3AFFA3]" /> : null}
          {t(`editeur.sauvegarde.${sauvegarde}`)}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={annuler} disabled={!peutAnnuler} title={t('editeur.annuler')} className="w-9 h-9 grid place-items-center rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-white disabled:opacity-30" data-testid="editeur-annuler"><Undo2 className="w-4 h-4" /></button>
          <button type="button" onClick={retablir} disabled={!peutRetablir} title={t('editeur.retablir')} className="w-9 h-9 grid place-items-center rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-white disabled:opacity-30" data-testid="editeur-retablir"><Redo2 className="w-4 h-4" /></button>
          {montage?.statut === 'rendu' && montage.contenu_id && (
            <button type="button" onClick={() => navigate('/dashboard/contenus')} className="text-[12.5px] font-inter font-semibold text-[#3AFFA3] px-3 py-2 rounded-lg border border-[#3AFFA3]/40 hover:bg-[#3AFFA3]/10" data-testid="editeur-voir-contenus">
              {t('editeur.export.voir')}
            </button>
          )}
          <button type="button" onClick={() => setExportOuvert(true)} disabled={rendu || projet.elements.length === 0} data-testid="editeur-exporter"
            className="inline-flex items-center gap-2 text-[13px] font-sora font-semibold text-white px-4 py-2 rounded-[10px] bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] hover:opacity-90 disabled:opacity-50">
            {rendu ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {rendu ? t('editeur.export.enCours') : t('editeur.export.bouton')}
          </button>
        </div>
      </header>

      {/* Corps : médias · aperçu · propriétés */}
      <div className="flex-1 min-h-0 flex">
        <aside className="w-[268px] shrink-0 border-r border-white/[0.08] bg-[#0a0f1c] min-h-0">
          <PanneauMedias medias={medias} setMedias={setMedias} onAjouter={ajouter} t={t} />
        </aside>
        <main className="flex-1 min-w-0 min-h-0 flex flex-col">
          <Apercu projet={projet} tete={tete} onTete={onTete} lecture={lecture} onLecture={onLecture}
            selection={selection} onSelection={setSelection} onChange={setProjet} onFiger={figer} />
        </main>
        <aside className="w-[300px] shrink-0 border-l border-white/[0.08] bg-[#0a0f1c] overflow-y-auto min-h-0">
          <PanneauProprietes projet={projet} element={element} t={t}
            onElement={(maj) => setProjet((p) => majElement(p, selection, maj))}
            onProjet={(maj) => setProjet(maj)}
            onTranscrire={transcrire} transcription={transcription}
            onSilences={couperSilences} silences={silences} onSeparerAudio={separerLAudio} />
        </aside>
      </div>

      {/* Barre d'outils + timeline */}
      <div className="h-11 shrink-0 flex items-center gap-1.5 px-3 border-t border-white/[0.08] bg-[#0a0f1c]">
        <button type="button" onClick={() => setLecture((l) => !l)} className="w-9 h-9 grid place-items-center rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white" data-testid="editeur-lecture" title={t('editeur.lecture')}>
          {lecture ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <span className="font-mono text-[12.5px] text-slate-300 w-[110px]" data-testid="editeur-temps">{fmtTemps(tete)} <span className="text-slate-600">/ {fmtTemps(duree)}</span></span>
        <div className="w-px h-6 bg-white/10 mx-1" />
        <Outil onClick={couper} disabled={!selection} icone={Scissors} label={t('editeur.couper')} testid="editeur-couper" />
        <Outil onClick={dupliquer} disabled={!selection} icone={Copy} label={t('editeur.dupliquer')} testid="editeur-dupliquer" />
        <Outil onClick={supprimer} disabled={!selection} icone={Trash2} label={t('editeur.supprimer')} testid="editeur-supprimer" danger />
        {selectionIds.length > 1 && <span className="text-[11px] text-[#3AFFA3] font-inter ml-1" data-testid="editeur-n-selection">{t('editeur.nSelection', { count: selectionIds.length })}</span>}
        <div className="w-px h-6 bg-white/10 mx-1" />
        <Outil onClick={definirCouverture} icone={ImageIcon} label={projet.couverture != null ? t('editeur.couvertureActuelle', { t: projet.couverture.toFixed(1) }) : t('editeur.couverture')} testid="editeur-couverture" />
        <div className="ml-auto flex items-center gap-1.5 text-slate-500">
          <ZoomOut className="w-3.5 h-3.5" />
          <input type="range" min={15} max={240} step={5} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-28 accent-[#3AFFA3]" data-testid="editeur-zoom" />
          <ZoomIn className="w-3.5 h-3.5" />
        </div>
      </div>
      <div className="h-[min(300px,34vh)] shrink-0 min-h-0">
        <Timeline projet={projet} tete={tete} onTete={(v) => { setLecture(false); setTete(v); }} selection={selection} onSelection={setSelection}
          onChange={setProjet} onFiger={figer} onDeposer={deposer} zoom={zoom} t={t}
          selectionIds={selectionIds} onBasculerSelection={basculerSelection} onZoom={changerZoom} />
      </div>

      {/* Export */}
      {exportOuvert && (
        <div className="fixed inset-0 z-[80] bg-black/60 grid place-items-center" onClick={() => setExportOuvert(false)}>
          <div className="w-[420px] rounded-2xl border border-white/10 bg-[#0f172a] p-6" onClick={(e) => e.stopPropagation()} data-testid="editeur-export-dialog">
            <h2 className="text-[17px] font-sora font-bold text-white">{t('editeur.export.titre')}</h2>
            <p className="text-[13px] text-slate-400 font-inter mt-1 leading-relaxed">{t('editeur.export.aide', { duree: fmtTemps(duree) })}</p>
            <label className="block mt-4">
              <span className="block text-[10.5px] uppercase tracking-wide text-slate-500 font-inter mb-1">{t('editeur.export.reseau')}</span>
              <select value={reseau} onChange={(e) => setReseau(e.target.value)} className="w-full bg-slate-950/60 border border-white/10 text-slate-200 text-[13px] font-inter rounded-lg px-3 py-2 outline-none">
                {RESEAUX.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setExportOuvert(false)} className="text-[13px] font-inter text-slate-400 hover:text-white px-3 py-2">{t('editeur.export.annuler')}</button>
              <button type="button" onClick={exporter} disabled={exportEnCours} data-testid="editeur-export-confirmer"
                className="inline-flex items-center gap-2 text-[13px] font-sora font-semibold text-white px-4 py-2 rounded-[10px] bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] hover:opacity-90 disabled:opacity-60">
                {exportEnCours ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}{t('editeur.export.confirmer')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Outil({ onClick, disabled, icone: Icone, label, testid, danger }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={label} data-testid={testid}
      className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12px] font-inter font-semibold border border-white/[0.08] ${danger ? 'text-slate-300 hover:text-red-300 hover:border-red-400/40' : 'text-slate-300 hover:text-white hover:border-white/25'} disabled:opacity-30 disabled:hover:border-white/[0.08]`}>
      <Icone className="w-3.5 h-3.5" />{label}
    </button>
  );
}
