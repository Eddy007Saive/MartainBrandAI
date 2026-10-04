import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Check, X, Maximize2, Sparkles, ChevronDown, Trash2, Pencil, Plus, Palette } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation, Trans } from 'react-i18next';
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

const BRAND_DEFAULTS = { p: '#003D2E', s: '#0077FF', a: '#3AFFA3' };

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
  const [styleOuvert, setStyleOuvert] = useState(() => typeof window === 'undefined' || window.innerWidth >= 640);
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

  const [ongletTpl, setOngletTpl] = useState('communs');
  // Si le compte n'a aucun carrousel sur mesure, l'onglet n'a pas lieu d'être.
  // Toujours affichés : l'onglet « Mes carrousels » est aussi l'endroit où créer son modèle.
  const onglets = true;
  const templatesVisibles = useMemo(
    () => (!onglets || ongletTpl === 'communs' ? communs : miens),
    [onglets, ongletTpl, communs, miens]);

  // Le modèle enregistré appartient aux sur-mesure ? on ouvre sur le bon onglet.
  useEffect(() => {
    if (miens.length && miens.some((t) => t.id === saved[activeNet])) setOngletTpl('miens');
  }, [miens, saved, activeNet]);

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

  return (
    <div className="max-w-5xl">
      <style dangerouslySetInnerHTML={{ __html: SLIDE_CSS }} />
      <h1 className="text-2xl font-bold font-sora text-white">{t('carrousels.titre')}</h1>
      <p className="text-sm text-slate-400 font-inter mt-1 mb-5">
        <Trans i18nKey="carrousels.intro" components={{ gras: <span className="text-slate-200" /> }} />
      </p>

      {/* Couleurs propres au carrousel */}
      {cz && (
        <div className="rounded-2xl border border-white/8 bg-[#0b1322] p-4 sm:p-5 mb-5">
          <div className="flex items-start justify-between gap-3">
            <button type="button" onClick={() => setStyleOuvert((o) => !o)} className="flex-1 min-w-0 text-left sm:cursor-default sm:pointer-events-none"
              aria-expanded={styleOuvert} data-testid="carr-style-toggle">
              <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase flex items-center gap-2">
                {t('carrousels.styleDuCarrousel')}
                {czDirty && <span className="w-1.5 h-1.5 rounded-full bg-[#3AFFA3]" />}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">{t('carrousels.styleDescription')}</div>
            </button>
            <button type="button" onClick={() => setStyleOuvert((o) => !o)} aria-label={t('carrousels.styleDuCarrousel')}
              className="sm:hidden w-9 h-9 shrink-0 rounded-lg border border-white/10 grid place-items-center text-slate-400">
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
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-12 justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#5B6CFF]" /> {t('carrousels.chargement')}</div>
      ) : (
        <>
          {/* Onglets réseaux */}
          <div className="flex gap-2 mb-5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {NETS.map((n) => {
              const on = activeNet === n.id;
              return (
                <button key={n.id} onClick={() => setActiveNet(n.id)} data-testid={`carr-tab-${n.id}`}
                  className={`flex items-center gap-2 pl-2 pr-3.5 sm:pr-4 py-2 rounded-xl border transition-all shrink-0 ${on ? 'border-[#5B6CFF] bg-[#5B6CFF]/12 text-white' : 'border-white/8 bg-white/[0.02] text-slate-400 hover:text-white hover:border-white/20'}`}>
                  <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg grid place-items-center text-white flex-shrink-0" style={{ background: n.bg }}>
                    <SocialIcon network={n.id} className="w-3.5 h-3.5" />
                  </span>
                  <span className="font-sora font-semibold text-[13px] sm:text-sm whitespace-nowrap">{n.label}</span>
                  <span className={`text-[11px] text-[#3AFFA3] font-medium whitespace-nowrap ${on ? 'inline' : 'hidden sm:inline'}`}>· {labelOf(saved[n.id])}</span>
                </button>
              );
            })}
          </div>

          {/* Panneau du réseau actif */}
          <div className="rounded-2xl border border-white/8 bg-[#0b1322] p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{t('carrousels.panneauTitre', { reseau: nt.label })}</div>
                <div className="text-xs text-slate-400 mt-0.5">{t(`carrousels.${nt.noteKey}`)}</div>
              </div>
              <button onClick={() => save(activeNet)} disabled={!dirty || saving === activeNet} data-testid={`carr-save-${activeNet}`}
                className={`self-start sm:self-auto shrink-0 text-[13px] font-semibold px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 ${dirty ? 'bg-[#e7ecf5] text-[#0b1322] hover:bg-white' : 'bg-white/5 text-slate-500 cursor-default'}`}>
                {saving === activeNet ? <Loader2 className="w-4 h-4 animate-spin" /> : (!dirty && <Check className="w-4 h-4" />)}
                {!dirty ? t('carrousels.dejaEnregistre') : t('carrousels.enregistrer')}
              </button>
            </div>

            {onglets && (
              <div className="flex gap-1 p-1 mb-4 bg-slate-950/60 rounded-xl border border-white/[0.04] w-fit">
                {[
                  { id: 'communs', label: t('carrousels.ongletModeles'), n: communs.length },
                  { id: 'miens', label: t('carrousels.ongletMiens'), n: chargementTpl ? '…' : miens.length },
                ].map((o) => (
                  <button key={o.id} type="button" onClick={() => setOngletTpl(o.id)}
                    data-testid={`carr-onglet-${o.id}`}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-inter font-medium transition-all ${
                      ongletTpl === o.id ? 'bg-[#5B6CFF]/20 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                    {o.id === 'miens' && <Sparkles className="w-3.5 h-3.5" />}
                    {o.label}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      ongletTpl === o.id ? 'bg-[#5B6CFF]/30 text-white' : 'bg-slate-800 text-slate-500'}`}>{o.n}</span>
                  </button>
                ))}
              </div>
            )}

            {onglets && ongletTpl === 'miens' && (
              <p className="text-[12px] text-slate-500 font-inter mb-3 -mt-1">{t(miens.length || chargementTpl ? 'carrousels.miensAide' : 'carrousels.miensVide')}</p>
            )}

            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3 sm:gap-3.5">
              {ongletTpl === 'miens' && (
                <button type="button" onClick={() => personnaliser(sel[activeNet])} data-testid="carr-creer-modele"
                  className="group rounded-xl p-2 border border-dashed border-[#5B6CFF]/50 bg-[#5B6CFF]/[0.06] hover:bg-[#5B6CFF]/15 transition-colors flex flex-col items-center">
                  <div className="mx-auto w-[140px] h-[175px] sm:w-[176px] sm:h-[220px] rounded-lg grid place-items-center text-center px-3">
                    <div className="flex flex-col items-center gap-2 text-[#c3cbff]">
                      <span className="w-11 h-11 rounded-full bg-[#5B6CFF]/25 grid place-items-center"><Plus className="w-5 h-5" /></span>
                      <span className="text-[12px] leading-snug text-slate-400">{t('carrousels.creerModeleAide', { style: libelle(sel[activeNet]) })}</span>
                    </div>
                  </div>
                  <div className="text-center text-[12.5px] mt-2 text-white font-semibold">{t('carrousels.creerModele')}</div>
                </button>
              )}
              {templatesVisibles.map((t) => {
                const on = sel[activeNet] === t.id;
                const hero = t.vignette ? null : renderSlides(t.id, colors)[0];
                return (
                  <button key={t.id} type="button" onClick={() => { setSel((p) => ({ ...p, [activeNet]: t.id })); setLightbox({ net: activeNet, tpl: t.id }); }}
                    data-testid={`carr-tpl-${activeNet}-${t.id}`}
                    className={`group relative rounded-xl p-2 border transition-all flex flex-col items-center ${on ? 'border-[#5B6CFF] bg-[#5B6CFF]/10' : 'border-white/8 bg-white/[0.015] hover:border-white/25'}`}>
                    <div className="overflow-hidden rounded-lg relative mx-auto w-[140px] h-[175px] sm:w-[176px] sm:h-[220px]">
                      {t.vignette
                        ? <img src={t.vignette} alt="" className="w-full h-full object-cover" />
                        : <div className="origin-top-left scale-[0.70] sm:scale-[0.88]" style={{ width: 200, height: 250 }} dangerouslySetInnerHTML={{ __html: hero }} />}
                      <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <Maximize2 className="w-6 h-6 text-white" />
                      </span>
                    </div>
                    <div className={`text-center text-[12.5px] mt-2 ${on ? 'text-white font-semibold' : 'text-slate-400'}`}>{t.label}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {creation && createPortal((
        <Suspense fallback={null}>
          <EditeurCarrousel mode="creation" marque={user} apparence={creation.apparence}
            onClose={() => setCreation(null)}
            onSaved={() => { rafraichirModeles(); setOngletTpl('miens'); }} />
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
