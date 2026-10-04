import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Check, X, Maximize2, Sparkles, ChevronDown, Trash2, Pencil, Plus, Palette } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useUser } from '../context/UserContext';
import { userService } from '../services/userService';
import { scheduleService } from '../services/scheduleService';
import { agentService } from '../services/agentService';
import { DEFAULT_SCHEDULE } from '../constants/schedules';
import { SocialIcon } from '../components/SocialIcon';
import { ColorField } from '../components/ColorField';
import { TEMPLATES, SLIDE_LABELS, SLIDE_CSS, renderSlides, CAROUSEL_FONTS, CAROUSEL_BODY_FONTS, loadCustomFonts, loadGoogleFont, parseFontSpec, enregistrerGabaritsPerso } from '../lib/carrouselPreview';
import FontPicker from '../components/FontPicker';

// L'éditeur (Konva) n'est chargé qu'à l'ouverture d'un modèle à modifier.
const EditeurCarrousel = lazy(() => import('../components/EditeurCarrousel'));

const NETS = [
  { id: 'linkedin', label: 'LinkedIn', bg: '#0A66C2', noteKey: 'noteLinkedin' },
  { id: 'instagram', label: 'Instagram', bg: 'linear-gradient(45deg,#F58529,#DD2A7B,#8134AF)', noteKey: 'noteInstagram' },
  { id: 'facebook', label: 'Facebook', bg: '#1877F2', noteKey: 'noteFacebook' },
];
const labelOf = (id) => TEMPLATES.find((t) => t.id === id)?.label || 'Crème';
// Familles du catalogue (filtres) ; les styles photo sont repérés par TEMPLATES[].photos.
const CLASSIQUES = ['creme', 'sombre', 'alterne', 'editorial', 'pop', 'clean', 'neon', 'chiffres'];
const EDITORIAUX = ['kraft', 'surligne', 'grand-chiffre', 'halo', 'pastel'];
const FILTRES = ['tous', 'classiques', 'editoriaux', 'photos', 'miens'];
const estPhoto = (id) => !!TEMPLATES.find((t) => t.id === id)?.photos;

const BRAND_DEFAULTS = { p: '#003D2E', s: '#0077FF', a: '#3AFFA3' };

/** Slide de 200×250 réduite à la largeur réelle de son cadre (les tuiles s'adaptent à l'écran). */
function SlideAjustee({ html }) {
  const ref = useRef(null);
  const [k, setK] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const maj = () => setK(el.getBoundingClientRect().width / 200);
    maj();
    const ro = new ResizeObserver(maj);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden">
      {k > 0 && <div className="origin-top-left" style={{ width: 200, height: 250, transform: `scale(${k})` }} dangerouslySetInnerHTML={{ __html: html }} />}
    </div>
  );
}

export default function CarrouselsPage() {
  const { t } = useTranslation();
  const { user, updateUser } = useUser();
  const brand = {
    p: user?.couleur_principale || BRAND_DEFAULTS.p,
    s: user?.couleur_secondaire || BRAND_DEFAULTS.s,
    a: user?.couleur_accent || BRAND_DEFAULTS.a,
  };
  // Couleurs PROPRES au carrousel (override) — défaut = couleurs de marque
  const [cz, setCz] = useState(null);
  const [savingCz, setSavingCz] = useState(false);
  // Sur mobile, le bloc couleurs/polices est replié : l'essentiel de la page, c'est le choix
  // du style par réseau. Sur grand écran il reste ouvert.
  const [styleOuvert, setStyleOuvert] = useState(false);
  const [largeurEcran, setLargeurEcran] = useState(() => (typeof window === 'undefined' ? 1024 : window.innerWidth));
  useEffect(() => {
    const onResize = () => setLargeurEcran(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // Lightbox : une slide fait 340 px sur grand écran, et tient dans l'écran sur mobile.
  const largeurSlide = Math.min(340, largeurEcran - 48);
  const echelleSlide = largeurSlide / 200;
  useEffect(() => {
    if (user && !cz) setCz({
      p: user.carrousel_couleur_principale || brand.p,
      s: user.carrousel_couleur_secondaire || brand.s,
      a: user.carrousel_couleur_accent || brand.a,
      font: user.carrousel_font || '',
      fontBody: user.carrousel_font_corps || '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Charge les polices choisies (pour l'aperçu) : Google Fonts, ou @font-face
  // pour les polices custom de marque (Circular Bold, TT Norms Pro, Wotfard…).
  useEffect(() => {
    loadCustomFonts([cz?.font, cz?.fontBody]);
    [cz?.font, cz?.fontBody].map((f) => parseFontSpec(f).family).filter(Boolean).forEach(loadGoogleFont);
  }, [cz?.font, cz?.fontBody]);

  // Photos de démonstration des styles photo (Pexels, d'après le secteur de la marque)
  const [photosDemo, setPhotosDemo] = useState([]);
  useEffect(() => { agentService.carrouselPhotos('demo').then(setPhotosDemo).catch(() => {}); }, []);
  const colors = useMemo(() => ({
    p: cz?.p || brand.p, s: cz?.s || brand.s, a: cz?.a || brand.a, font: cz?.font || '', fontBody: cz?.fontBody || '',
    logo: user?.logo_url, nom: user?.nom || user?.username, secteur: user?.secteur, photos: photosDemo,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [cz, user, photosDemo]);

  const setColor = (name, val) => setCz((prev) => ({ ...prev, [name]: val }));
  const resetColors = () => setCz({ ...brand, font: '', fontBody: '' });
  const czDirty = cz && (
    cz.p !== (user?.carrousel_couleur_principale || brand.p) ||
    cz.s !== (user?.carrousel_couleur_secondaire || brand.s) ||
    cz.a !== (user?.carrousel_couleur_accent || brand.a) ||
    (cz.font || '') !== (user?.carrousel_font || '') ||
    (cz.fontBody || '') !== (user?.carrousel_font_corps || '')
  );
  const saveColors = async () => {
    if (!cz) return;
    setSavingCz(true);
    try {
      // '' (et pas null) : la route /users/me ignore les null, '' remet bien la police en Auto
      const payload = { carrousel_couleur_principale: cz.p, carrousel_couleur_secondaire: cz.s, carrousel_couleur_accent: cz.a, carrousel_font: cz.font || '', carrousel_font_corps: cz.fontBody || '' };
      await userService.updateMe(payload);
      updateUser(payload);
      toast.success(t('carrousels.toastCouleursEnregistrees'));
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('carrousels.toastEchecEnregistrement'));
    } finally { setSavingCz(false); }
  };

  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeNet, setActiveNet] = useState('linkedin');
  const [sel, setSel] = useState({});
  const [saved, setSaved] = useState({});
  const [saving, setSaving] = useState(null);
  const [lightbox, setLightbox] = useState(null); // { net, tpl }
  // Templates sur mesure : invisibles tant qu'un admin ne les a pas attribués au compte.
  const [autorises, setAutorises] = useState(null);   // null = pas encore chargé
  const [importes, setImportes] = useState([]);      // templates HTML importés par l'admin
  const [chargementTpl, setChargementTpl] = useState(true); // tant que vrai, les compteurs affichent « … »
  useEffect(() => {
    agentService.carrouselTemplates()
      .then((d) => { enregistrerGabaritsPerso(d?.importes); setAutorises(d?.templates || null); setImportes(d?.importes || []); })
      .catch(() => { setAutorises(null); toast.error(t('carrousels.chargementModelesEchec')); })
      .finally(() => setChargementTpl(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- chargement unique à l'ouverture
  // Deux familles : les modèles communs à tous, et ceux qu'un admin a créés
  // pour CE compte (sur mesure codés en dur + gabarits HTML importés).
  const communs = useMemo(
    () => TEMPLATES.filter((t) => !t.exclusif && (autorises ? autorises.includes(t.id) : true)),
    [autorises]);
  const miens = useMemo(() => [
    ...TEMPLATES.filter((t) => t.exclusif && autorises?.includes(t.id)),
    // Un template importé n'a pas d'aperçu JS : il affiche la vignette rendue à l'import.
    // Un modèle du client se rend en direct (police et couleurs choisies) ; les autres : leur vignette.
    ...importes.map((t) => ({ ...t, vignette: t.perso && t.html ? null : t.preview_url })),
  ], [autorises, importes]);

  // Catalogue filtré : Tous, Classiques, Éditoriaux, Avec photos, Mes modèles.
  const [filtre, setFiltre] = useState('tous');
  const parFiltre = useMemo(() => ({
    tous: [...communs, ...miens],
    classiques: communs.filter((x) => CLASSIQUES.includes(x.id)),
    editoriaux: communs.filter((x) => EDITORIAUX.includes(x.id)),
    photos: communs.filter((x) => estPhoto(x.id)),
    miens,
  }), [communs, miens]);
  const templatesVisibles = parFiltre[filtre] || parFiltre.tous;

  useEffect(() => {
    (async () => {
      try {
        const data = await scheduleService.getAll();
        setSchedules(data || []);
        const map = {};
        NETS.forEach((n) => { map[n.id] = (data || []).find((r) => r.platform === n.id)?.carrousel_template || 'creme'; });
        setSel(map); setSaved({ ...map });
      } catch (e) {
        const map = {}; NETS.forEach((n) => { map[n.id] = 'creme'; });
        setSel(map); setSaved({ ...map });
      } finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (!lightbox) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const save = async (net) => {
    setSaving(net);
    try {
      const rows = [...schedules];
      const idx = rows.findIndex((r) => r.platform === net);
      if (idx >= 0) rows[idx] = { ...rows[idx], carrousel_template: sel[net] };
      else rows.push({ platform: net, ...DEFAULT_SCHEDULE, carrousel_template: sel[net] });
      const out = await scheduleService.save(rows);
      setSchedules(out || rows);
      setSaved((p) => ({ ...p, [net]: sel[net] }));
      // Un gabarit importé n'est pas dans TEMPLATES : on prend son libellé réel.
      const nom = [...communs, ...miens].find((x) => x.id === sel[net])?.label || labelOf(sel[net]);
      toast.success(t('carrousels.toastStyleEnregistre', { style: nom, reseau: NETS.find((n) => n.id === net)?.label }));
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('carrousels.toastEchecEnregistrement'));
    } finally { setSaving(null); }
  };

  // Modèle créé par le client dans l'éditeur : lui seul peut le supprimer.
  const [suppression, setSuppression] = useState(null);
  const supprimerModele = async (id) => {
    if (!window.confirm(t('carrousels.supprimerModeleConfirme'))) return;
    setSuppression(id);
    try {
      await agentService.supprimerModeleCarrousel(id);
      setImportes((l) => l.filter((x) => x.id !== id));
      setAutorises((l) => (l ? l.filter((x) => x !== id) : l));
      setSel((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v === id ? 'creme' : v])));
      setLightbox(null);
      toast.success(t('carrousels.modeleSupprime'));
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('carrousels.toastEchecEnregistrement'));
    } finally { setSuppression(null); }
  };
  const libelle = (id) => importes.find((x) => x.id === id)?.label || labelOf(id);

  // Modifier un modèle créé par le client : il se rouvre dans l'éditeur avec ses rôles.
  const [edition, setEdition] = useState(null); // { id, label, design }
  const [ouvertureEdition, setOuvertureEdition] = useState(null);
  const modifierModele = async (id) => {
    setOuvertureEdition(id);
    try {
      const m = await agentService.modeleCarrousel(id);
      setLightbox(null);
      setEdition(m);
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('carrousels.toastEchecEnregistrement'));
    } finally { setOuvertureEdition(null); }
  };
  // Nouveau modèle à partir d'un style : ses slides de démonstration s'ouvrent dans l'éditeur.
  const [creation, setCreation] = useState(null); // { apparence }
  const personnaliser = (tpl) => {
    setLightbox(null);
    setCreation({
      apparence: { p: colors.p, s: colors.s, a: colors.a, font: colors.font, fontBody: colors.fontBody, slidesHtml: renderSlides(tpl || 'creme', colors) },
    });
  };
  const rafraichirModeles = () => agentService.carrouselTemplates()
    .then((d) => { enregistrerGabaritsPerso(d?.importes); setAutorises(d?.templates || null); setImportes(d?.importes || []); })
    .catch(() => {});

  const nt = NETS.find((n) => n.id === activeNet);
  const dirty = sel[activeNet] !== saved[activeNet];
  const choix = sel[activeNet] || 'creme';
  const infoTpl = (id) => [...communs, ...miens].find((x) => x.id === id) || { id, label: labelOf(id) };
  const tplChoisi = infoTpl(choix);
  const estPerso = !!importes.find((x) => x.id === choix)?.perso;
  /** Première slide d'un style, à la taille voulue (vignette d'import ou rendu en direct). */
  const couverture = (tpl) => {
    const x = infoTpl(tpl.id || tpl);
    if (x.vignette) return <img src={x.vignette} alt="" className="absolute inset-0 w-full h-full object-cover" />;
    return <SlideAjustee html={renderSlides(x.id, colors)[0] || ''} />;
  };
  const description = (id) => {
    if (importes.find((x) => x.id === id)?.perso) return t('carrousels.desc.perso');
    if (miens.some((x) => x.id === id)) return t('carrousels.desc.exclusif');
    return t(`carrousels.desc.${id}`, { defaultValue: '' }) + (estPhoto(id) ? ` ${t('carrousels.desc.photosPexels')}` : '');
  };
  const appliquer = () => { if (dirty) save(activeNet); };
  const coche = <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 6.2 5 8.6 9.6 3.6" /></svg>;
  const tuileCreer = (
    <button key="creer" type="button" onClick={() => personnaliser(choix)} data-testid="carr-creer-modele" className="group text-left">
      <div className="aspect-[4/5] rounded-[10px] border-[1.5px] border-dashed border-[#5B6CFF]/50 bg-[#5B6CFF]/[0.06] group-hover:bg-[#5B6CFF]/15 transition-colors grid place-items-center text-center px-3">
        <div className="flex flex-col items-center gap-2">
          <span className="w-10 h-10 rounded-full bg-[#5B6CFF]/25 grid place-items-center text-[#c3cbff]"><Plus className="w-5 h-5" /></span>
          <span className="text-[13px] font-semibold text-white">{t('carrousels.creerModele')}</span>
          <span className="text-[11.5px] leading-snug text-slate-400">{t('carrousels.creerModeleAide', { style: libelle(choix) })}</span>
        </div>
      </div>
    </button>
  );

  return (
    <div className="max-w-6xl pb-24 lg:pb-0">
      <style dangerouslySetInnerHTML={{ __html: SLIDE_CSS }} />
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-5">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold font-sora text-white">{t('carrousels.titre')}</h1>
          <p className="text-sm text-slate-400 font-inter mt-1 max-w-2xl">{t('carrousels.introSection')}</p>
        </div>
        {/* Réseaux : chacun montre le style déjà choisi */}
        {!loading && (
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label={t('carrousels.reseau')}>
            {NETS.map((n) => {
              const on = activeNet === n.id;
              return (
                <button key={n.id} type="button" onClick={() => setActiveNet(n.id)} data-testid={`carr-tab-${n.id}`} aria-pressed={on}
                  className={`flex items-center gap-2.5 pl-1.5 pr-3.5 py-1.5 rounded-xl border transition-colors shrink-0 text-left ${on ? 'border-[#5B6CFF] bg-[#5B6CFF]/12' : 'border-white/8 bg-white/[0.02] hover:border-white/20'}`}>
                  <span className="relative w-[30px] h-[38px] rounded-[5px] overflow-hidden shrink-0 bg-slate-800">
                    {couverture(saved[n.id] || 'creme')}
                    <span className="absolute -right-0.5 -bottom-0.5 w-4 h-4 rounded-[5px] grid place-items-center text-white" style={{ background: n.bg }}><SocialIcon network={n.id} className="w-2.5 h-2.5" /></span>
                  </span>
                  <span className="min-w-0">
                    <span className={`block font-sora font-semibold text-[13px] ${on ? 'text-white' : 'text-slate-300'}`}>{n.label}</span>
                    <span className="block text-[11.5px] text-slate-400 whitespace-nowrap">{libelle(saved[n.id])}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Couleurs et police : une barre compacte, le détail se déplie */}
      {cz && (
        <section className="rounded-2xl border border-white/8 bg-[#0b1322] px-4 py-3 mb-5" aria-label={t('carrousels.styleDuCarrousel')}>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
            <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase flex items-center gap-2">
              {t('carrousels.tesCouleurs')}{czDirty && <span className="w-1.5 h-1.5 rounded-full bg-[#3AFFA3]" />}
            </span>
            <div className="flex gap-2">
              {[['p', 'couleurPrincipale'], ['s', 'couleurSecondaire'], ['a', 'couleurAccent']].map(([k, cle]) => (
                <span key={k} className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border border-white/8 text-[12px] text-slate-400">
                  <i className="w-5 h-5 rounded-full border border-white/20 block" style={{ background: cz[k] }} />
                  <span className="hidden sm:inline">{t(`carrousels.${cle}`)}</span>
                </span>
              ))}
            </div>
            <span className="text-[12px] text-slate-400">
              <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase mr-2">{t('carrousels.police')}</span>
              {parseFontSpec(cz.font).family || t('carrousels.policeDuStyle')}
            </span>
            <button type="button" onClick={() => setStyleOuvert((o) => !o)} aria-expanded={styleOuvert} data-testid="carr-style-toggle"
              className="ml-auto flex items-center gap-1.5 text-[12.5px] text-slate-300 hover:text-white">
              {t(styleOuvert ? 'carrousels.fermerReglages' : 'carrousels.modifierCouleurs')}
              <ChevronDown className={`w-4 h-4 transition-transform ${styleOuvert ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {styleOuvert && (<>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
            <ColorField label={t('carrousels.couleurPrincipale')} name="p" value={cz.p} onChange={setColor} />
            <ColorField label={t('carrousels.couleurSecondaire')} name="s" value={cz.s} onChange={setColor} />
            <ColorField label={t('carrousels.couleurAccent')} name="a" value={cz.a} onChange={setColor} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3 max-w-xl">
            <div>
              <label className="block text-[12px] font-medium text-slate-300 mb-1.5">{t('carrousels.policeDesTitres')}</label>
              <FontPicker value={cz.font || ''} onChange={(v) => setColor('font', v)} options={CAROUSEL_FONTS} />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-slate-300 mb-1.5">{t('carrousels.policeDuTexte')}</label>
              <FontPicker value={cz.fontBody || ''} onChange={(v) => setColor('fontBody', v)} options={CAROUSEL_BODY_FONTS} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button onClick={resetColors} className="flex-1 sm:flex-none text-[12.5px] text-slate-400 hover:text-white px-3 py-2 rounded-lg border border-white/10">{t('carrousels.reinitialiser')}</button>
            <button onClick={saveColors} disabled={!czDirty || savingCz}
              className={`flex-1 sm:flex-none justify-center text-[13px] font-semibold px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 ${czDirty ? 'bg-[#e7ecf5] text-[#0b1322] hover:bg-white' : 'bg-white/5 text-slate-500 cursor-default'}`}>
              {savingCz ? <Loader2 className="w-4 h-4 animate-spin" /> : (!czDirty && <Check className="w-4 h-4" />)}
              {czDirty ? t('carrousels.enregistrer') : t('carrousels.dejaEnregistre')}
            </button>
          </div>
          </>)}
        </section>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-12 justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#5B6CFF]" /> {t('carrousels.chargement')}</div>
      ) : (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
          {/* Catalogue */}
          <section className="rounded-2xl border border-white/8 bg-[#0b1322] p-4 min-w-0" aria-label={t('carrousels.catalogue')}>
            <div className="flex gap-1.5 flex-wrap mb-4" role="group" aria-label={t('carrousels.filtrer')}>
              {FILTRES.map((f) => {
                const n = f === 'miens' && chargementTpl ? '…' : (parFiltre[f] || []).length;
                const on = filtre === f;
                return (
                  <button key={f} type="button" onClick={() => setFiltre(f)} aria-pressed={on} data-testid={`carr-filtre-${f}`}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[13px] transition-colors ${on ? 'bg-[#5B6CFF]/20 border-[#5B6CFF]/60 text-white' : 'border-white/8 text-slate-400 hover:text-slate-200'}`}>
                    {f === 'miens' && <Sparkles className="w-3.5 h-3.5" />}
                    {t(`carrousels.filtres.${f}`)}
                    <span className={`text-[10.5px] px-1.5 rounded-full ${on ? 'bg-[#5B6CFF]/40 text-white' : 'bg-white/[0.06] text-slate-500'}`}>{n}</span>
                  </button>
                );
              })}
            </div>
            {filtre === 'miens' && (
              <p className="text-[12px] text-slate-500 mb-3 -mt-1">{t(miens.length || chargementTpl ? 'carrousels.miensAide' : 'carrousels.miensVide')}</p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3.5">
              {filtre === 'miens' && tuileCreer}
              {templatesVisibles.map((x) => {
                const on = choix === x.id;
                const actuel = saved[activeNet] === x.id;
                return (
                  <button key={x.id} type="button" onClick={() => setSel((p) => ({ ...p, [activeNet]: x.id }))} aria-pressed={on}
                    onDoubleClick={() => setLightbox({ net: activeNet, tpl: x.id })}
                    data-testid={`carr-tpl-${activeNet}-${x.id}`} className="group text-left min-w-0">
                    <div className={`relative aspect-[4/5] rounded-[10px] overflow-hidden border transition-[transform,border-color,box-shadow] duration-150 group-hover:-translate-y-0.5 ${on ? 'border-2 border-[#8A6CFF] shadow-[0_0_0_4px_rgba(106,92,255,.2)]' : 'border-white/8 group-hover:border-white/20'}`}>
                      {couverture(x)}
                      {actuel && <span className="absolute left-1.5 top-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#3AFFA3] text-[#062a1b] shadow">{t('carrousels.actuel')}</span>}
                      {on && <span className="absolute right-1.5 top-1.5 w-[22px] h-[22px] rounded-full grid place-items-center bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF]">{coche}</span>}
                    </div>
                    <div className="flex items-center justify-between gap-1.5 mt-2">
                      <span className={`text-[13px] truncate ${on ? 'text-white font-semibold' : 'text-slate-300'}`}>{x.label}</span>
                      {estPhoto(x.id) && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/[0.08] text-slate-400 shrink-0">{t('carrousels.badgePhoto')}</span>}
                    </div>
                  </button>
                );
              })}
              {filtre === 'tous' && tuileCreer}
            </div>
          </section>

          {/* Aperçu du style choisi, toujours visible sur grand écran */}
          <aside className="hidden lg:block sticky top-4 rounded-2xl border border-white/8 bg-[#0b1322] p-4" aria-live="polite">
            <button type="button" onClick={() => setLightbox({ net: activeNet, tpl: choix })} className="group relative block w-full aspect-[4/5] rounded-xl overflow-hidden border border-white/8" aria-label={t('carrousels.voirSlides')}>
              {couverture(choix)}
              <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors grid place-items-center opacity-0 group-hover:opacity-100"><Maximize2 className="w-6 h-6 text-white" /></span>
            </button>
            <h2 className="font-sora font-bold text-lg text-white mt-3.5">{tplChoisi.label}</h2>
            <p className="text-[13px] text-slate-400 leading-relaxed mt-1">{description(choix)}</p>
            <p className="text-[11.5px] text-slate-500 mt-1.5">{t(`carrousels.${nt.noteKey}`)}</p>
            <div className="grid gap-2 mt-4">
              <button type="button" onClick={appliquer} disabled={!dirty || saving === activeNet} data-testid={`carr-save-${activeNet}`}
                className="rounded-[10px] px-3.5 py-2.5 text-[14px] font-semibold text-white bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] active:scale-[.97] transition-transform disabled:opacity-55 disabled:active:scale-100 flex items-center justify-center gap-2">
                {saving === activeNet && <Loader2 className="w-4 h-4 animate-spin" />}
                {dirty ? t('carrousels.utiliserPour', { reseau: nt.label }) : t('carrousels.dejaUtilise', { reseau: nt.label })}
              </button>
              <button type="button" onClick={() => setLightbox({ net: activeNet, tpl: choix })} className="rounded-[10px] px-3.5 py-2.5 text-[13.5px] font-semibold text-slate-100 border border-white/15 hover:bg-white/[0.04]">{t('carrousels.voirSlides')}</button>
              <button type="button" onClick={() => personnaliser(choix)} className="rounded-[10px] px-3.5 py-2 text-[13px] font-semibold text-[#c3cbff] hover:bg-white/[0.04] flex items-center justify-center gap-1.5"><Palette className="w-4 h-4" />{t('carrousels.personnaliserStyle')}</button>
              {estPerso && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => modifierModele(choix)} disabled={ouvertureEdition === choix} className="flex-1 rounded-[10px] px-3 py-2 text-[12.5px] font-semibold text-[#c3cbff] border border-white/10 hover:bg-white/[0.04] flex items-center justify-center gap-1.5 disabled:opacity-50">
                    {ouvertureEdition === choix ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}{t('carrousels.modifierModele')}
                  </button>
                  <button type="button" onClick={() => supprimerModele(choix)} disabled={suppression === choix} className="rounded-[10px] px-3 py-2 text-rose-300 border border-white/10 hover:bg-rose-500/10 disabled:opacity-50" aria-label={t('carrousels.supprimerModele')}>
                    {suppression === choix ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              )}
            </div>
            <p className="text-[12px] text-slate-500 text-center mt-3">{t('carrousels.noteAppliquer')}</p>
          </aside>

          {/* Mobile : le choix et l'action restent sous le pouce */}
          <div className="lg:hidden fixed left-0 right-0 bottom-0 z-40 flex items-center gap-3 px-4 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom))] bg-[#0f172a]/95 border-t border-white/8 backdrop-blur" aria-live="polite">
            <button type="button" onClick={() => setLightbox({ net: activeNet, tpl: choix })} className="relative w-10 h-[50px] rounded-md overflow-hidden shrink-0 border border-white/10" aria-label={t('carrousels.voirSlides')}>
              {couverture(choix)}
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold text-white truncate">{tplChoisi.label}</div>
              <div className="text-[12px] text-slate-400 truncate">{dirty ? t('carrousels.pourReseau', { reseau: nt.label }) : t('carrousels.actuelSur', { reseau: nt.label })}</div>
            </div>
            <button type="button" onClick={appliquer} disabled={!dirty || saving === activeNet}
              className="rounded-[10px] px-3.5 py-2.5 text-[13.5px] font-semibold text-white bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] disabled:opacity-55 flex items-center gap-1.5">
              {saving === activeNet && <Loader2 className="w-4 h-4 animate-spin" />}{t('carrousels.utiliser')}
            </button>
          </div>
        </div>
      )}

      {creation && createPortal((
        <Suspense fallback={null}>
          <EditeurCarrousel mode="creation" marque={user} apparence={creation.apparence}
            onClose={() => setCreation(null)}
            onSaved={() => { rafraichirModeles(); setFiltre('miens'); }} />
        </Suspense>
      ), document.body)}

      {edition && createPortal((
        <Suspense fallback={null}>
          <EditeurCarrousel mode="modele" modele={edition} marque={user}
            apparence={{ p: colors.p, s: colors.s, a: colors.a }}
            onClose={() => setEdition(null)} onSaved={rafraichirModeles} />
        </Suspense>
      ), document.body)}

      {/* Lightbox */}
      {lightbox && createPortal((
        <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-sm flex flex-col animate-fade-in" onClick={() => setLightbox(null)}>
          <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4" onClick={(e) => e.stopPropagation()}>
            <div className="min-w-0">
              <div className="text-white font-sora font-bold text-base sm:text-lg truncate">{libelle(lightbox.tpl)}</div>
              <div className="text-slate-400 text-xs">{t('carrousels.lightboxHint', { reseau: NETS.find((n) => n.id === lightbox.net)?.label })}</div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {importes.find((x) => x.id === lightbox.tpl)?.perso && (
                <button type="button" onClick={() => modifierModele(lightbox.tpl)} disabled={ouvertureEdition === lightbox.tpl}
                  data-testid="modifier-modele-carrousel"
                  className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-lg text-[#c3cbff] hover:bg-white/10 disabled:opacity-50">
                  {ouvertureEdition === lightbox.tpl ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
                  <span className="hidden sm:inline">{t('carrousels.modifierModele')}</span>
                </button>
              )}
              {importes.find((x) => x.id === lightbox.tpl)?.perso && (
                <button type="button" onClick={() => supprimerModele(lightbox.tpl)} disabled={suppression === lightbox.tpl}
                  data-testid="supprimer-modele-carrousel"
                  className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-lg text-rose-300 hover:bg-rose-500/10 disabled:opacity-50">
                  {suppression === lightbox.tpl ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  <span className="hidden sm:inline">{t('carrousels.supprimerModele')}</span>
                </button>
              )}
              <button type="button" onClick={() => personnaliser(lightbox.tpl)} data-testid="personnaliser-style"
                className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-lg text-[#c3cbff] hover:bg-white/10">
                <Palette className="w-4 h-4" /><span className="hidden sm:inline">{t('carrousels.personnaliserStyle')}</span>
              </button>
              <button onClick={() => { save(lightbox.net); setLightbox(null); }}
                className="hidden sm:block text-[13px] font-semibold px-4 py-2 rounded-lg bg-[#e7ecf5] text-[#0b1322] hover:bg-white">{t('carrousels.enregistrerCeStyle')}</button>
              <button onClick={() => setLightbox(null)} aria-label="Fermer" className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"><X className="w-5 h-5" /></button>
            </div>
          </div>
          <div className="flex-1 overflow-x-auto overflow-y-hidden flex items-center gap-4 sm:gap-6 px-6 sm:px-8 pb-4 sm:pb-8 snap-x snap-mandatory" onClick={(e) => e.stopPropagation()}>
            {renderSlides(lightbox.tpl, colors).map((sl, i) => (
              <div key={i} className="flex-shrink-0 snap-center">
                <div style={{ width: largeurSlide, height: largeurSlide * 1.25, overflow: 'hidden', borderRadius: 16, boxShadow: '0 18px 50px rgba(0,0,0,.5)' }}>
                  <div style={{ transform: `scale(${echelleSlide})`, transformOrigin: 'top left' }} dangerouslySetInnerHTML={{ __html: sl }} />
                </div>
                <div className="text-center text-xs text-white/60 mt-3 font-medium">{SLIDE_LABELS[i] || ''}</div>
              </div>
            ))}
          </div>
          {/* Mobile : le bouton d'enregistrement en bas, pleine largeur, sous le pouce */}
          <div className="sm:hidden px-4 pb-5 pt-1" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { save(lightbox.net); setLightbox(null); }}
              className="w-full text-[14px] font-semibold px-4 py-3 rounded-xl bg-[#e7ecf5] text-[#0b1322] hover:bg-white">{t('carrousels.enregistrerCeStyle')}</button>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}
