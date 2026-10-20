import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { rdvDejaPris } from '../components/PopupRdv';
import { onboardingService } from '../services/onboardingService';
import LangSwitcher from '../components/LangSwitcher';
import Link from '../components/LienLangue';
import './auditMarque.css';

/*
 * Onboarding public (/audit-marque), version « plein écran » : une étape courte par écran,
 * 5 chapitres, et une première étape qui lit le site du client pour pré-remplir ses réponses.
 * Maquette d'origine : _design/onboarding/C-plein-ecran.html.
 *
 * Les réponses gardent le format de l'ancien questionnaire (mêmes ids, radios en slug, onglets
 * en `<champ>_<réseau>`, fichiers en URL Cloudinary) : l'admin et le récapitulatif envoyé à
 * l'équipe ne changent pas.
 */

const MAX_FILE_MB = 5;
const MAX_IMAGES = 6;
const TURNSTILE_SITE_KEY = process.env.REACT_APP_TURNSTILE_SITE_KEY || '1x00000000000000000000AA';
const CLE = 'postorico-audit-marque';
// Une seule analyse de site par visiteur (chaque analyse coûte un appel IA) : le serveur limite
// aussi par adresse IP. Cette clé survit à « Recommencer ».
const CLE_ANALYSE = 'postorico-audit-analyse-faite';
const TABS = ['LinkedIn', 'Instagram', 'Facebook', 'TikTok'];
const LETTRES = 'ABCDEFGHIJ';

/* ---------- SOURCE DE VÉRITÉ : les champs (ids, types) ----------
   Les textes vivent dans les locales sous audit.f.<champ> (label / help / ph / opt.<slug>).
   Les sections servent au récapitulatif envoyé à l'équipe, inchangé. */
const FORM = [
  { id: 'identite', fields: [
    { id: 'marque', type: 'text', req: 1, ph: 1 },
    { id: 'dirigeant', type: 'text', req: 1, ph: 1 },
    { id: 'site', type: 'text', ph: 1 },
    { id: 'secteur', type: 'text', req: 1, help: 1, ph: 1 },
    { id: 'anciennete', type: 'text', ph: 1 },
    { id: 'zone', type: 'text', ph: 1 },
    { id: 'pitch', type: 'textarea', req: 1, help: 1, ph: 1 },
  ] },
  { id: 'offre', fields: [
    { id: 'produits', type: 'textarea', req: 1, ph: 1 },
    { id: 'valeur', type: 'textarea', req: 1, help: 1, ph: 1 },
    { id: 'diff', type: 'textarea', req: 1, help: 1, ph: 1 },
    { id: 'concurrents', type: 'text', help: 1, ph: 1 },
    { id: 'histoire', type: 'textarea', help: 1, ph: 1 },
    { id: 'position', type: 'radio', options: ['premium', 'milieu', 'accessible', 'surmesure'] },
  ] },
  { id: 'cible', fields: [
    { id: 'persona', type: 'textarea', req: 1, help: 1, ph: 1 },
    { id: 'douleurs', type: 'textarea', req: 1, ph: 1 },
    { id: 'desir', type: 'textarea', help: 1, ph: 1 },
    { id: 'objections', type: 'textarea', help: 1, ph: 1 },
    { id: 'vocabulaire', type: 'textarea', help: 1, ph: 1 },
  ] },
  { id: 'voix', fields: [
    { id: 'adresse', type: 'radio', req: 1, options: ['tutoiement', 'vouvoiement', 'depend'] },
    { id: 'adjectifs', type: 'text', req: 1, help: 1, ph: 1 },
    { id: 'langage', type: 'radio', options: ['familier', 'pro', 'expert', 'premium'] },
    { id: 'emojis', type: 'radio', options: ['beaucoup', 'parcimonie', 'jamais'] },
    { id: 'phrases', type: 'radio', options: ['courtes', 'developpees', 'mix'] },
    { id: 'personne', type: 'textarea', help: 1, ph: 1 },
    { id: 'inspirations_ton', type: 'textarea', help: 1, ph: 1 },
  ] },
  { id: 'piliers', fields: [
    { id: 'themes', type: 'textarea', req: 1, help: 1, ph: 1 },
    { id: 'reference', type: 'text', help: 1, ph: 1 },
    { id: 'message', type: 'textarea', help: 1, ph: 1 },
    { id: 'opinions', type: 'textarea', help: 1, ph: 1 },
  ] },
  { id: 'eviter', fields: [
    { id: 'mots_bannis', type: 'textarea', help: 1, ph: 1 },
    { id: 'tons_eviter', type: 'text', ph: 1 },
    { id: 'tabous', type: 'textarea', help: 1, ph: 1 },
    { id: 'promesses', type: 'textarea', help: 1, ph: 1 },
    { id: 'legal', type: 'textarea', help: 1, ph: 1 },
  ] },
  { id: 'hooks', fields: [
    { id: 'hooks_ok', type: 'textarea', help: 1, ph: 1 },
    { id: 'cta', type: 'textarea', help: 1, ph: 1 },
    { id: 'offres_push', type: 'textarea', ph: 1 },
  ] },
  { id: 'regles', fields: [
    { id: 'bible', type: 'textarea', help: 1, ph: 1 },
    { id: 'structure_post', type: 'textarea', help: 1, ph: 1 },
    { id: 'cta_nombre', type: 'radio', options: ['unseul', 'contexte', 'plusieurs'] },
    { id: 'hashtags', type: 'radio', options: ['beaucoup', 'cibles', 'aucun'] },
  ] },
  { id: 'exemples', fields: [
    { id: 'ex_linkedin', type: 'tabs' },
  ] },
  { id: 'reseaux', fields: [
    { id: 'plateformes', type: 'text', req: 1, ph: 1 },
    { id: 'profils', type: 'textarea', help: 1, ph: 1 },
    { id: 'frequence', type: 'radio', options: ['s12', 's34', 'j1', 'jplus'] },
    { id: 'creneaux', type: 'text', ph: 1 },
  ] },
  { id: 'visuel', fields: [
    { id: 'col1', type: 'color', default: '#2B7BFF' },
    { id: 'col2', type: 'color', default: '#0A4FCC' },
    { id: 'col3', type: 'color', default: '#3AFFA3' },
    { id: 'charte', type: 'file', help: 1 },
    { id: 'style_visuel', type: 'textarea', help: 1, ph: 1 },
    { id: 'polices', type: 'text', ph: 1 },
    { id: 'inspis_visuel', type: 'textarea', help: 1, ph: 1 },
    { id: 'visuels_upload', type: 'files', help: 1, helpVars: { max: MAX_IMAGES, mb: MAX_FILE_MB } },
  ] },
  { id: 'objectifs', fields: [
    { id: 'objectif', type: 'radio', req: 1, options: ['notoriete', 'leads', 'vendre', 'recruter', 'tout'] },
    { id: 'succes', type: 'text', ph: 1 },
    { id: 'libre', type: 'textarea', help: 1, ph: 1 },
  ] },
];
const CHAMP = Object.fromEntries(FORM.flatMap((s) => s.fields).map((f) => [f.id, f]));

/* ---------- LE PARCOURS : 5 chapitres, 20 étapes courtes ---------- */
const CHAPITRES = [
  { id: 'marque', etapes: [
    { id: 'site', special: 'prefill', champs: ['site'] },
    { id: 'toi', champs: ['marque', 'dirigeant', 'secteur'] },
    { id: 'entreprise', champs: ['anciennete', 'zone', 'pitch'] },
  ] },
  { id: 'offre', etapes: [
    { id: 'offre', champs: ['produits', 'valeur', 'diff'] },
    { id: 'marche', champs: ['concurrents', 'histoire', 'position'] },
    { id: 'client', champs: ['persona', 'douleurs'] },
    { id: 'tete', champs: ['desir', 'objections', 'vocabulaire'] },
  ] },
  { id: 'voix', etapes: [
    { id: 'parler', champs: ['adresse', 'adjectifs', 'langage'] },
    { id: 'style', champs: ['emojis', 'phrases', 'personne', 'inspirations_ton'] },
    { id: 'sujets', champs: ['themes', 'reference', 'message', 'opinions'] },
    { id: 'rouges', champs: ['mots_bannis', 'tons_eviter', 'tabous'] },
    { id: 'rouges2', champs: ['promesses', 'legal'] },
  ] },
  { id: 'publier', etapes: [
    { id: 'accroches', champs: ['hooks_ok', 'cta', 'offres_push'] },
    { id: 'regles', champs: ['bible', 'structure_post', 'cta_nombre', 'hashtags'] },
    { id: 'exemples', special: 'facultative', champs: ['ex_linkedin'] },
    { id: 'reseaux', champs: ['plateformes', 'profils', 'frequence', 'creneaux'] },
  ] },
  { id: 'image', etapes: [
    { id: 'couleurs', champs: ['col1', 'col2', 'col3', 'charte', 'polices'] },
    { id: 'visuel', champs: ['style_visuel', 'inspis_visuel', 'visuels_upload'] },
    { id: 'objectifs', champs: ['objectif', 'succes', 'libre'] },
    { id: 'envoi', special: 'envoi', champs: [] },
  ] },
];
const STEPS = CHAPITRES.flatMap((c, ci) => c.etapes.map((e, k) => ({ ...e, ch: ci, first: k === 0, idx: k })));
const N = STEPS.length;
// Positions du halo violet selon le chapitre (en % de l'écran)
const HALO = [[18, 12], [82, 22], [74, 84], [14, 72], [52, 38]];
const HALO2 = [[86, 88], [16, 80], [22, 14], [84, 16], [30, 90]];

const couleursParDefaut = () => Object.fromEntries(FORM.flatMap((s) => s.fields).filter((f) => f.type === 'color').map((f) => [f.id, f.default]));
const tabCle = (id, tab) => `${id}_${tab.toLowerCase()}`;
const reduit = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const pointeurFin = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: fine)').matches;

function lireSauvegarde() {
  try { return JSON.parse(localStorage.getItem(CLE) || 'null'); } catch (e) { return null; }
}

/* ---------- Cloudflare Turnstile : un widget par écran qui en a besoin ---------- */
let turnstilePret = null;
function chargerTurnstile() {
  if (window.turnstile) return Promise.resolve();
  if (!turnstilePret) {
    turnstilePret = new Promise((resolve) => {
      let s = document.querySelector('script[data-turnstile]');
      if (!s) {
        s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
        s.async = true; s.defer = true; s.setAttribute('data-turnstile', '1');
        document.head.appendChild(s);
      }
      s.addEventListener('load', () => resolve());
    });
  }
  return turnstilePret;
}
function Turnstile({ onToken }) {
  const ref = useRef(null);
  const rappel = useRef(onToken);
  rappel.current = onToken;
  useEffect(() => {
    let id = null;
    let vivant = true;
    chargerTurnstile().then(() => {
      if (!vivant || !ref.current || !window.turnstile) return;
      id = window.turnstile.render(ref.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'dark',
        callback: (tk) => rappel.current(tk),
        'expired-callback': () => rappel.current(''),
        'error-callback': () => rappel.current(''),
      });
    });
    return () => {
      vivant = false;
      rappel.current('');
      try { if (id != null && window.turnstile) window.turnstile.remove(id); } catch (e) { /* noop */ }
    };
  }, []);
  return <div ref={ref} className="ts" />;
}

const IcoCheck = (p) => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m3.5 8.5 3 3 6-7" /></svg>;
const IcoUp = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4m0 0-5 5m5-5 5 5M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>;
const IcoX = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="m3 3 6 6M9 3l-6 6" /></svg>;
const IcoDown = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m4 6 4 4 4-4" /></svg>;
const IcoBack = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3 5 8l5 5" /></svg>;
const IcoErr = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="8" cy="8" r="6.5" /><path d="M8 4.8v3.6M8 11h.01" strokeLinecap="round" /></svg>;

export default function AuditMarque() {
  const { t, i18n } = useTranslation();
  const tc = useCallback((k, o) => t(`audit.c.${k}`, o), [t]);
  const sauve = useMemo(lireSauvegarde, []);

  const [answers, setAnswers] = useState(() => ({ ...couleursParDefaut(), ...(sauve?.answers || {}) }));
  const [pre, setPre] = useState(() => sauve?.pre || {});           // champs pré-remplis depuis le site
  const [site, setSite] = useState(() => (sauve?.site === 'done' ? 'done' : 'idle')); // idle | scanning | done | error
  const [siteMsg, setSiteMsg] = useState('');
  const [trouves, setTrouves] = useState(() => sauve?.trouves || []); // ids lus sur le site (dans l'ordre)
  const [email, setEmail] = useState(() => sauve?.email || '');
  const [dejaAnalyse, setDejaAnalyse] = useState(() => { try { return !!localStorage.getItem(CLE_ANALYSE); } catch (e) { return false; } });
  const [repriseA] = useState(() => (typeof sauve?.step === 'number' ? sauve.step : -1));
  const [cur, setCur] = useState(-1);          // -1 accueil, 0..N-1 étapes, N confirmation
  const [sens, setSens] = useState(1);
  const [chap, setChap] = useState(null);       // { ci, sortie } pendant l'écran de chapitre
  const [errs, setErrs] = useState({});         // { champ: n } (n change à chaque secousse)
  const [tabSel, setTabSel] = useState({});
  const [uploading, setUploading] = useState({});
  const [retourRecap, setRetourRecap] = useState(false);
  const [ouverts, setOuverts] = useState({ 0: true });
  const [tsSite, setTsSite] = useState('');
  const [tsSiteCle, setTsSiteCle] = useState(0); // remonte le widget (jeton à usage unique)
  const [tsEnvoi, setTsEnvoi] = useState('');
  const [tsEnvoiCle, setTsEnvoiCle] = useState(0);
  const [envoi, setEnvoi] = useState(false);
  const [modal, setModal] = useState(null);     // { recap } si l'envoi automatique échoue
  const [copie, setCopie] = useState(false);
  const hpRef = useRef('');
  const vpRef = useRef(null);
  const chapFin = useRef(null);

  const val = (id) => { const v = answers[id]; return typeof v === 'string' ? v.trim() : ''; };
  const repondu = useCallback((f) => {
    const a = answers;
    if (f.type === 'tabs') return TABS.some((tb) => (a[tabCle(f.id, tb)] || '').trim());
    if (f.type === 'files') return (a[f.id] || []).length > 0;
    if (f.type === 'file') return !!a[f.id];
    const v = a[f.id];
    return v != null && String(v).trim() !== '';
  }, [answers]);

  /* ---------- sauvegarde locale ---------- */
  useEffect(() => {
    try {
      localStorage.setItem(CLE, JSON.stringify({ answers, pre, site: site === 'done' ? 'done' : 'idle', trouves, email, step: cur >= 0 && cur < N ? cur : (cur === N ? -1 : repriseA) }));
    } catch (e) { /* stockage indisponible : on continue sans */ }
  }, [answers, pre, site, trouves, email, cur, repriseA]);

  /* ---------- temps restant (honnête : 20 s par réponse courte, 45 s par texte libre) ---------- */
  const poids = (f) => ((f.type === 'textarea' || f.type === 'tabs') ? 45 : 20);
  const restant = (de) => {
    let s = 0;
    for (let k = Math.max(0, de); k < N; k++) STEPS[k].champs.forEach((id) => { const f = CHAMP[id]; if (f.type !== 'color' && !repondu(f)) s += poids(f); });
    return s;
  };
  const minutes = (s) => tc('ui.minutes', { n: Math.max(1, Math.round(s / 60)) });

  const setVal = (id, v) => {
    setAnswers((a) => ({ ...a, [id]: v }));
    if (pre[id]) setPre((p) => { const n = { ...p }; delete n[id]; return n; });
    if (errs[id]) setErrs((e) => { const n = { ...e }; delete n[id]; return n; });
  };

  /* ---------- uploads (logo / images) vers Cloudinary, avec limites ---------- */
  const televerser = async (f, liste) => {
    const multiple = f.type === 'files';
    let files = Array.from(liste || []);
    if (!files.length) return;
    if (multiple) {
      const place = MAX_IMAGES - (answers[f.id] || []).length;
      if (place <= 0) { toast.error(t('audit.ui.maxImages', { n: MAX_IMAGES })); return; }
      if (files.length > place) { toast.error(t('audit.ui.maxImagesTronque', { n: MAX_IMAGES, room: place })); files = files.slice(0, place); }
    } else files = files.slice(0, 1);
    const ok = files.filter((file) => {
      if (!file.type.startsWith('image/')) { toast.error(t('audit.ui.pasImage', { name: file.name })); return false; }
      if (file.size > MAX_FILE_MB * 1024 * 1024) { toast.error(t('audit.ui.tropGros', { name: file.name, mb: MAX_FILE_MB })); return false; }
      return true;
    });
    if (!ok.length) return;
    setUploading((u) => ({ ...u, [f.id]: true }));
    try {
      for (const file of ok) {
        const { url } = await onboardingService.uploadAsset(file, f.id === 'charte' ? 'logo' : 'image');
        if (multiple) setAnswers((a) => ({ ...a, [f.id]: [...(a[f.id] || []), url] }));
        else setVal(f.id, url);
      }
    } catch (e) {
      toast.error(e?.response?.status === 429 ? t('audit.ui.trop429') : t('audit.ui.uploadEchec'));
    } finally {
      setUploading((u) => ({ ...u, [f.id]: false }));
    }
  };
  const retirerFichier = (f, url) => {
    if (f.type === 'files') setAnswers((a) => ({ ...a, [f.id]: (a[f.id] || []).filter((u) => u !== url) }));
    else setAnswers((a) => { const n = { ...a }; delete n[f.id]; return n; });
  };

  /* ---------- lecture du site ---------- */
  const marquerAnalyse = () => { setDejaAnalyse(true); try { localStorage.setItem(CLE_ANALYSE, '1'); } catch (e) { /* noop */ } };
  const hote = () => (val('site') || '').replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  const analyser = async () => {
    const url = val('site');
    if (!url) { setErrs({ site: Date.now() }); return; }
    if (dejaAnalyse) return;
    if (!tsSite) { toast.error(t('audit.ui.robot')); return; }
    setSite('scanning'); setSiteMsg(''); setTrouves([]);
    try {
      const r = await onboardingService.analyserSite(url, tsSite);
      const champs = r?.champs || {};
      const appliques = [];
      const maj = {};
      Object.entries(champs).forEach(([id, v]) => {
        const f = CHAMP[id];
        if (!f || id === 'site' || v == null || v === '') return;
        const actuel = answers[id];
        const vide = f.type === 'color' ? (!actuel || actuel === f.default) : (actuel == null || String(actuel).trim() === '');
        if (!vide) return;
        if (f.type === 'radio' && !f.options.includes(v)) return;
        maj[id] = f.type === 'files' ? [].concat(v) : String(v);
        appliques.push(id);
      });
      setAnswers((a) => ({ ...a, ...maj, ...(r?.url ? { site: r.url } : {}) }));
      setPre((p) => ({ ...p, ...Object.fromEntries(appliques.map((id) => [id, true])) }));
      setTrouves(appliques);
      marquerAnalyse();
      setSite(appliques.length ? 'done' : 'error');
      if (!appliques.length) setSiteMsg(tc('ui.rienTrouve'));
    } catch (e) {
      const st = e?.response?.status;
      const msg = e?.response?.data?.message || e?.response?.data?.detail;
      setSite('error');
      if (st === 429 || st === 422) marquerAnalyse();
      setSiteMsg(st === 403 ? t('audit.ui.antibot') : st === 429 ? t('audit.ui.trop429')
        : (st === 400 || st === 422) ? (typeof msg === 'string' ? msg : tc('ui.rienTrouve')) : tc('ui.analyseEchec'));
    } finally {
      setTsSite(''); setTsSiteCle((k) => k + 1); // le jeton anti-robot ne sert qu'une fois
    }
  };

  /* ---------- récapitulatif pour l'équipe : toujours en français ---------- */
  const construireRecap = () => {
    const tf = i18n.getFixedT('fr');
    const lignes = [];
    const sep = '═══════════════════════════════════════════';
    lignes.push(sep, 'AUDIT DE MARQUE : ONBOARDING POSTORICO', 'Marque : ' + (val('marque') || '—'), 'Date : ' + new Date().toLocaleDateString('fr-FR'));
    if (trouves.length) lignes.push(`Pré-rempli depuis le site (${val('site')}) : ${trouves.map((id) => tf(`audit.f.${id}.label`)).join(', ')}`);
    lignes.push(sep);
    FORM.forEach((sec, i) => {
      lignes.push('', `### ${String(i + 1).padStart(2, '0')} · ${tf(`audit.sec.${sec.id}.title`).toUpperCase()}`);
      sec.fields.forEach((f) => {
        const label = tf(`audit.f.${f.id}.label`);
        if (f.type === 'tabs') TABS.forEach((tb) => { const v = val(tabCle(f.id, tb)); if (v) lignes.push(`• Exemples ${tb} :\n${v}`); });
        else if (f.type === 'file') { if (answers[f.id]) lignes.push(`• ${label} : ${answers[f.id]}`); }
        else if (f.type === 'files') { const arr = answers[f.id] || []; if (arr.length) lignes.push(`• ${label} (${arr.length}) :\n${arr.join('\n')}`); }
        else if (f.type === 'radio') { const v = val(f.id); if (v) lignes.push(`• ${label} : ${tf(`audit.f.${f.id}.opt.${v}`)}`); }
        else { const v = val(f.id); if (v) lignes.push(`• ${label} : ${v}`); }
      });
    });
    lignes.push('', sep, 'Fin du récapitulatif.');
    return lignes.join('\n');
  };

  /* ---------- navigation ---------- */
  const aller = useCallback((n, dir) => {
    setErrs({});
    setSens(dir);
    const nouveauChapitre = dir > 0 && n >= 0 && n < N && STEPS[n].first && (cur < 0 || STEPS[cur]?.ch !== STEPS[n].ch);
    if (nouveauChapitre && !reduit()) {
      setChap({ ci: STEPS[n].ch, sortie: false });
      let fini = false;
      const fin = () => {
        if (fini) return; fini = true; chapFin.current = null;
        setChap((c) => c && { ...c, sortie: true });
        setTimeout(() => { setChap(null); setCur(n); }, 260);
      };
      chapFin.current = fin;
      setTimeout(fin, 1200);
      return;
    }
    setCur(n);
  }, [cur]);

  const valider = (st) => {
    const manque = st.champs.filter((id) => CHAMP[id].req && !repondu(CHAMP[id]));
    if (!manque.length) return true;
    const n = Date.now();
    setErrs(Object.fromEntries(manque.map((id) => [id, n])));
    setTimeout(() => {
      const el = vpRef.current?.querySelector(`[data-qid="${manque[0]}"]`);
      if (el) { el.scrollIntoView({ block: 'center', behavior: reduit() ? 'auto' : 'smooth' }); const f = el.querySelector('.inp, .tile'); if (f) f.focus({ preventScroll: true }); }
    }, 30);
    return false;
  };

  const envoyer = async () => {
    const m = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m)) { setErrs({ email: Date.now() }); return; }
    if (!tsEnvoi) { toast.error(t('audit.ui.robot')); return; }
    setEnvoi(true);
    const recap = construireRecap();
    try {
      await onboardingService.submitAudit({ marque: val('marque') || 'Sans nom', email: m, answers: { ...answers, email: m }, recap, _hp: hpRef.current, cf_turnstile_token: tsEnvoi });
      rdvDejaPris();   // il vient de convertir : plus rien à lui proposer
      try { localStorage.removeItem(CLE); } catch (e) { /* noop */ }
      setCur(N); setSens(1);
    } catch (e) {
      if (e?.response?.status === 403) toast.error(t('audit.ui.antibot'));
      else setModal({ recap });
    } finally {
      setEnvoi(false);
      setTsEnvoi(''); setTsEnvoiCle((k) => k + 1);
    }
  };

  const suivant = () => {
    if (chap) return;
    if (cur === -1) return aller(0, 1);
    if (cur < 0 || cur >= N) return;
    const st = STEPS[cur];
    if (st.special === 'prefill') {
      if (site === 'scanning') return;
      if (val('site') && site !== 'done' && site !== 'error' && !dejaAnalyse) return analyser();
    }
    if (st.special === 'envoi') return envoyer();
    if (!valider(st)) return;
    if (retourRecap) { setRetourRecap(false); return aller(N - 1, 1); }
    aller(cur + 1, 1);
  };
  const precedent = () => {
    if (chap || cur <= 0 || cur >= N) return;
    setRetourRecap(false);
    aller(cur - 1, -1);
  };

  /* ---------- clavier : Entrée = suivant, Échap = retour, A-J = choix ---------- */
  const clavier = useRef(null);
  clavier.current = (e) => {
    if (chapFin.current) { if (!['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) { e.preventDefault(); chapFin.current(); } return; }
    if (modal) return;
    const cible = e.target;
    const tag = cible.tagName;
    const saisie = tag === 'TEXTAREA' || (tag === 'INPUT' && !['color', 'file'].includes(cible.type));
    if (e.key === 'Escape') { if (cur > 0 && cur < N) { e.preventDefault(); precedent(); } return; }
    if (e.key === 'Enter') {
      if (tag === 'BUTTON' || tag === 'A') return;
      if (tag === 'TEXTAREA' && !cible.dataset.single && !(e.ctrlKey || e.metaKey)) return;
      if (cur === N) return;
      e.preventDefault();
      if (cible.dataset.q === 'site') { if (val('site') && site !== 'done' && !dejaAnalyse) analyser(); else suivant(); return; }
      if (saisie && !(e.ctrlKey || e.metaKey) && vpRef.current) {
        const champs = Array.from(vpRef.current.querySelectorAll('.inp'));
        const prochain = champs.slice(champs.indexOf(cible) + 1).find((c) => !c.value.trim() && !c.dataset.hex);
        if (prochain) { prochain.focus({ preventScroll: true }); prochain.scrollIntoView({ block: 'center', behavior: reduit() ? 'auto' : 'smooth' }); return; }
      }
      suivant();
      return;
    }
    if (saisie || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[a-j]$/i.test(e.key) && cur >= 0 && cur < N && vpRef.current) {
      const tuile = vpRef.current.querySelector(`.tile[data-key="${e.key.toUpperCase()}"]`);
      if (tuile) { e.preventDefault(); tuile.click(); tuile.focus({ preventScroll: true }); }
    }
  };
  useEffect(() => {
    const h = (e) => clavier.current(e);
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  /* ---------- après chaque changement d'écran : hauteur des zones de texte + focus ---------- */
  const ajuster = (el) => { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px`; };
  useLayoutEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    vp.querySelectorAll('textarea').forEach(ajuster);
    vp.scrollTop = 0;
    if (pointeurFin() && cur >= 0 && cur < N) {
      const tmr = setTimeout(() => {
        const vide = Array.from(vp.querySelectorAll('.inp')).find((x) => !x.value);
        if (vide && document.activeElement === document.body) vide.focus({ preventScroll: true });
      }, 330);
      return () => clearTimeout(tmr);
    }
    return undefined;
  }, [cur, tabSel]);

  /* ---------- rendu d'une question ---------- */
  const tete = (f, pour) => (
    <>
      <div className="lab">
        <label htmlFor={pour}>{t(`audit.f.${f.id}.label`)}</label>
        {f.req ? <span className="req">{tc('ui.requis')}</span> : null}
        {pre[f.id] ? <span className="pre">{tc('ui.luSurSite')}</span> : null}
      </div>
      {f.help ? <p className="aide">{t(`audit.f.${f.id}.help`, f.helpVars || {})}</p> : null}
    </>
  );
  const erreur = <div className="err-msg" role="alert"><IcoErr /><span>{tc('ui.erreurRequis')}</span></div>;
  const classeQ = (f, d) => ({
    className: `q rise${pre[f.id] ? ' is-pre' : ''}${errs[f.id] ? ' has-err shake' : ''}`,
    style: { '--d': d },
    'data-qid': f.id,
  });

  const question = (f, ctx) => {
    const d = ctx.d++;
    const id = `f_${f.id}`;
    if (f.type === 'text' || f.type === 'textarea') {
      const ph = f.ph ? t(`audit.f.${f.id}.ph`) : '';
      return (
        <div key={`${f.id}-${errs[f.id] || 0}`} {...classeQ(f, d)}>
          {tete(f, id)}
          <div className="field">
            <textarea className={`inp${f.type === 'text' ? ' single' : ''}`} id={id} data-q={f.id} data-single={f.type === 'text' ? '1' : undefined}
              rows={f.type === 'text' ? 1 : Math.max(2, ph.split('\n').length)} placeholder={ph} autoComplete="off"
              value={answers[f.id] || ''}
              onChange={(e) => { let v = e.target.value; if (f.type === 'text') v = v.replace(/[\r\n]+/g, ' '); setVal(f.id, v); ajuster(e.target); }} />
          </div>
          {erreur}
        </div>
      );
    }
    if (f.type === 'radio') {
      const labels = f.options.map((o) => t(`audit.f.${f.id}.opt.${o}`));
      return (
        <div key={`${f.id}-${errs[f.id] || 0}`} {...classeQ(f, d)}>
          {tete(f)}
          <div className={`tiles n${f.options.length}${Math.max(...labels.map((l) => l.length)) > 16 ? ' long' : ''}`} role="radiogroup" aria-label={t(`audit.f.${f.id}.label`)}>
            {f.options.map((o, k) => {
              const lettre = LETTRES[ctx.l++];
              const on = answers[f.id] === o;
              return (
                <button type="button" key={o} className={`tile${on ? ' on' : ''}`} role="radio" aria-checked={on} data-key={lettre}
                  onClick={() => setVal(f.id, o)}>
                  <span className="key">{lettre}</span><span className="t">{labels[k]}</span><span className="ck"><IcoCheck /></span>
                </button>
              );
            })}
          </div>
          {erreur}
        </div>
      );
    }
    if (f.type === 'color') {
      const v = answers[f.id] || f.default;
      return (
        <div key={`${f.id}-${errs[f.id] || 0}`} {...classeQ(f, d)}>
          {tete(f, id)}
          <div className="sw-row">
            <label className="sw" style={{ background: v }}>
              <input type="color" value={/^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : '#000000'} aria-label={t(`audit.f.${f.id}.label`)}
                onChange={(e) => setVal(f.id, e.target.value.toUpperCase())} />
            </label>
            <div className="field">
              <input className="inp" id={id} data-hex="1" type="text" maxLength={7} spellCheck={false} value={(answers[f.id] ?? '').toUpperCase()}
                placeholder={f.default}
                onChange={(e) => { let x = e.target.value.trim(); if (x && x[0] !== '#') x = `#${x}`; setVal(f.id, x.toUpperCase()); }} />
            </div>
          </div>
        </div>
      );
    }
    if (f.type === 'file' || f.type === 'files') {
      const multi = f.type === 'files';
      const liste = multi ? (answers[f.id] || []) : (answers[f.id] ? [answers[f.id]] : []);
      const plein = multi && liste.length >= MAX_IMAGES;
      return (
        <div key={`${f.id}-${errs[f.id] || 0}`} {...classeQ(f, d)}>
          {tete(f)}
          {!plein && (
            <label className={`drop${uploading[f.id] ? ' busy' : ''}`}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('over'); }}
              onDragLeave={(e) => e.currentTarget.classList.remove('over')}
              onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('over'); televerser(f, e.dataTransfer.files); }}>
              <IcoUp />
              <div>
                <b>{uploading[f.id] ? t('audit.ui.envoi') : tc(multi ? 'ui.deposerImages' : 'ui.deposerLogo')}</b>
                <span>{tc('ui.ouChoisir')}{multi ? ` · ${liste.length}/${MAX_IMAGES}` : ''}</span>
              </div>
              <input className="sr" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" multiple={multi} disabled={!!uploading[f.id]}
                onChange={(e) => { televerser(f, e.target.files); e.target.value = ''; }} />
            </label>
          )}
          {liste.length > 0 && (
            <div className="chips">
              {liste.map((url) => (
                <span className="chip" key={url}>
                  <img src={url} alt="" />
                  <em>{decodeURIComponent(url.split('/').pop() || '').slice(0, 40)}</em>
                  <button type="button" aria-label={t('audit.ui.retirer')} onClick={() => retirerFichier(f, url)}><IcoX /></button>
                </span>
              ))}
            </div>
          )}
        </div>
      );
    }
    if (f.type === 'tabs') {
      const sel = tabSel[f.id] || TABS[0];
      const cle = tabCle(f.id, sel);
      return (
        <div key={`${f.id}-${errs[f.id] || 0}`} {...classeQ(f, d)}>
          {tete(f, 'f_tab')}
          <div className="tabs" role="tablist">
            {TABS.map((tb) => (
              <button type="button" key={tb} role="tab" aria-selected={tb === sel}
                className={`tab${tb === sel ? ' on' : ''}${(answers[tabCle(f.id, tb)] || '').trim() ? ' filled' : ''}`}
                onClick={() => setTabSel((s) => ({ ...s, [f.id]: tb }))}>{tb}<span className="fd" /></button>
            ))}
          </div>
          <div className="tabpane">
            <div className="field">
              <textarea className="inp" id="f_tab" key={cle} data-q={cle} rows={8} placeholder={t('audit.ui.tabsPh', { reseau: sel })}
                value={answers[cle] || ''} onChange={(e) => { setVal(cle, e.target.value); ajuster(e.target); }} />
            </div>
          </div>
          <p className="tabhint">{tc('ui.tabsAide')}</p>
        </div>
      );
    }
    return null;
  };

  /* ---------- écrans ---------- */
  const accueil = () => {
    const reprise = repriseA >= 0 && repriseA < N;
    return (
      <div className="inner wl"><div className="col wide"><div className="hero">
        <div>
          <div className="brand rise" style={{ '--d': 0 }}>
            <Link to="/" className="brand-lien"><img src="/logo.png" alt="" />Postorico</Link>
            <span className="brand-lang"><LangSwitcher /></span>
          </div>
          <h1 className="h rise" style={{ '--d': 1 }}>{tc('ui.accueilTitre')}</h1>
          <p className="intro rise" style={{ '--d': 2 }}>{tc('ui.accueilIntro')}</p>
          <ul className="facts rise" style={{ '--d': 3 }}>
            <li><b>{CHAPITRES.length}</b>{tc('ui.chapitres')}</li>
            <li><b>{N}</b>{tc('ui.etapes')}</li>
            <li><b>{minutes(restant(0))}</b>{tc('ui.auMax')}</li>
          </ul>
          <div className="cta-row rise" style={{ '--d': 4 }}>
            {reprise ? (
              <>
                <button className="btn btn-p" type="button" onClick={() => aller(repriseA, 1)}>{tc('ui.reprendre', { n: repriseA + 1 })}<span className="kbd">{tc('ui.entree')} ↵</span></button>
                <button className="btn btn-g" type="button" onClick={() => {
                  try { localStorage.removeItem(CLE); } catch (e) { /* noop */ }
                  setAnswers(couleursParDefaut()); setPre({}); setSite('idle'); setTrouves([]); setEmail(''); aller(0, 1);
                }}>{tc('ui.recommencer')}</button>
              </>
            ) : (
              <button className="btn btn-p" type="button" onClick={() => aller(0, 1)}>{tc('ui.commencer')}<span className="kbd">{tc('ui.entree')} ↵</span></button>
            )}
          </div>
          <p className="note rise" style={{ '--d': 5 }}>{tc('ui.enregistre')}</p>
        </div>
        <div className="rico rise" style={{ '--d': 2 }}><img src="/images/mascotte.png" alt={tc('ui.rico')} /></div>
      </div></div></div>
    );
  };

  const fin = () => (
    <div className="inner done wl"><div className="col wide"><div className="hero">
      <div>
        <div className="kicker rise" style={{ '--d': 0 }}>{tc('ui.termine')}</div>
        <h1 className="h rise" style={{ '--d': 1 }}>{t('audit.ui.okTitre')}.</h1>
        <p className="intro rise" style={{ '--d': 2 }}>{t('audit.ui.okBody')}</p>
        <div className="cta-row rise" style={{ '--d': 3 }}><Link className="btn btn-g" to="/">{tc('ui.retourAccueil')}</Link></div>
      </div>
      <div className="rico rise" style={{ '--d': 1 }}><img src="/images/mascotte.png" alt={tc('ui.rico')} /></div>
    </div></div></div>
  );

  const etapeSite = (st) => {
    const f = CHAMP.site;
    const fait = site === 'done';
    const enCours = site === 'scanning';
    const montrerZone = enCours || fait;
    return (
      <div className={`inner site${montrerZone ? ' compact' : ''}`}><div className="col">
        <div className="site-head">
          <h1 className="h rise" style={{ '--d': 0 }}>{tc(`etape.${st.id}.titre`)}</h1>
          <p className="intro rise" style={{ '--d': 1 }}>{tc(`etape.${st.id}.intro`)}</p>
        </div>
        <label className="url-lab rise" style={{ '--d': 2 }} htmlFor="f_site">{t('audit.f.site.label')}</label>
        <div className={`url rise${errs.site ? ' shake' : ''}`} key={`url-${errs.site || 0}`} style={{ '--d': 2 }}>
          <div className="field">
            <input className="inp" id="f_site" data-q="site" type="url" inputMode="url" autoComplete="url" spellCheck={false}
              placeholder={f.ph ? t('audit.f.site.ph') : ''} value={answers.site || ''} disabled={enCours}
              onChange={(e) => { setVal('site', e.target.value); if (site !== 'scanning') { setSite('idle'); setSiteMsg(''); } }} />
          </div>
          {!fait && !(dejaAnalyse && !enCours) && (
            <button className="btn btn-p" type="button" onClick={analyser} disabled={enCours || !val('site')}>
              {enCours ? tc('ui.analyseEnCours') : tc('ui.analyser')}
            </button>
          )}
        </div>
        {/* Anti-robot avant l'analyse seulement ; « Relancer » le fait réapparaître. */}
        {!enCours && !fait && !dejaAnalyse && <div className="ts-wrap rise" style={{ '--d': 3 }}><Turnstile key={tsSiteCle} onToken={setTsSite} /></div>}
        {dejaAnalyse && !fait && !enCours && site !== 'error' && <p className="found-note rise" style={{ maxWidth: 760, margin: '22px auto 0' }}>{tc('ui.dejaAnalyse')}</p>}
        {!montrerZone && site !== 'error' && !dejaAnalyse && (
          <button className="skip-site rise" style={{ '--d': 3 }} type="button" onClick={() => { setVal('site', ''); aller(cur + 1, 1); }}>{tc('ui.pasDeSite')}</button>
        )}
        {site === 'error' && <p className="found-note err rise" role="alert">{siteMsg}</p>}
        {montrerZone && (
          <div className={`scan${enCours ? ' scanning' : ''}`}>
            <div className="scan-l">
              <div className="mini" style={{ '--mh': '300px' }}>
                <div className="mini-bar"><i /><i /><i /><span className="mini-url">{hote()}</span></div>
                <div className="mini-body">
                  <div className={`mb m-nav${fait ? ' read' : ''}`}><b /><span /><span /><span /></div>
                  <div className={`mb m-hero${fait ? ' read' : ''}`}><div className="l"><span /><span /><span /></div><div className="img" /></div>
                  <div className={`mb m-cards${fait ? ' read' : ''}`}><div /><div /><div /></div>
                  <div className={`mb m-sw${fait ? ' read' : ''}`}>
                    {['col1', 'col2', 'col3'].map((k) => <span key={k} style={{ background: pre[k] ? answers[k] : '#1e293b' }} />)}
                  </div>
                  <div className={`mb m-foot${fait ? ' read' : ''}`} />
                </div>
                <div className="sweep" />
              </div>
              {fait && <p className="found-note"><b>{tc('ui.prerempli', { n: trouves.length })}</b> {tc('ui.prerempliAide')}</p>}
            </div>
            <div>
              <div className="found-h">
                {enCours ? <><span className="pulse" />{tc('ui.lecture', { host: hote() })}</> : <><IcoCheck width="18" height="18" style={{ color: 'var(--mint)' }} />{tc('ui.analyseFinie')}</>}
              </div>
              <ul className="found">
                {trouves.map((id, k) => {
                  const fc = CHAMP[id];
                  let v = answers[id];
                  if (fc.type === 'radio') v = t(`audit.f.${id}.opt.${v}`);
                  if (fc.type === 'files' || fc.type === 'file') v = [].concat(v || []).length ? '✓' : '';
                  return (
                    <li key={id} style={{ animationDelay: `${k * 90}ms` }}>
                      <IcoCheck />
                      <span className="k">{t(`audit.f.${id}.label`)}</span>
                      <span className="v">{fc.type === 'color' && <span className="s" style={{ background: answers[id] }} />}{String(v || '').replace(/\n/g, ' · ')}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </div></div>
    );
  };

  const reponseRecap = (f) => {
    const a = answers;
    if (f.type === 'tabs') {
      const parts = TABS.filter((tb) => (a[tabCle(f.id, tb)] || '').trim()).map((tb) => `${tb} : ${a[tabCle(f.id, tb)].trim()}`);
      return parts.length ? <dd>{parts.join('\n\n')}</dd> : <dd className="empty">{tc('ui.nonRenseigne')}</dd>;
    }
    if (f.type === 'radio') return a[f.id] ? <dd>{t(`audit.f.${f.id}.opt.${a[f.id]}`)}</dd> : <dd className="empty">{tc('ui.nonRenseigne')}</dd>;
    if (f.type === 'color') { const v = a[f.id] || f.default; return <dd><span className="s" style={{ background: v }} />{String(v).toUpperCase()}{a[f.id] && a[f.id] !== f.default ? '' : ` ${tc('ui.parDefaut')}`}</dd>; }
    if (f.type === 'file' || f.type === 'files') {
      const liste = [].concat(a[f.id] || []);
      return liste.length ? <dd className="thumbs">{liste.map((u) => <img key={u} src={u} alt="" />)}</dd> : <dd className="empty">{tc('ui.aucunFichier')}</dd>;
    }
    return repondu(f) ? <dd>{a[f.id]}</dd> : <dd className="empty">{tc('ui.nonRenseigne')}</dd>;
  };

  const etapeEnvoi = (st) => (
    <div className="inner"><div className="col">
      <h1 className="h rise" style={{ '--d': 0 }}>{tc(`etape.${st.id}.titre`)}</h1>
      <p className="intro rise" style={{ '--d': 1 }}>{tc(`etape.${st.id}.intro`)}</p>
      <div className="acc">
        {CHAPITRES.map((c, ci) => {
          const etapes = STEPS.map((s, k) => [s, k]).filter(([s]) => s.ch === ci && s.champs.length);
          let tot = 0; let ok = 0;
          etapes.forEach(([s]) => s.champs.forEach((id) => { tot++; if (repondu(CHAMP[id]) || CHAMP[id].type === 'color') ok++; }));
          const ouvert = !!ouverts[ci];
          return (
            <div className={`acc-i rise${ouvert ? ' open' : ''}`} style={{ '--d': 3 + ci }} key={c.id}>
              <button className="acc-h" type="button" aria-expanded={ouvert} onClick={() => setOuverts((o) => ({ ...o, [ci]: !o[ci] }))}>
                <span className="n">0{ci + 1}</span><span className="t">{tc(`chap.${c.id}`)}</span>
                <span className="c">{tc('ui.reponses', { ok, tot })}</span><IcoDown />
              </button>
              <div className="acc-b"><div>
                {etapes.map(([s, k]) => (
                  <div className="rs" key={s.id}>
                    <div className="rs-h"><b>{tc(`etape.${s.id}.titre`)}</b>
                      <button type="button" onClick={() => { setRetourRecap(true); aller(k, -1); }}>{tc('ui.modifier')}</button>
                    </div>
                    <dl style={{ margin: 0 }}>
                      {s.champs.map((id) => <div className="ra" key={id}><dt>{t(`audit.f.${id}.label`)}</dt>{reponseRecap(CHAMP[id])}</div>)}
                    </dl>
                  </div>
                ))}
              </div></div>
            </div>
          );
        })}
      </div>
      <div className={`q mail rise${errs.email ? ' has-err shake' : ''}`} key={`mail-${errs.email || 0}`} style={{ '--d': 9 }} data-qid="email">
        <div className="lab"><label htmlFor="f_email">{t('audit.ui.emailLabel')}</label><span className="req">{tc('ui.requis')}</span></div>
        <div className="field">
          <input className="inp" id="f_email" type="email" autoComplete="email" placeholder={t('audit.ui.emailPh')} value={email}
            onChange={(e) => { setEmail(e.target.value); if (errs.email) setErrs({}); }} />
        </div>
        <div className="err-msg" role="alert"><IcoErr /><span>{email.trim() ? tc('ui.emailInvalide') : tc('ui.emailVide')}</span></div>
      </div>
      <div className="ts-wrap"><Turnstile key={tsEnvoiCle} onToken={setTsEnvoi} /></div>
      <div className="saved only-m">{tc('ui.enregistre')}</div>
    </div></div>
  );

  const etape = (i) => {
    const st = STEPS[i];
    if (st.special === 'prefill') return etapeSite(st);
    if (st.special === 'envoi') return etapeEnvoi(st);
    const ctx = { d: 2, l: 0 };
    const champs = st.champs.map((id) => CHAMP[id]);
    const couleurs = champs.filter((f) => f.type === 'color');
    const autres = champs.filter((f) => f.type !== 'color');
    return (
      <div className="inner"><div className="col">
        <h1 className="h rise" style={{ '--d': 0 }}>{tc(`etape.${st.id}.titre`)}</h1>
        {st.special === 'facultative' && <p className="intro rise" style={{ '--d': 1 }}>{tc(`etape.${st.id}.intro`)}</p>}
        <div className="qs">
          {couleurs.length > 0 && <div className="colors">{couleurs.map((f) => question(f, ctx))}</div>}
          {autres.map((f) => (couleurs.length
            ? <div className="q-sep" key={`sep-${f.id}`}>{question(f, ctx)}</div>
            : <Fragment key={`fr-${f.id}`}>{question(f, ctx)}</Fragment>))}
        </div>
        <div className="saved only-m rise" style={{ '--d': ctx.d }}>{tc('ui.enregistre')}</div>
      </div></div>
    );
  };

  /* ---------- habillage ---------- */
  const dansEtape = cur >= 0 && cur < N;
  const st = dansEtape ? STEPS[cur] : null;
  const chIdx = chap ? chap.ci : st ? st.ch : cur >= N ? 4 : 0;
  const derive = st ? st.idx * 3 : 0;
  const h1 = HALO[chIdx]; const h2 = HALO2[chIdx];
  const r = dansEtape ? restant(cur) : 0;
  let libelleSuivant = tc('ui.continuer');
  let suivantDesactive = false;
  if (st?.special === 'prefill') {
    if (site === 'scanning') { libelleSuivant = tc('ui.analyseEnCours'); suivantDesactive = true; }
    else if (site === 'done') libelleSuivant = tc('ui.verifier');
    else if (val('site') && site !== 'error' && !dejaAnalyse) libelleSuivant = tc('ui.analyser');
  }
  if (st?.special === 'envoi') { libelleSuivant = envoi ? t('audit.ui.envoi') : t('audit.ui.envoyer'); suivantDesactive = envoi; }
  else if (retourRecap) libelleSuivant = tc('ui.retourRecap');

  const chapInfo = (ci) => {
    let s = 0;
    STEPS.filter((x) => x.ch === ci).forEach((x) => x.champs.forEach((id) => { const f = CHAMP[id]; if (f.type !== 'color' && !repondu(f)) s += poids(f); }));
    return `${tc('ui.chapEtapes', { n: CHAPITRES[ci].etapes.length })} · ${s ? minutes(s) : tc('ui.dejaRempli')}`;
  };

  return (
    <div className={`obc-root${chap ? ' chrome-off' : ''}`}>
      <div id="halo" style={{ transform: `translate3d(${h1[0] + derive}vw,${h1[1] + derive / 2}vh,0)` }} />
      <div id="halo2" style={{ transform: `translate3d(${h2[0] - derive}vw,${h2[1]}vh,0)` }} />

      {/* piège à robots (invisible) */}
      <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hp"
        onChange={(e) => { hpRef.current = e.target.value; }} />

      <header className="top" style={{ visibility: dansEtape ? 'visible' : 'hidden' }}>
        <div className="bar"><i style={{ width: `${cur >= N ? 100 : dansEtape ? ((cur + 1) / N) * 100 : 0}%` }} /></div>
        {st && (
          <div className="top-row">
            <Link to="/" aria-label="Postorico"><img src="/logo.png" alt="" /></Link>
            <div className="counter" aria-live="polite">
              {tc('ui.chapitre', { n: st.ch + 1 })}<span className="dot">·</span><b>{tc(`chap.${CHAPITRES[st.ch].id}`)}</b>
              <span className="dot">—</span>{cur + 1}/{N}
            </div>
            <div className="eta">{r <= 0 ? tc('ui.presqueFini') : <>{minutes(r)}<span className="long"> {tc('ui.restant')}</span></>}</div>
          </div>
        )}
      </header>

      <main className="vp" ref={vpRef}>
        <section key={cur} className={`stage ${sens >= 0 ? 'enter-below' : 'enter-above'}${chap ? ' cache' : ''}`} aria-live="polite">
          {cur === -1 ? accueil() : cur >= N ? fin() : etape(cur)}
        </section>
      </main>

      <nav className="nav" style={{ visibility: dansEtape ? 'visible' : 'hidden' }}>
        <button className="btn btn-g" id="back" type="button" onClick={precedent} disabled={cur <= 0} title={`${tc('ui.precedent')} (Échap)`}>
          <IcoBack /><span>{tc('ui.precedent')}</span>
        </button>
        <div className="saved">{tc('ui.enregistre')}</div>
        <div className="spacer only-m" />
        {st?.special === 'facultative' && <button className="btn btn-t" type="button" onClick={() => aller(cur + 1, 1)}>{tc('ui.passer')}</button>}
        <button className="btn btn-p" type="button" onClick={suivant} disabled={suivantDesactive} data-testid="audit-suivant">
          <span>{libelleSuivant}</span><span className="kbd">{tc('ui.entree')} ↵</span>
        </button>
      </nav>

      {chap && (
        <div className={`chap on${chap.sortie ? ' out' : ''}`} role="dialog" aria-label={tc(`chap.${CHAPITRES[chap.ci].id}`)} onClick={() => chapFin.current && chapFin.current()}>
          <div className="chap-in">
            <div className="chap-k"><span>{tc('ui.chapitre', { n: `0${chap.ci + 1}` })}</span><span className="rule" /><span className="of">{tc('ui.sur', { n: `0${CHAPITRES.length}` })}</span></div>
            <h2 className="chap-t">
              {tc(`chap.${CHAPITRES[chap.ci].id}`).split(' ').map((w, k) => (
                <Fragment key={k}><span className="w"><span style={{ transitionDelay: `${k * 70}ms`, animationDelay: `${k * 70}ms` }}>{w}</span></span>{' '}</Fragment>
              ))}
            </h2>
            <div className="chap-meta">
              <div className="segs">{CHAPITRES.map((c, k) => <i key={c.id} className={k < chap.ci ? 'd' : k === chap.ci ? 'c' : ''} />)}</div>
              <span>{chapInfo(chap.ci)}</span>
            </div>
          </div>
          <button className="chap-skip" type="button">{tc('ui.passer')} <span className="kbd">↵</span></button>
        </div>
      )}

      {modal && (
        <div className="obc-modal" onClick={(e) => { if (e.currentTarget === e.target) setModal(null); }}>
          <div className="obc-modal-in" role="dialog" aria-modal="true">
            <h3>{t('audit.ui.fallbackTitre')}</h3>
            <p>{t('audit.ui.fallbackBody')}</p>
            <textarea readOnly value={modal.recap} />
            <div className="obc-modal-actions">
              <button className="btn btn-g" type="button" onClick={() => {
                const m = (val('marque') || 'marque').replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([modal.recap], { type: 'text/plain' }));
                a.download = `audit_marque_${m}.txt`; a.click();
              }}>{t('audit.ui.telecharger')}</button>
              <button className="btn btn-p" type="button" onClick={() => {
                navigator.clipboard.writeText(modal.recap).then(() => { setCopie(true); setTimeout(() => setCopie(false), 1800); }).catch(() => {});
              }}>{copie ? t('audit.ui.copie') : t('audit.ui.copier')}</button>
            </div>
            <button className="obc-modal-x" type="button" aria-label={t('audit.ui.fermer')} onClick={() => setModal(null)}><IcoX /></button>
          </div>
        </div>
      )}
    </div>
  );
}
