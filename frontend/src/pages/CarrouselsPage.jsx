import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Check, X, Maximize2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation, Trans } from 'react-i18next';
import { useUser } from '../context/UserContext';
import { userService } from '../services/userService';
import { scheduleService } from '../services/scheduleService';
import { agentService } from '../services/agentService';
import { DEFAULT_SCHEDULE } from '../constants/schedules';
import { SocialIcon } from '../components/SocialIcon';
import { ColorField } from '../components/ColorField';
import { TEMPLATES, SLIDE_LABELS, SLIDE_CSS, renderSlides, CAROUSEL_FONTS, CAROUSEL_BODY_FONTS } from '../lib/carrouselPreview';

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

  // Charge les Google Fonts choisies (pour l'aperçu)
  useEffect(() => {
    [cz?.font, cz?.fontBody].filter(Boolean).forEach((font) => {
      const id = 'czfont-' + font.replace(/\s/g, '-');
      if (document.getElementById(id)) return;
      const l = document.createElement('link');
      l.id = id; l.rel = 'stylesheet';
      l.href = `https://fonts.googleapis.com/css2?family=${font.replace(/\s/g, '+')}:wght@400;500;600;700;800;900&display=swap`;
      document.head.appendChild(l);
    });
  }, [cz?.font, cz?.fontBody]);

  const colors = useMemo(() => ({
    p: cz?.p || brand.p, s: cz?.s || brand.s, a: cz?.a || brand.a, font: cz?.font || '', fontBody: cz?.fontBody || '',
    logo: user?.logo_url, nom: user?.nom || user?.username,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [cz, user]);

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
  useEffect(() => {
    agentService.carrouselTemplates()
      .then((d) => { setAutorises(d?.templates || null); setImportes(d?.importes || []); })
      .catch(() => setAutorises(null));
  }, []);
  const templatesVisibles = useMemo(() => [
    ...TEMPLATES.filter((t) => (autorises ? autorises.includes(t.id) : !t.exclusif)),
    // Un template importé n'a pas d'aperçu JS : il affiche la vignette rendue à l'import.
    ...importes.map((t) => ({ ...t, vignette: t.preview_url })),
  ], [autorises, importes]);

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
      toast.success(t('carrousels.toastStyleEnregistre', { style: labelOf(sel[net]), reseau: NETS.find((n) => n.id === net)?.label }));
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('carrousels.toastEchecEnregistrement'));
    } finally { setSaving(null); }
  };

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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{t('carrousels.styleDuCarrousel')}</div>
              <div className="text-xs text-slate-400 mt-0.5">{t('carrousels.styleDescription')}</div>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
              <button onClick={resetColors} className="text-[12.5px] text-slate-400 hover:text-white px-3 py-2 rounded-lg border border-white/10">{t('carrousels.reinitialiser')}</button>
              <button onClick={saveColors} disabled={!czDirty || savingCz}
                className={`text-[13px] font-semibold px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 ${czDirty ? 'bg-[#e7ecf5] text-[#0b1322] hover:bg-white' : 'bg-white/5 text-slate-500 cursor-default'}`}>
                {savingCz ? <Loader2 className="w-4 h-4 animate-spin" /> : (!czDirty && <Check className="w-4 h-4" />)}
                {czDirty ? t('carrousels.enregistrer') : t('carrousels.dejaEnregistre')}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ColorField label={t('carrousels.couleurPrincipale')} name="p" value={cz.p} onChange={setColor} />
            <ColorField label={t('carrousels.couleurSecondaire')} name="s" value={cz.s} onChange={setColor} />
            <ColorField label={t('carrousels.couleurAccent')} name="a" value={cz.a} onChange={setColor} />
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
            <div>
              <label className="block text-[12px] font-medium text-slate-300 mb-1.5">{t('carrousels.policeDesTitres')}</label>
              <select value={cz.font || ''} onChange={(e) => setColor('font', e.target.value)}
                className="w-full bg-slate-950/60 border border-white/10 text-slate-200 text-sm rounded-lg px-3 py-2 outline-none focus:border-[#5B6CFF]/50">
                {CAROUSEL_FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-slate-300 mb-1.5">{t('carrousels.policeDuTexte')}</label>
              <select value={cz.fontBody || ''} onChange={(e) => setColor('fontBody', e.target.value)}
                className="w-full bg-slate-950/60 border border-white/10 text-slate-200 text-sm rounded-lg px-3 py-2 outline-none focus:border-[#5B6CFF]/50">
                {CAROUSEL_BODY_FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-12 justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#5B6CFF]" /> {t('carrousels.chargement')}</div>
      ) : (
        <>
          {/* Onglets réseaux */}
          <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-2 mb-5">
            {NETS.map((n) => {
              const on = activeNet === n.id;
              return (
                <button key={n.id} onClick={() => setActiveNet(n.id)} data-testid={`carr-tab-${n.id}`}
                  className={`flex items-center justify-center sm:justify-start gap-2 px-2 sm:pl-2 sm:pr-4 py-2 rounded-xl border transition-all min-w-0 ${on ? 'border-[#5B6CFF] bg-[#5B6CFF]/12 text-white' : 'border-white/8 bg-white/[0.02] text-slate-400 hover:text-white hover:border-white/20'}`}>
                  <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg grid place-items-center text-white flex-shrink-0" style={{ background: n.bg }}>
                    <SocialIcon network={n.id} className="w-3.5 h-3.5" />
                  </span>
                  <span className="font-sora font-semibold text-[12.5px] sm:text-sm truncate">{n.label}</span>
                  <span className="hidden sm:inline text-[11px] text-[#3AFFA3] font-medium">· {labelOf(saved[n.id])}</span>
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

            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3 sm:gap-3.5">
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

      {/* Lightbox */}
      {lightbox && createPortal((
        <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-sm flex flex-col animate-fade-in" onClick={() => setLightbox(null)}>
          <div className="flex items-center justify-between px-6 py-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <div className="text-white font-sora font-bold text-lg">{labelOf(lightbox.tpl)}</div>
              <div className="text-slate-400 text-xs">{t('carrousels.lightboxHint', { reseau: NETS.find((n) => n.id === lightbox.net)?.label })}</div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => { save(lightbox.net); setLightbox(null); }}
                className="text-[13px] font-semibold px-4 py-2 rounded-lg bg-[#e7ecf5] text-[#0b1322] hover:bg-white">{t('carrousels.enregistrerCeStyle')}</button>
              <button onClick={() => setLightbox(null)} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"><X className="w-5 h-5" /></button>
            </div>
          </div>
          <div className="flex-1 overflow-x-auto overflow-y-hidden flex items-center gap-6 px-8 pb-8" onClick={(e) => e.stopPropagation()}>
            {renderSlides(lightbox.tpl, colors).map((sl, i) => (
              <div key={i} className="flex-shrink-0">
                <div style={{ width: 340, height: 425, overflow: 'hidden', borderRadius: 16, boxShadow: '0 18px 50px rgba(0,0,0,.5)' }}>
                  <div style={{ transform: 'scale(1.7)', transformOrigin: 'top left' }} dangerouslySetInnerHTML={{ __html: sl }} />
                </div>
                <div className="text-center text-xs text-white/60 mt-3 font-medium">{SLIDE_LABELS[i] || ''}</div>
              </div>
            ))}
          </div>
        </div>
      ), document.body)}
    </div>
  );
}
