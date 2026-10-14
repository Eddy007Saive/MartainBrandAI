import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Video, Upload, Loader2, Sparkles, Check, AlertCircle, Wand2, Music, Film, ArrowRight, ScrollText, ChevronDown, Play, Pause, Info, Scissors, Type, Smile, X, Clapperboard, ImagePlus, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { videoService } from '../services/videoService';
import { contenuService } from '../services/contenuService';
import { agentVideoService } from '../services/agentVideoService';
import { videoTropLongue } from '../lib/dureeVideo';
import { dureeVoix, texteParle } from '../lib/texteParle';

const LANGUES = [
  { id: 'fr', label: 'Français' },
  { id: 'en', label: 'Anglais' },
  { id: 'es', label: 'Espagnol' },
];

const RESEAUX = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'facebook', label: 'Facebook' },
];

// Les 12 presets RÉELS de Studio Montage (miroir de PRESETS côté
// submagic-poc/pipeline.py) — remplacent les 45 templates Submagic.
// `name` = clé preset envoyée telle quelle à /video/create (`template`).
const HL = '#3AFFA3';
const FONT_CSS = {
  'Arial Black': { css: '"Arial Black", sans-serif', w: 900 },
  'Segoe UI Black': { css: '"Segoe UI Black", "Segoe UI", sans-serif', w: 900 },
  Verdana: { css: 'Verdana, sans-serif', w: 700 },
  Impact: { css: 'Impact, sans-serif', w: 400 },
  'Trebuchet MS': { css: '"Trebuchet MS", sans-serif', w: 700 },
  Georgia: { css: 'Georgia, serif', w: 700 },
  Bahnschrift: { css: 'Bahnschrift, sans-serif', w: 700 },
};
const CAP_OUTLINE = '-2px 0 0 #000, 2px 0 0 #000, 0 -2px 0 #000, 0 2px 0 #000, -1px -1px 0 #000, 1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000';
const SUB_COLORS = ['#3AFFA3', '#FFD84D', '#FF5C8A', '#00D1FF', '#B18CFF', '#FF8A00'];
const rangePct = (v, min, max) => `${((v - min) / (max - min)) * 100}%`;
const tok = (t, hl) => (t === 'hl' ? (hl || HL) : t === 'white' ? '#fff' : '#000');
// overrides : { font, hl } — utilisé pour l'aperçu en direct sur la vidéo (police/couleur
// choisies dans "Style avancé"), sinon la police/couleur par défaut du preset.
function presetPreviewStyle(tp, overrides = {}) {
  const f = FONT_CSS[overrides.font || tp.font] || FONT_CSS['Arial Black'];
  const style = { fontFamily: f.css, fontWeight: f.w, color: tok(tp.primary, overrides.hl), fontStyle: tp.italic ? 'italic' : 'normal', textShadow: 'none' };
  if (tp.glow) { const g = tok(tp.glow, overrides.hl); style.textShadow = `0 0 6px ${g}, 0 0 14px ${g}, 0 0 26px ${g}`; }
  else if (tp.shad) style.textShadow = `${CAP_OUTLINE}, 4px 4px 0 #000`;
  else if (!tp.box) style.textShadow = CAP_OUTLINE;
  if (tp.box) { style.background = tok(tp.box, overrides.hl); style.padding = '2px 7px'; style.borderRadius = '5px'; style.display = 'inline-block'; }
  return style;
}
// `active` : comportement du mot en cours de lecture (aperçu karaoké) — hl = couleur
// d'accent, white = blanc, scale/pop = agrandi. Miroir de submagic-poc/index.html PRESETS.
const TEMPLATES = [
  { name: 'classic', label: 'Classic', font: 'Arial Black', primary: 'white', box: null, glow: null, shad: 0, italic: 0, active: 'hl', html: 'ton message' },
  { name: 'hormozi', label: 'Hormozi', font: 'Segoe UI Black', primary: 'white', box: null, glow: 'black', shad: 0, italic: 0, active: 'hl', html: 'PLUS DE <span class="cap-hl">MARGE</span>' },
  { name: 'neon', label: 'Néon', font: 'Segoe UI Black', primary: 'white', box: null, glow: 'hl', shad: 0, italic: 0, active: 'white', html: 'IMPACT' },
  { name: 'leon', label: 'Leon', font: 'Arial Black', primary: 'white', box: 'hl', glow: null, shad: 0, italic: 0, active: 'scale', html: 'le secret' },
  { name: 'molly', label: 'Molly', font: 'Verdana', primary: 'black', box: 'white', glow: null, shad: 0, italic: 0, active: 'hl', html: 'douceur' },
  { name: 'caleb', label: 'Caleb', font: 'Arial Black', primary: 'white', box: 'black', glow: null, shad: 0, italic: 0, active: 'hl', html: 'clair, net' },
  { name: 'william', label: 'William', font: 'Arial Black', primary: 'hl', box: null, glow: null, shad: 0, italic: 0, active: 'white', html: 'ton style' },
  { name: 'beast', label: 'Beast', font: 'Impact', primary: 'white', box: null, glow: null, shad: 1, italic: 0, active: 'hl', html: 'INCROYABLE' },
  { name: 'duo', label: 'Duo', font: 'Trebuchet MS', primary: 'white', box: null, glow: null, shad: 0, italic: 0, active: 'pop', html: 'énergie' },
  { name: 'noah', label: 'Noah', font: 'Segoe UI Black', primary: 'white', box: null, glow: null, shad: 0, italic: 1, active: 'hl', html: 'authentique' },
  { name: 'brandin', label: 'Brandin', font: 'Georgia', primary: 'white', box: null, glow: null, shad: 0, italic: 0, active: 'hl', html: 'élégance' },
  { name: 'bahn', label: 'Bahn', font: 'Bahnschrift', primary: 'white', box: null, glow: null, shad: 1, italic: 0, active: 'hl', html: 'moderne' },
];
const CAPTION_WORDS = ['PRÊT', 'À', 'TOUT', 'CHANGER', '?'];
const TABS = [
  { id: 'hook', labelKey: 'video.tabs.hook' },
  { id: 'captions', labelKey: 'video.tabs.captions' },
  { id: 'style', labelKey: 'video.tabs.style' },
  { id: 'montage', labelKey: 'video.tabs.montage' },
  { id: 'music', labelKey: 'video.tabs.music' },
];

export default function StudioVideo() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const contenuId = params.get('contenu_id');

  const [options, setOptions] = useState({ templates: [], music: [], music_categories: [] });
  const [draft, setDraft] = useState(null);        // contenu-script chargé
  // Depuis un script « À tourner » : première question « tu as quoi ? ». 'facecam' = ce studio
  // (sous-titres, coupes) ; les photos/clips partent vers le Studio Reel (Séquence, Remotion).
  const [choix, setChoix] = useState(null);
  const [scriptOpen, setScriptOpen] = useState(true);
  const [file, setFile] = useState(null);
  const [localUrl, setLocalUrl] = useState(null);  // aperçu local (blob) — pas d'upload avant « Monter »
  const [uploadPct, setUploadPct] = useState(0);
  const [step, setStep] = useState('idle');        // idle|ready|processing|done|error
  const [form, setForm] = useState({ template: 'hormozi', langue: 'fr', zooms: true, music: 'none' });
  const [brolls, setBrolls] = useState(true);
  const [brollPct, setBrollPct] = useState(45);
  const [brollMode, setBrollMode] = useState('ai');  // 'ai' (banque Pexels) | 'custom' (clips importés)
  const [brollClips, setBrollClips] = useState([]);  // [{name, url, uploading, error}]
  const [silencePace, setSilencePace] = useState('off'); // off | natural | fast | extra-fast
  const [cleanAudio, setCleanAudio] = useState(false);
  const [volume, setVolume] = useState(25);
  const [customId, setCustomId] = useState(null);  // thème/preset perso sélectionné
  // Hook d'ouverture (le hook reprend toujours le style des sous-titres, cf. montage_poc_service.py)
  const [hookAuto, setHookAuto] = useState(false);
  const [hookText, setHookText] = useState('');
  const [hookPosition, setHookPosition] = useState('top');
  const [hookSize, setHookSize] = useState(100);
  const [hookSuggestions, setHookSuggestions] = useState([]);
  const [hookLoading, setHookLoading] = useState(false);
  const [hookStatus, setHookStatus] = useState('');
  const [emojis, setEmojis] = useState(false);
  // Style avancé des sous-titres (au-delà du preset)
  const [subFont, setSubFont] = useState('Arial Black');
  const [subColor, setSubColor] = useState(HL);
  const [subSize, setSubSize] = useState(100);
  const [subPosition, setSubPosition] = useState(30);
  const [subUppercase, setSubUppercase] = useState(true);
  const [tab, setTab] = useState('hook');           // hook|captions|style|montage|music — onglets des réglages
  const [mode, setMode] = useState('montage');     // 'montage' (Submagic) | 'agent' (agent IA du VPS) | 'direct' (import tel quel)
  const [agentConsignes, setAgentConsignes] = useState('');
  const [agentFormat, setAgentFormat] = useState('9:16');
  const [agentDuree, setAgentDuree] = useState(60);
  const [agentIllustrations, setAgentIllustrations] = useState(true);
  const [agentLogo, setAgentLogo] = useState(true);
  const [agentImages, setAgentImages] = useState([]);  // photos de la banque : [{url, description}]
  const [agentSource, setAgentSource] = useState('video');  // 'video' (sa vidéo) | 'motion' (sans tournage)
  const [agentScript, setAgentScript] = useState('');
  const [agentVoix, setAgentVoix] = useState(null);
  const motionActif = mode === 'agent' && agentSource === 'motion';
  // Voix plus longue que la durée choisie : l'agent devrait couper et accélérer, on bloque avant
  const voixTropLongue = motionActif && dureeVoix(agentScript) > agentDuree * 1.15;
  const [agentEtat, setAgentEtat] = useState(null);  // dernier état renvoyé par /agent-video/:id
  const [maintenant, setMaintenant] = useState(Date.now());
  const [reseaux, setReseaux] = useState(['instagram']);  // multi-réseaux → 1 carte contenu par réseau
  const [asStory, setAsStory] = useState(false);          // story 24h (Instagram/Facebook) au lieu de Reel
  const [result, setResult] = useState(null);
  const [playing, setPlaying] = useState(null);    // id de la piste en cours d'écoute
  const [musicCat, setMusicCat] = useState(null);  // catégorie de musique ouverte (menu 2 niveaux)
  const [stage, setStage] = useState(null);        // étape Submagic (processing|transcribing|exporting)
  const pollRef = useRef(null);
  const audioRef = useRef(null);
  const [activeWord, setActiveWord] = useState(0);  // aperçu karaoké en direct
  const currentTemplate = TEMPLATES.find((tp) => tp.name === form.template) || TEMPLATES[0];

  useEffect(() => {
    const id = setInterval(() => setActiveWord((i) => (i + 1) % CAPTION_WORDS.length), 550);
    return () => clearInterval(id);
  }, []);

  const togglePlay = (m) => {
    const a = audioRef.current;
    if (!a || !m.url) return;
    if (playing === m.id) { a.pause(); setPlaying(null); return; }
    a.src = m.url; a.currentTime = 0;
    a.play().then(() => setPlaying(m.id)).catch(() => setPlaying(null));
  };
  const stopPreview = () => { if (audioRef.current) audioRef.current.pause(); setPlaying(null); };
  const selMusic = options.music.find((m) => m.id === form.music) || null;  // piste choisie (menu musique)

  useEffect(() => {
    if (contenuId) return;
    let enCours = null;
    try { enCours = JSON.parse(localStorage.getItem(CLE_AGENT_EN_COURS) || 'null'); } catch { /* rien à reprendre */ }
    if (!enCours?.id) return;
    setMode('agent'); setAgentSource(enCours.motion ? 'motion' : 'video'); setStep('processing');
    suivreAgent(enCours.id, enCours.motion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    videoService.getOptions().then(setOptions).catch(() => {});
    if (contenuId) {
      contenuService.getById(contenuId)
        .then((c) => {
          setDraft(c);
          if (c.langue) setForm((f) => ({ ...f, langue: c.langue }));
          if (c.reseau_cible) setReseaux([String(c.reseau_cible).toLowerCase()]);
          // Montée par l'agent IA : on reprend son montage (résultat + corrections, ou suivi en cours)
          if (c.reel_data?.agent) {
            agentVideoService.parContenu(contenuId).then((e) => {
              setMode('agent'); setAgentSource(e.mode === 'motion' ? 'motion' : 'video'); setAgentEtat(e);
              if (e.statut === 'termine') { setResult(resultatAgent(e)); setStep('done'); }
              else if (e.statut === 'echec') setStep('error');
              else { setStep('processing'); suivreAgent(e.id, e.mode === 'motion'); }
            }).catch(() => { if (c.video_url) { setResult(c); setStep('done'); } });
            return;
          }
          if (c.video_status === 'pret' && c.video_url) { setResult(c); setStep('done'); }
          else if (c.video_status === 'en_traitement') { setStep('processing'); startPolling(contenuId); }
        })
        .catch(() => {});
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contenuId]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onFile = async (f) => {
    if (!f) return;
    if (!f.type.startsWith('video/')) { toast.error(t('video.fileType')); return; }
    if (f.size > 300 * 1024 * 1024) { toast.error(t('video.fileTooBig')); return; }
    const tropLongue = await videoTropLongue(f);
    if (tropLongue) { toast.error(tropLongue); return; }
    if (localUrl) URL.revokeObjectURL(localUrl);
    setFile(f);
    setLocalUrl(URL.createObjectURL(f));   // aperçu LOCAL : rien n'est envoyé tant qu'on ne monte pas
    setStep('ready');
    setHookSuggestions([]); setHookStatus('');  // suggestions de la vidéo précédente, plus valables
  };

  const MAX_BROLL_CLIPS = 8;  // même plafond que HARD_CAP côté submagic-poc
  const onBrollFiles = (files) => {
    const list = Array.from(files || []).filter((f) => f.type.startsWith('video/'));
    const room = MAX_BROLL_CLIPS - brollClips.length;
    list.slice(0, room).forEach((f) => {
      const entry = { name: f.name, url: null, uploading: true, error: false };
      setBrollClips((prev) => [...prev, entry]);
      videoService.uploadRaw(f).then((up) => {
        setBrollClips((prev) => prev.map((c) => (c === entry ? { ...c, url: up.video_url, uploading: false } : c)));
      }).catch(() => {
        setBrollClips((prev) => prev.map((c) => (c === entry ? { ...c, uploading: false, error: true } : c)));
      });
    });
  };
  const removeBrollClip = (idx) => setBrollClips((prev) => prev.filter((_, i) => i !== idx));

  const startPolling = (cid) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const s = await videoService.status(cid);
        if (s.stage) setStage(s.stage);
        if (s.video_status === 'pret') { clearInterval(pollRef.current); setResult(s); setStep('done'); }
        else if (s.video_status === 'echec') { clearInterval(pollRef.current); setStep('error'); }
      } catch { /* retry next tick */ }
    }, 6000);
  };

  // Montage par l'agent IA : on suit l'état toutes les 10 s (15 à 25 min de montage).
  // L'id est gardé dans le navigateur : en revenant sur la page, le suivi reprend.
  const suivreAgent = (id, motion = motionActif) => {
    if (pollRef.current) clearInterval(pollRef.current);
    try { localStorage.setItem(CLE_AGENT_EN_COURS, JSON.stringify({ id, motion })); } catch { /* navigation privée */ }
    const oublier = () => { try { localStorage.removeItem(CLE_AGENT_EN_COURS); } catch { /* idem */ } };
    const tick = async () => {
      try {
        const e = await agentVideoService.etat(id);
        setAgentEtat(e);
        setMaintenant(Date.now());
        if (e.statut === 'termine') {
          clearInterval(pollRef.current); oublier();
          setResult(resultatAgent(e));
          setStep('done');
        } else if (e.statut === 'echec') { clearInterval(pollRef.current); oublier(); setStep('error'); }
      } catch (err) {
        // Montage introuvable (supprimé, autre compte) : on arrête de le suivre
        if (err?.response?.status === 404) { clearInterval(pollRef.current); oublier(); setStep('idle'); }
      }
    };
    tick();
    pollRef.current = setInterval(tick, 10000);
  };

  // Progression approximative (Submagic renvoie des ÉTAPES, pas un %) : upload puis étapes.
  const progress = () => {
    if (uploadPct > 0 && uploadPct < 100) return { pct: Math.round(uploadPct * 0.2), label: t('video.progress.sending', { pct: uploadPct }) };
    const map = {
      processing: { pct: 35, label: t('video.progress.analyzing') },
      transcribing: { pct: 60, label: t('video.progress.transcribing') },
      exporting: { pct: 88, label: t('video.progress.exporting') },
    };
    return map[stage] || { pct: 25, label: t('video.progress.preparing') };
  };

  const suggestHooks = async () => {
    if (!file) return;
    setHookLoading(true); setHookStatus(t('video.hook.transcribing'));
    try {
      const { hooks } = await videoService.suggestHooks(file);
      setHookSuggestions(hooks || []);
      setHookStatus(hooks?.length ? t('video.hook.choose') : t('video.hook.none'));
    } catch (e) {
      setHookStatus(e?.response?.data?.detail || t('video.hook.error'));
    } finally {
      setHookLoading(false);
    }
  };

  // Réglages communs au montage par l'agent et au motion design
  const reglagesAgent = () => ({
    consignes: agentConsignes.trim() || undefined,
    reseau: reseaux[0],
    format: agentFormat,
    duree_max_s: agentDuree,
    illustrations: agentIllustrations,
    logo: agentLogo,
    images: agentImages,
    musique: form.music !== 'none' ? form.music : undefined,
    musique_volume: form.music !== 'none' ? Math.max(5, volume) : undefined,
  });

  const lancer = async () => {
    if (!file && !motionActif) return;
    stopPreview();
    setStep('processing'); setResult(null); setUploadPct(0);
    try {
      if (motionActif) {
        // Sans tournage : pas d'envoi de vidéo, Postorico crée la voix off du texte
        setAgentEtat(null);
        const d = await agentVideoService.creer({ mode: 'motion', script: agentScript.trim(), voix: agentVoix || undefined, ...reglagesAgent() });
        suivreAgent(d.id);
        return;
      }
      // Upload MAINTENANT (pas à la sélection) → aucun orphelin si l'utilisateur abandonne avant.
      const up = await videoService.uploadRaw(file, setUploadPct);
      const titre = draft?.titre || file?.name?.replace(/\.[^.]+$/, '') || t('video.defaultTitle');
      if (mode === 'direct') {
        // Import tel quel : pas de Submagic, pas de quota.
        await videoService.importVideo({ video_url: up.video_url, contenu_id: contenuId || undefined, titre, reseaux, as_story: asStory });
        setResult({ video_url: up.video_url }); setStep('done');
        return;
      }
      if (mode === 'agent') {
        setAgentEtat(null);
        const d = await agentVideoService.creer({ clips: [{ url: up.video_url }], ...reglagesAgent() });
        suivreAgent(d.id);
        return;
      }
      const d = await videoService.create({
        video_url: up.video_url,
        raw_public_id: up.public_id,
        contenu_id: contenuId || undefined,
        titre, reseaux,
        custom: customId || undefined,
        template: customId ? undefined : form.template,
        langue: form.langue,
        brolls: brolls && (brollMode === 'ai' || brollClips.some((c) => c.url)),
        broll_pct: brolls ? brollPct : undefined,
        broll_urls: brolls && brollMode === 'custom' ? brollClips.filter((c) => c.url).map((c) => c.url) : undefined,
        zooms: form.zooms,
        silence_pace: silencePace === 'off' ? undefined : silencePace,
        clean_audio: cleanAudio,
        music: form.music, music_volume: volume,
        hook: hookAuto ? '' : hookText.trim(),
        hook_auto: hookAuto,
        hook_position: hookPosition,
        hook_fontscale: hookSize / 100,
        emojis,
        font: subFont,
        hl_color: subColor,
        fontscale: subSize / 100,
        position: subPosition / 100,
        uppercase: subUppercase,
      });
      startPolling(d.contenu_id);
    } catch (e) {
      setStep('ready');
      const msg = e.response?.data?.detail || e.response?.data?.message;
      if (e.response?.status === 402) toast.error(msg || t('video.proOnly'));
      else if (mode === 'agent' && [502, 503].includes(e.response?.status)) toast.error(msg || t('video.agent.indispo'));
      else toast.error(msg || t('video.startError'));
    }
  };

  // Correction d'un montage de l'agent : même suivi que le montage, la nouvelle version remplace l'ancienne
  const corriger = async (consignes, images, musique) => {
    try {
      await agentVideoService.corriger(result.travailId, {
        consignes: consignes || undefined, images,
        ...(musique ? { musique: musique.id, musique_volume: musique.id !== 'none' ? musique.volume : undefined } : {}),
      });
      const travailId = result.travailId;
      setAgentEtat(null); setResult(null); setUploadPct(0); setStep('processing');
      suivreAgent(travailId);
    } catch (e) {
      toast.error(e.response?.data?.message || e.response?.data?.detail || t('video.agent.correctionErreur'));
    }
  };

  const reset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (localUrl) URL.revokeObjectURL(localUrl);
    setFile(null); setLocalUrl(null); setUploadPct(0); setStep('idle'); setResult(null); setAgentEtat(null);
  };

  // Vidéo déjà montée : (re)définit le(s) réseau(x) sans re-montage (réutilise l'import,
  // pas de quota), puis renvoie vers Contenus pour valider & publier.
  const [publishing, setPublishing] = useState(false);
  const publishMontaged = async () => {
    const cid = contenuId || result?.id;
    if (!reseaux.length || !result?.video_url || !cid) return;
    setPublishing(true);
    try {
      await videoService.importVideo({ contenu_id: cid, video_url: result.video_url, titre: result.titre || draft?.titre, reseaux, as_story: asStory });
      toast.success(t('video.networksSaved'));
      navigate('/dashboard/contenus');
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('video.networksError'));
    } finally {
      setPublishing(false);
    }
  };

  // Sélecteur de musique (catégories, écoute, volume), commun au montage IA et à l'agent IA
  const choixMusique = (
    <>
      <div className="sv-lab"><Music className="w-[15px] h-[15px] text-[#8A6CFF]" />{t('video.music.label')}</div>
      <p className="sv-hint">{t('video.music.hint')}</p>
      {/* Niveau 1 : Aucune + catégories */}
      <div className="flex gap-2 flex-wrap">
        <div onClick={() => { set('music', 'none'); setMusicCat(null); stopPreview(); }}
          className={`sv-chip cursor-pointer ${form.music === 'none' ? 'on' : ''}`}>{t('video.music.none')}</div>
        {(options.music_categories || []).map((c) => {
          const open = musicCat === c.id;
          const hasSel = selMusic && selMusic.category === c.id;
          return (
            <div key={c.id} onClick={() => { setMusicCat(open ? null : c.id); stopPreview(); }}
              className={`sv-chip cursor-pointer flex items-center gap-1.5 ${open || hasSel ? 'on' : ''}`}>
              {c.label}{hasSel ? <span className="text-[#3AFFA3]">· {selMusic.label}</span> : null}
              <ChevronDown className={`w-3 h-3 opacity-70 transition-transform ${open ? 'rotate-180' : ''}`} />
            </div>
          );
        })}
      </div>
      {/* Niveau 2 : pistes de la catégorie ouverte */}
      {musicCat && (
        <div className="mt-2.5 flex gap-2 flex-wrap rounded-xl border border-white/[0.07] bg-[#0c111f] p-2.5">
          {options.music.filter((m) => m.category === musicCat).map((m) => (
            <div key={m.id} onClick={() => set('music', m.id)}
              className={`sv-chip flex items-center gap-1.5 cursor-pointer ${form.music === m.id ? 'on' : ''}`}>
              {m.url && (
                <button type="button" aria-label={t('video.music.listen')} onClick={(e) => { e.stopPropagation(); togglePlay(m); }}
                  className="w-5 h-5 -ml-0.5 rounded-full flex items-center justify-center hover:bg-white/15 transition-colors">
                  {playing === m.id ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                </button>
              )}
              {m.label}
            </div>
          ))}
        </div>
      )}
      <audio ref={audioRef} onEnded={() => setPlaying(null)} className="hidden" />
      {form.music !== 'none' && (
        <div className="mt-3.5">
          <div className="flex justify-between items-baseline mb-1.5"><span className="text-[12px] text-slate-400">{t('video.music.volume')}</span><span className="font-sora font-bold text-sm text-[#3AFFA3]">{volume} %</span></div>
          <input type="range" min="0" max="100" value={volume} onChange={(e) => setVolume(+e.target.value)} style={{ '--pct': `${volume}%` }} />
        </div>
      )}
    </>
  );

  return (
    <div className="sv max-w-5xl mx-auto space-y-5">
      <style>{CSS}</style>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] flex items-center justify-center">
          <Video className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold font-sora text-white">{t('video.title')}</h1>
          <p className="text-sm text-slate-500 font-inter">{t('video.subtitle')}</p>
        </div>
        {/* Éditeur manuel (façon CapCut) : l'autre façon de monter, plan par plan */}
        <button type="button" onClick={() => navigate('/dashboard/editeur')} data-testid="video-monter-main" title={t('editeur.monterMainDesc')}
          className="ml-auto hidden sm:inline-flex items-center gap-2 text-[13px] font-sora font-semibold text-[#c4b5fd] px-3.5 py-2 rounded-[10px] border border-[#8A6CFF]/40 bg-[#8A6CFF]/10 hover:bg-[#8A6CFF]/20 hover:text-white transition-colors">
          <Clapperboard className="w-4 h-4" />{t('editeur.monterMain')}
        </button>
      </div>

      {/* Téléprompteur (si on arrive depuis un script) */}
      {draft?.script && (
        <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a] overflow-hidden">
          <button onClick={() => setScriptOpen((o) => !o)} className="w-full flex items-center gap-2.5 px-5 py-3.5 text-left">
            <ScrollText className="w-4 h-4 text-[#8A6CFF]" />
            <span className="text-sm font-semibold text-white font-sora flex-1">{t('video.script.title')} <span className="text-slate-500 font-inter font-normal">{t('video.script.sub')}</span></span>
            <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${scriptOpen ? 'rotate-180' : ''}`} />
          </button>
          {scriptOpen && (
            <div className="px-5 pb-5">
              <pre className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-slate-300 font-inter bg-[#0c111f] border border-white/5 rounded-xl p-4 max-h-64 overflow-y-auto">{draft.script}</pre>
            </div>
          )}
        </div>
      )}

      {(draft?.script && !file && step === 'idle' && choix !== 'facecam' && choix !== 'motion') ? (
        // Décision PO du 2026-09-17 : un script reel ne part plus d'office en face caméra, on demande.
        <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a] p-5" data-testid="choix-montage">
          <h2 className="text-[17px] font-bold font-sora text-white">{t('video.choix.titre')}</h2>
          <p className="text-[13px] text-slate-500 font-inter mt-1">{t('video.choix.aide')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            <button type="button" onClick={() => setChoix('facecam')} data-testid="choix-facecam"
              className="text-left rounded-xl border border-white/10 bg-[#0c111f] hover:border-[#5B6CFF]/60 hover:bg-[#5B6CFF]/10 p-4 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] grid place-items-center mb-3"><Video className="w-5 h-5 text-white" /></div>
              <div className="font-sora font-semibold text-white text-[15px]">{t('video.choix.faceCam')}</div>
              <p className="text-[12.5px] text-slate-400 font-inter mt-1 leading-relaxed">{t('video.choix.faceCamDesc')}</p>
            </button>
            <button type="button" onClick={() => navigate(`/dashboard/reel?contenu=${contenuId}`)} data-testid="choix-clips"
              className="text-left rounded-xl border border-white/10 bg-[#0c111f] hover:border-[#3AFFA3]/60 hover:bg-[#3AFFA3]/[0.06] p-4 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-[#3AFFA3]/15 border border-[#3AFFA3]/30 grid place-items-center mb-3"><Film className="w-5 h-5 text-[#3AFFA3]" /></div>
              <div className="font-sora font-semibold text-white text-[15px]">{t('video.choix.clips')}</div>
              <p className="text-[12.5px] text-slate-400 font-inter mt-1 leading-relaxed">{t('video.choix.clipsDesc')}</p>
            </button>
            <button type="button" data-testid="choix-motion"
              onClick={() => { setChoix('motion'); setMode('agent'); setAgentSource('motion'); setAgentScript(draft?.script || ''); }}
              className="text-left rounded-xl border border-white/10 bg-[#0c111f] hover:border-[#F2A65A]/60 hover:bg-[#F2A65A]/[0.06] p-4 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-[#F2A65A]/15 border border-[#F2A65A]/30 grid place-items-center mb-3"><Wand2 className="w-5 h-5 text-[#F2A65A]" /></div>
              <div className="font-sora font-semibold text-white text-[15px]">{t('video.choix.motion')}</div>
              <p className="text-[12.5px] text-slate-400 font-inter mt-1 leading-relaxed">{t('video.choix.motionDesc')}</p>
            </button>
            <button type="button" onClick={() => navigate('/dashboard/editeur')} data-testid="choix-editeur"
              className="text-left rounded-xl border border-white/10 bg-[#0c111f] hover:border-[#8A6CFF]/60 hover:bg-[#8A6CFF]/10 p-4 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-[#8A6CFF]/15 border border-[#8A6CFF]/30 grid place-items-center mb-3"><Clapperboard className="w-5 h-5 text-[#c4b5fd]" /></div>
              <div className="font-sora font-semibold text-white text-[15px]">{t('editeur.monterMain')}</div>
              <p className="text-[12.5px] text-slate-400 font-inter mt-1 leading-relaxed">{t('editeur.monterMainDesc')}</p>
            </button>
          </div>
        </div>
      ) : (step === 'processing' && mode === 'agent') ? (
        <SuiviAgent etat={agentEtat} motion={motionActif} uploadPct={uploadPct} maintenant={maintenant} navigate={navigate} />
      ) : (step === 'done' && result) ? (
        <ResultCard result={result} onReset={reset} navigate={navigate} onCorriger={result.travailId ? corriger : undefined}
          choixMusique={choixMusique} musique={{ id: form.music, volume: Math.max(5, volume) }}
          reseaux={reseaux} setReseaux={setReseaux} onPublish={publishMontaged} publishing={publishing} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* GAUCHE : vidéo */}
          <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a] p-5 space-y-4">
            {motionActif ? (
              <TexteVoixOff script={agentScript} setScript={setAgentScript} voix={agentVoix} setVoix={setAgentVoix} dureeMax={agentDuree} />
            ) : <>
            <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{t('video.yourVideo')}</p>
            {!file ? (
              <label className="flex flex-col items-center justify-center gap-3 py-14 rounded-xl border-2 border-dashed border-white/10 hover:border-[#5B6CFF]/40 cursor-pointer transition-colors text-center">
                <input type="file" accept="video/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                <div className="w-12 h-12 rounded-full bg-white/[0.04] flex items-center justify-center"><Upload className="w-6 h-6 text-slate-400" /></div>
                <div>
                  <p className="text-sm text-white font-inter font-medium">{t('video.upload.cta')}</p>
                  <p className="text-xs text-slate-500 font-inter">{t('video.upload.formats')}</p>
                  <p className="text-[11px] text-slate-600 font-inter mt-1">{t('video.upload.note')}</p>
                </div>
              </label>
            ) : (
              <div className="space-y-3">
                <div className="relative rounded-xl overflow-hidden bg-black">
                  <video src={localUrl} controls className="w-full max-h-[420px] object-contain" />
                  {/* Aperçu en direct du style choisi (hook + sous-titres karaoké) — rien
                      n'est envoyé, c'est juste un rendu CSS approximatif du résultat. */}
                  {mode === 'montage' && (
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute left-[8%] right-[8%] text-center font-extrabold leading-tight"
                        style={{
                          ...presetPreviewStyle(currentTemplate, { hl: subColor }),
                          top: hookPosition === 'top' ? '8%' : hookPosition === 'center' ? '50%' : 'auto',
                          bottom: hookPosition === 'bottom' ? '16%' : 'auto',
                          transform: hookPosition === 'center' ? 'translateY(-50%)' : 'none',
                          fontSize: `${22 * (hookSize / 100)}px`,
                          opacity: hookAuto || hookText.trim() ? 1 : 0.4,
                        }}>
                        {(hookAuto ? t('video.hook.autoPreview') : (hookText.trim() || t('video.hook.placeholder')))}
                      </div>
                      <div className="absolute left-[8%] right-[8%] text-center" style={{ bottom: `${subPosition}%`, fontSize: `${16 * (subSize / 100)}px` }}>
                        {CAPTION_WORDS.map((w, i) => {
                          const isActive = i === activeWord;
                          const wordStyle = { ...presetPreviewStyle(currentTemplate, { font: subFont, hl: subColor }), margin: '0 0.15em', display: 'inline-block', transition: 'transform .12s ease, color .12s ease' };
                          if (isActive) {
                            if (currentTemplate.active === 'hl') wordStyle.color = subColor;
                            if (currentTemplate.active === 'white') wordStyle.color = '#fff';
                            if (currentTemplate.active === 'scale' || currentTemplate.active === 'pop') wordStyle.transform = 'scale(1.12)';
                          }
                          return <span key={i} style={wordStyle}>{subUppercase ? w : w.toLowerCase()}</span>;
                        })}
                      </div>
                    </div>
                  )}
                </div>
                {step === 'processing' && uploadPct > 0 && uploadPct < 100 && (
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-inter">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#5B6CFF]" /> {t('video.progress.sending', { pct: uploadPct })}
                  </div>
                )}
                {step !== 'processing' && (
                  <button onClick={reset} className="text-xs text-slate-500 hover:text-white font-inter">{t('video.upload.change')}</button>
                )}
              </div>
            )}
            </>}
          </div>

          {/* DROITE : réglages */}
          <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a] p-5">
            <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase mb-3">{t('video.settings')}</p>

            {/* Réseaux de publication (multi — les 2 modes) */}
            <div className="mb-4">
              <p className="text-[11px] uppercase tracking-wider text-slate-600 font-inter mb-1.5">{t('video.networks')}</p>
              <div className="flex gap-2 flex-wrap">
                {RESEAUX.map((r) => {
                  const on = reseaux.includes(r.id);
                  return (
                    <button key={r.id} type="button"
                      onClick={() => setReseaux((p) => on ? (p.length > 1 ? p.filter((x) => x !== r.id) : p) : [...p, r.id])}
                      className={`sv-chip ${on ? 'on' : ''}`}>{r.label}</button>
                  );
                })}
              </div>
              {reseaux.length > 1 && (
                <p className="text-[11px] text-slate-500 font-inter mt-1.5">{t('video.multiPub', { n: reseaux.length })}</p>
              )}
              {/* Story 24h — seulement si Instagram/Facebook sélectionné (support Zernio) */}
              {(reseaux.includes('instagram') || reseaux.includes('facebook')) && (
                <button type="button" onClick={() => setAsStory((v) => !v)}
                  className={`mt-2.5 w-full flex items-center justify-between px-3 py-2 rounded-xl border text-left transition-all ${
                    asStory ? 'border-[#8A6CFF]/50 bg-[#5B6CFF]/10' : 'border-white/[0.06] bg-[#0c111f] hover:border-white/[0.12]'}`}>
                  <span>
                    <span className={`block text-[12.5px] font-sora font-semibold ${asStory ? 'text-white' : 'text-slate-300'}`}>{t('video.story.title')}</span>
                    <span className="block text-[11px] text-slate-500 font-inter mt-0.5">{t('video.story.sub')}</span>
                  </span>
                  <span className={`shrink-0 w-9 h-5 rounded-full relative transition-colors ${asStory ? 'bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF]' : 'bg-white/10'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${asStory ? 'left-[18px]' : 'left-0.5'}`} />
                  </span>
                </button>
              )}
            </div>

            {/* Mode : montage IA (Submagic) ou import direct */}
            <div className="flex gap-1 p-1 rounded-xl bg-[#0c111f] border border-white/[0.06] mb-4">
              {[{ id: 'montage', labelKey: 'video.mode.montage' }, { id: 'agent', labelKey: 'video.mode.agent' }, { id: 'direct', labelKey: 'video.mode.direct' }].map((m) => (
                <button key={m.id} type="button" onClick={() => setMode(m.id)}
                  className={`flex-1 py-2 rounded-lg text-[13px] font-sora font-semibold transition-all ${mode === m.id ? 'bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white' : 'text-slate-400 hover:text-white'}`}>
                  {t(m.labelKey)}
                </button>
              ))}
            </div>

            {mode === 'montage' && (
              <div className="sv-tabs">
                {TABS.map((tb) => (
                  <button key={tb.id} type="button" onClick={() => setTab(tb.id)}
                    className={`sv-tabbtn ${tab === tb.id ? 'on' : ''}`}>{t(tb.labelKey)}</button>
                ))}
              </div>
            )}

            {mode === 'montage' ? (<>
            {/* Hook d'ouverture */}
            {tab === 'hook' && <div className="sv-sec">
              <div className="sv-lab"><Sparkles className="w-[15px] h-[15px] text-[#8A6CFF]" />{t('video.hook.label')}</div>
              <div className="sv-trow">
                <div className="flex-1"><div className="sv-t">{t('video.hook.auto')}</div><div className="sv-s">{t('video.hook.autoSub')}</div></div>
                <Switch on={hookAuto} onClick={() => setHookAuto((v) => !v)} />
              </div>
              {!hookAuto && (
                <div className="mt-3.5 space-y-2.5">
                  <input type="text" maxLength={80} value={hookText} onChange={(e) => setHookText(e.target.value)}
                    placeholder={t('video.hook.placeholder')}
                    className="w-full bg-[#0c111f] border border-white/10 rounded-xl px-3.5 py-2.5 text-[13.5px] text-white font-inter outline-none focus:border-[#8A6CFF]/50" />
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <button type="button" onClick={suggestHooks} disabled={!file || hookLoading}
                      className="sv-chip flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
                      {hookLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      {t('video.hook.suggest')}
                    </button>
                    {hookStatus && <span className="text-[11.5px] text-slate-500 font-inter">{hookStatus}</span>}
                  </div>
                  {hookSuggestions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {hookSuggestions.map((h, i) => (
                        <button key={i} type="button" onClick={() => setHookText(h)} className="sv-chip">{h}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="mt-3.5">
                <div className="flex justify-between items-baseline mb-1.5"><span className="text-[12px] text-slate-400">{t('video.hook.size')}</span><span className="font-sora font-bold text-sm text-[#3AFFA3]">{hookSize} %</span></div>
                <input type="range" min="50" max="160" value={hookSize} onChange={(e) => setHookSize(+e.target.value)} style={{ '--pct': rangePct(hookSize, 50, 160) }} />
              </div>
              <div className="mt-3.5">
                <p className="text-[11px] uppercase tracking-wider text-slate-600 font-inter mb-1.5">{t('video.hook.position')}</p>
                <div className="flex gap-2">
                  {[{ id: 'top', labelKey: 'video.hook.posTop' }, { id: 'center', labelKey: 'video.hook.posCenter' }, { id: 'bottom', labelKey: 'video.hook.posBottom' }].map((p) => (
                    <button key={p.id} type="button" onClick={() => setHookPosition(p.id)} className={`sv-chip flex-1 justify-center ${hookPosition === p.id ? 'on' : ''}`}>{t(p.labelKey)}</button>
                  ))}
                </div>
              </div>
            </div>}

            {/* Templates */}
            {tab === 'captions' && <div className="sv-sec">
              <div className="sv-lab"><Wand2 className="w-[15px] h-[15px] text-[#8A6CFF]" />{t('video.tpl.label')}<span className="ml-auto text-[12px] font-semibold text-[#3AFFA3] font-sora">{customId ? (options.custom?.find((c) => c.id === customId)?.label || t('video.tpl.custom')) : form.template}</span></div>
              <p className="sv-hint">{t('video.tpl.hint')}</p>
              {options.custom?.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10.5px] uppercase tracking-wider text-slate-600 font-inter mb-1.5">{t('video.tpl.mine')}</p>
                  <div className="flex gap-2 flex-wrap">
                    {options.custom.map((c) => (
                      <button key={c.id} type="button" onClick={() => setCustomId(c.id)} className={`sv-chip ${customId === c.id ? 'on' : ''}`}>
                        {c.label}{c.type === 'preset' && <span className="ml-1 opacity-60">· preset</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="sv-tpls">
                {TEMPLATES.map((tp) => {
                  const on = !customId && form.template === tp.name;
                  return (
                    <button key={tp.name} type="button" onClick={() => { set('template', tp.name); setCustomId(null); }} className={`sv-tpl ${on ? 'on' : ''}`}>
                      {on && <span className="sv-tick"><Check className="w-2.5 h-2.5 text-white" /></span>}
                      <span className="sv-prev"><span className="sv-cap" style={presetPreviewStyle(tp)} dangerouslySetInnerHTML={{ __html: tp.html }} /></span>
                      <span className="sv-name">{tp.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>}

            {/* Style avancé des sous-titres (au-delà du preset) */}
            {tab === 'style' && <div className="sv-sec">
              <div className="sv-lab"><Type className="w-[15px] h-[15px] text-[#8A6CFF]" />{t('video.style.label')}</div>
              <div className="sv-trow">
                <div className="flex-1"><div className="sv-t">{t('video.style.font')}</div></div>
                <select value={subFont} onChange={(e) => setSubFont(e.target.value)}
                  className="bg-[#0c111f] border border-white/10 rounded-lg px-2.5 py-1.5 text-[12.5px] text-white font-inter outline-none">
                  {Object.keys(FONT_CSS).map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div className="sv-trow mt-3">
                <div className="flex-1"><div className="sv-t">{t('video.style.color')}</div></div>
                <div className="flex gap-1.5">
                  {SUB_COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => setSubColor(c)} aria-label={c}
                      className="w-6 h-6 rounded-full transition-transform"
                      style={{ background: c, border: `2px solid ${subColor === c ? '#fff' : 'transparent'}`, transform: subColor === c ? 'scale(1.15)' : 'scale(1)' }} />
                  ))}
                </div>
              </div>
              <div className="mt-3.5">
                <div className="flex justify-between items-baseline mb-1.5"><span className="text-[12px] text-slate-400">{t('video.style.size')}</span><span className="font-sora font-bold text-sm text-[#3AFFA3]">{subSize} %</span></div>
                <input type="range" min="70" max="140" value={subSize} onChange={(e) => setSubSize(+e.target.value)} style={{ '--pct': rangePct(subSize, 70, 140) }} />
              </div>
              <div className="mt-3.5">
                <div className="flex justify-between items-baseline mb-1.5"><span className="text-[12px] text-slate-400">{t('video.style.position')}</span><span className="font-sora font-bold text-sm text-[#3AFFA3]">{subPosition} %</span></div>
                <input type="range" min="10" max="45" value={subPosition} onChange={(e) => setSubPosition(+e.target.value)} style={{ '--pct': rangePct(subPosition, 10, 45) }} />
              </div>
              <div className="sv-trow mt-3.5">
                <div className="flex-1"><div className="sv-t">{t('video.style.uppercase')}</div></div>
                <Switch on={subUppercase} onClick={() => setSubUppercase((v) => !v)} />
              </div>
            </div>}

            {/* Montage : B-roll, zooms, emojis, coupes/audio */}
            {tab === 'montage' && (<>
            <div className="sv-sec">
              <div className="sv-trow">
                <div className="flex-1"><div className="sv-t">{t('video.broll.title')}</div><div className="sv-s">{t('video.broll.sub')}</div></div>
                <Switch on={brolls} onClick={() => setBrolls((v) => !v)} />
              </div>
              {brolls && (
                <div className="mt-3.5">
                  <div className="flex gap-1 p-1 rounded-xl bg-[#0c111f] border border-white/[0.06] mb-3.5">
                    {[{ id: 'ai', labelKey: 'video.broll.aiMode' }, { id: 'custom', labelKey: 'video.broll.customMode' }].map((m) => (
                      <button key={m.id} type="button" onClick={() => setBrollMode(m.id)}
                        className={`flex-1 py-1.5 rounded-lg text-[12.5px] font-sora font-semibold transition-all ${brollMode === m.id ? 'bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white' : 'text-slate-400 hover:text-white'}`}>
                        {t(m.labelKey)}
                      </button>
                    ))}
                  </div>
                  {brollMode === 'custom' && (
                    <div className="mb-3.5 space-y-2.5">
                      {brollClips.length < MAX_BROLL_CLIPS && (
                        <label className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-white/10 hover:border-[#5B6CFF]/40 cursor-pointer transition-colors text-[12.5px] text-slate-400 font-inter">
                          <input type="file" accept="video/*" multiple className="hidden" onChange={(e) => { onBrollFiles(e.target.files); e.target.value = ''; }} />
                          <Upload className="w-3.5 h-3.5" /> {t('video.broll.uploadCta')}
                        </label>
                      )}
                      {brollClips.length > 0 && (
                        <div className="space-y-1.5">
                          {brollClips.map((c, i) => (
                            <div key={i} className="flex items-center gap-2 bg-[#0c111f] border border-white/[0.07] rounded-lg px-2.5 py-1.5 text-[12px] font-inter">
                              {c.uploading ? <Loader2 className="w-3 h-3 animate-spin text-[#5B6CFF] shrink-0" />
                                : c.error ? <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />
                                : <Check className="w-3 h-3 text-[#3AFFA3] shrink-0" />}
                              <span className="flex-1 truncate text-slate-300">{c.name}</span>
                              <button type="button" onClick={() => removeBrollClip(i)} className="text-slate-500 hover:text-white shrink-0"><X className="w-3.5 h-3.5" /></button>
                            </div>
                          ))}
                        </div>
                      )}
                      {!brollClips.some((c) => c.url) && (
                        <p className="text-[11px] text-slate-500 font-inter">{t('video.broll.customHint')}</p>
                      )}
                    </div>
                  )}
                  <div className="flex justify-between items-baseline mb-1.5"><span className="text-[12px] text-slate-400">{t('video.broll.density')}</span><span className="font-sora font-bold text-sm text-[#3AFFA3]">{brollPct} %</span></div>
                  <input type="range" min="0" max="100" value={brollPct} onChange={(e) => setBrollPct(+e.target.value)} style={{ '--pct': `${brollPct}%` }} />
                  <div className="flex justify-between mt-1.5 text-[10.5px] text-[#5a6680]"><span>{t('video.broll.rare')}</span><span>{t('video.broll.dense')}</span></div>
                </div>
              )}
            </div>

            {/* Zooms */}
            <div className="sv-sec">
              <div className="sv-trow">
                <div className="flex-1"><div className="sv-t">{t('video.zooms.title')}</div><div className="sv-s">{t('video.zooms.sub')}</div></div>
                <Switch on={form.zooms} onClick={() => set('zooms', !form.zooms)} />
              </div>
            </div>

            {/* Emojis */}
            <div className="sv-sec">
              <div className="sv-trow">
                <div className="flex-1"><div className="sv-t flex items-center gap-1.5"><Smile className="w-3.5 h-3.5 text-slate-400" />{t('video.emojis.title')}</div><div className="sv-s">{t('video.emojis.sub')}</div></div>
                <Switch on={emojis} onClick={() => setEmojis((v) => !v)} />
              </div>
            </div>

            {/* Montage pro */}
            <div className="sv-sec">
              <div className="sv-lab"><Scissors className="w-[15px] h-[15px] text-[#8A6CFF]" />{t('video.pro.label')}</div>

              <div className="sv-trow">
                <div className="flex-1">
                  <div className="sv-t flex items-center gap-1.5">{t('video.pro.silences')} <InfoTip text={t('video.pro.silencesTip')} /></div>
                  <div className="sv-s">{t('video.pro.silencesSub')}</div>
                </div>
                <Switch on={silencePace !== 'off'} onClick={() => setSilencePace(silencePace === 'off' ? 'natural' : 'off')} />
              </div>
              {silencePace !== 'off' && (
                <div className="flex gap-2 mt-2.5">
                  {[{ id: 'natural', labelKey: 'video.pro.paceLight' }, { id: 'fast', labelKey: 'video.pro.paceFast' }, { id: 'extra-fast', labelKey: 'video.pro.paceXFast' }].map((p) => (
                    <button key={p.id} type="button" onClick={() => setSilencePace(p.id)} className={`sv-chip flex-1 justify-center ${silencePace === p.id ? 'on' : ''}`}>{t(p.labelKey)}</button>
                  ))}
                </div>
              )}

              <div className="sv-trow mt-3.5">
                <div className="flex-1">
                  <div className="sv-t flex items-center gap-1.5">{t('video.pro.cleanAudio')} <InfoTip text={t('video.pro.cleanAudioTip')} /></div>
                  <div className="sv-s">{t('video.pro.cleanAudioSub')}</div>
                </div>
                <Switch on={cleanAudio} onClick={() => setCleanAudio((v) => !v)} />
              </div>
            </div>
            </>)}

            {/* Musique */}
            {tab === 'music' && <div className="sv-sec">
              {choixMusique}
            </div>}
            </>) : mode === 'agent' ? (
              <div className="space-y-4 mb-1" data-testid="agent-video-form">
                <div className="flex gap-2 flex-wrap" data-testid="agent-video-source">
                  {[{ id: 'video', labelKey: 'video.agent.sourceVideo' }, { id: 'motion', labelKey: 'video.agent.sourceMotion' }].map((o) => (
                    <button key={o.id} type="button" onClick={() => setAgentSource(o.id)} className={`sv-chip ${agentSource === o.id ? 'on' : ''}`}>{t(o.labelKey)}</button>
                  ))}
                </div>
                <div className="rounded-xl border border-[#8A6CFF]/25 bg-[#8A6CFF]/[0.06] p-3.5">
                  <p className="text-[13.5px] text-white font-sora font-semibold flex items-center gap-2"><Wand2 className="w-4 h-4 text-[#b9a6ff]" />{t('video.agent.titre')}</p>
                  <p className="text-[12px] text-slate-400 font-inter mt-1 leading-relaxed">{t('video.agent.aide')}</p>
                </div>
                <div>
                  <label htmlFor="agent-consignes" className="text-[11px] uppercase tracking-wider text-slate-600 font-inter mb-1.5 block">{t('video.agent.consignes')}</label>
                  <textarea id="agent-consignes" data-testid="agent-video-consignes" rows={6} maxLength={1500}
                    value={agentConsignes} onChange={(e) => setAgentConsignes(e.target.value)}
                    placeholder={t('video.agent.placeholder')}
                    className="w-full bg-[#0c111f] border border-white/10 rounded-xl px-3.5 py-2.5 text-[13.5px] leading-relaxed text-white font-inter outline-none focus:border-[#8A6CFF]/50 resize-y" />
                  <p className="text-[10.5px] text-slate-600 font-inter text-right tabular-nums">{agentConsignes.length} / 1500</p>
                </div>
                <div className="sv-trow">
                  <div className="flex-1"><div className="sv-t">{t('video.agent.illustrations')}</div><div className="sv-s">{t('video.agent.illustrationsAide')}</div></div>
                  <Switch on={agentIllustrations} onClick={() => setAgentIllustrations((v) => !v)} />
                </div>
                <div className="sv-trow">
                  <div className="flex-1"><div className="sv-t">{t('video.agent.logo')}</div><div className="sv-s">{t('video.agent.logoAide')}</div></div>
                  <Switch on={agentLogo} onClick={() => setAgentLogo((v) => !v)} />
                </div>
                <ImagesBanque selection={agentImages} onChange={setAgentImages} />
                <div className="sv-sec">{choixMusique}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-600 font-inter mb-1.5">{t('video.agent.format')}</p>
                    <div className="flex gap-2 flex-wrap">
                      {['9:16', '1:1', '16:9'].map((f) => (
                        <button key={f} type="button" onClick={() => setAgentFormat(f)} className={`sv-chip ${agentFormat === f ? 'on' : ''}`}>{f}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-600 font-inter mb-1.5">{t('video.agent.dureeMax')}</p>
                    <div className="flex gap-2 flex-wrap">
                      {[30, 60, 90, 180].map((s) => (
                        <button key={s} type="button" onClick={() => setAgentDuree(s)} className={`sv-chip ${agentDuree === s ? 'on' : ''}`}>{s < 60 ? `${s} s` : `${s / 60} min`}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 bg-[#0c111f] p-4 text-center mb-1">
                <p className="text-sm text-white font-inter font-medium">{t('video.direct.title')}</p>
                <p className="text-xs text-slate-500 font-inter mt-1">{t('video.direct.sub')} <b className="text-slate-300">{t('video.direct.free')}</b>{t('video.direct.sub2')}</p>
              </div>
            )}

            {/* CTA */}
            <div className="pt-4 mt-1 border-t border-white/[0.06]">
              <Button onClick={lancer} disabled={(motionActif ? texteParle(agentScript).length < 20 || voixTropLongue : !file) || step === 'processing'} className="w-full bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white hover:opacity-90 gap-2">
                {step === 'processing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {step === 'processing' ? (mode === 'direct' ? t('video.cta.importing') : t('video.cta.editing')) : (mode === 'direct' ? t('video.cta.import') : motionActif ? t('video.agent.ctaMotion') : mode === 'agent' ? t('video.agent.cta') : t('video.cta.edit'))}
              </Button>
              {mode !== 'direct' ? (
                <p className="text-[11px] text-slate-600 font-inter text-center mt-2.5 flex items-center justify-center gap-1.5">
                  <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-[#8A6CFF]/15 text-[#b9a6ff] border border-[#8A6CFF]/30">PRO</span>
                  {t('video.cta.proNote')}
                </p>
              ) : (
                <p className="text-[11px] text-slate-600 font-inter text-center mt-2.5">{t('video.cta.freeNote')}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {step === 'processing' && mode !== 'agent' && (() => { const p = progress(); return (
        <div className="rounded-2xl border border-[#5B6CFF]/25 bg-[#5B6CFF]/[0.06] p-5 space-y-3">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-[#8A6CFF] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-inter font-medium">{p.label}</p>
              <p className="text-xs text-slate-400 font-inter">{t('video.progress.canLeave')}</p>
            </div>
            <span className="font-sora font-bold text-[#8A6CFF] text-sm tabular-nums">{p.pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] transition-all duration-700" style={{ width: `${p.pct}%` }} />
          </div>
        </div>
      ); })()}
      {step === 'error' && (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] p-5 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          {mode === 'agent' ? (
            <div className="flex-1"><p className="text-sm text-white font-inter font-medium">{t('video.agent.echec')}</p><p className="text-xs text-slate-400 font-inter">{agentEtat?.erreur ? `${agentEtat.erreur} · ` : ''}{t('video.agent.echecAide')}</p></div>
          ) : (
            <div className="flex-1"><p className="text-sm text-white font-inter font-medium">{t('video.error.failed')}</p><p className="text-xs text-slate-400 font-inter">{t('video.error.requeued')}</p></div>
          )}
          <Button variant="ghost" onClick={reset} className="text-slate-300">{t('video.error.retry')}</Button>
        </div>
      )}
    </div>
  );
}

const CLE_AGENT_EN_COURS = 'postorico.agentVideoEnCours';

/** État d'un montage terminé par l'agent -> résultat affiché (vidéo, résumé, corrections). */
const resultatAgent = (e) => ({
  id: e.contenu_id, travailId: e.id, video_url: e.video_url, video_preview_url: e.video_preview_url, titre: e.titre,
  resume: e.resume ? e.resume.replace(/\*\*|`/g, '') : null,
  version: e.version, gratuites: e.corrections_gratuites_restantes, correctionPossible: e.correction_possible, erreurCorrection: e.erreur_correction,
});

/** Étape courante du montage par l'agent, d'après le statut et le texte de progression du serveur. */
function etapeAgent(etat, motion, envoi) {
  if (envoi) return 'envoi';
  if (!etat) return motion ? 'voix' : 'transcription';
  const p = String(etat.progression || '').toLowerCase();
  if (etat.statut === 'termine') return 'fini';
  if (p.includes('récupération')) return 'finalisation';
  if (p.includes('illustration')) return 'illustrations';
  if (motion && p.includes('voix off')) return 'voix';
  if (p.includes('transcription')) return motion ? 'voix' : 'transcription';
  if (etat.statut === 'preparation') return motion ? 'voix' : 'transcription';
  return 'montage';
}

/** Écran de suivi du montage par l'agent IA : étapes, temps écoulé, détail du monteur. */
function SuiviAgent({ etat, motion, uploadPct, maintenant, navigate }) {
  const { t } = useTranslation();
  const envoi = uploadPct > 0 && uploadPct < 100;
  const etapes = motion ? ['voix', 'illustrations', 'montage', 'finalisation'] : ['envoi', 'transcription', 'illustrations', 'montage', 'finalisation'];
  const courante = etapeAgent(etat, motion, envoi);
  const rang = courante === 'fini' ? etapes.length : Math.max(0, etapes.indexOf(courante));
  const min = etat?.debut ? Math.max(0, Math.floor((maintenant - new Date(etat.debut).getTime()) / 60000)) : 0;
  const detail = courante === 'envoi' ? t('video.agent.envoi', { pct: uploadPct }) : etat?.progression;
  return (
    <div className="max-w-2xl mx-auto rounded-2xl border border-[#8A6CFF]/25 bg-[#0f172a] p-6 sm:p-8" data-testid="agent-video-attente">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] grid place-items-center shrink-0">
          <Loader2 className="w-6 h-6 text-white animate-spin" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold font-sora text-white">{motion ? t('video.agent.suivi.titreMotion') : t('video.agent.suivi.titre')}</h2>
          <p className="text-[13px] text-slate-400 font-inter">{t('video.agent.suivi.depuis', { min })}</p>
        </div>
      </div>

      <ol className="mt-6 space-y-1">
        {etapes.map((e, i) => {
          const fait = i < rang;
          const actif = i === rang;
          return (
            <li key={e} className={`flex items-start gap-3 rounded-xl px-3 py-2.5 border ${actif ? 'bg-[#8A6CFF]/10 border-[#8A6CFF]/25' : 'border-transparent'}`}>
              <span className={`mt-0.5 w-6 h-6 rounded-full grid place-items-center shrink-0 ${fait ? 'bg-[#3AFFA3]/15 text-[#3AFFA3]' : actif ? 'bg-[#8A6CFF]/20 text-[#c4b5fd]' : 'bg-white/5 text-slate-600'}`}>
                {fait ? <Check className="w-3.5 h-3.5" /> : actif ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span className="text-[11px] font-semibold tabular-nums">{i + 1}</span>}
              </span>
              <div className="min-w-0">
                <p className={`text-[14px] font-inter font-medium ${fait ? 'text-slate-300' : actif ? 'text-white' : 'text-slate-500'}`}>{t(`video.agent.suivi.etapes.${e}`)}</p>
                {actif && <p className="text-[12px] text-slate-400 font-inter mt-0.5 break-words">{detail || t(`video.agent.suivi.aide.${e}`)}</p>}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-6 pt-5 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="flex-1 text-[12.5px] text-slate-400 font-inter">{t('video.agent.suivi.quitter')}</p>
        <Button variant="outline" onClick={() => navigate('/dashboard/contenus')} className="border-white/10 text-slate-200 hover:text-white bg-transparent">
          {t('video.agent.suivi.contenus')}<ArrowRight className="w-4 h-4 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}

/** Le résumé de l'agent parle de ses fichiers (./sortie/final.mp4…) : on retire ces chemins. */
const nettoyerResume = (r) => String(r || '')
  .replace(/\s*:?\s*`?\.\/[\w\-./]*?\.[a-z0-9]{2,4}`?(?![\w])/gi, '')
  .replace(/\s*:?\s*`?\.\/[\w\-/]+`?/g, '')
  .replace(/[ \t]+([.,;])/g, '$1')
  .trim();

function ResultCard({ result, onReset, navigate, reseaux, setReseaux, onPublish, publishing, onCorriger, choixMusique, musique }) {
  const { t } = useTranslation();
  const [resumeOuvert, setResumeOuvert] = useState(false);
  const resume = nettoyerResume(result.resume);
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[#3AFFA3]/20 bg-[#0f172a] p-5 sm:p-6">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="w-9 h-9 rounded-full bg-[#3AFFA3]/15 grid place-items-center"><Check className="w-5 h-5 text-[#3AFFA3]" /></span>
          <h2 className="font-bold font-sora text-white text-lg flex-1">{t('video.result.done')}</h2>
          {result.version > 1 && (
            <span className="text-[11px] font-semibold font-inter px-2.5 py-1 rounded-full border border-[#8A6CFF]/40 text-[#c4b5fd] bg-[#8A6CFF]/10">{t('video.agent.version', { v: result.version })}</span>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] gap-6 items-start">
          {result.video_url && (
            <video src={result.video_url} controls playsInline className="w-full max-w-[300px] mx-auto md:max-w-none aspect-[9/16] max-h-[520px] rounded-xl bg-black object-contain" />
          )}
          <div className="min-w-0 space-y-5">
            {result.erreurCorrection && (
              <p className="text-[12.5px] text-amber-200 font-inter rounded-xl border border-amber-400/30 bg-amber-400/10 px-3.5 py-2.5">{t('video.agent.correctionRatee')} {result.erreurCorrection}</p>
            )}
            {resume && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-inter mb-1.5">{t('video.agent.resume')}</p>
                <p className={`text-[13.5px] text-slate-300 font-inter leading-relaxed whitespace-pre-line break-words ${resumeOuvert ? '' : 'line-clamp-4'}`}>{resume}</p>
                {resume.length > 260 && (
                  <button type="button" onClick={() => setResumeOuvert((o) => !o)} className="mt-1 text-[12.5px] font-semibold text-[#a5b0ff] hover:text-white font-inter">
                    {resumeOuvert ? t('video.agent.resumeReduire') : t('video.agent.resumeTout')}
                  </button>
                )}
              </div>
            )}

            <div className="rounded-xl border border-white/[0.06] bg-[#0c111f] p-4 space-y-3">
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-inter">{t('video.result.publishOn')}</p>
              <div className="flex gap-2 flex-wrap">
                {RESEAUX.map((r) => {
                  const on = reseaux.includes(r.id);
                  return (
                    <button key={r.id} type="button"
                      onClick={() => setReseaux((p) => on ? (p.length > 1 ? p.filter((x) => x !== r.id) : p) : [...p, r.id])}
                      className={`sv-chip ${on ? 'on' : ''}`}>{r.label}</button>
                  );
                })}
              </div>
              <Button onClick={onPublish} disabled={publishing || !reseaux.length}
                className="w-full sm:w-auto bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white hover:opacity-90 gap-2 disabled:opacity-50">
                {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {t('video.result.saveAndPublish')}
              </Button>
              <p className="text-[11.5px] text-slate-500 font-inter">{t('video.result.note1')} <b className="text-slate-300">{t('video.result.note2')}</b>.</p>
            </div>

            <div className="flex flex-wrap gap-x-1 gap-y-1 -ml-3">
              <Button variant="ghost" onClick={() => navigate('/dashboard/contenus')} className="text-slate-300 hover:text-white">{t('video.result.seeContents')}</Button>
              {result.video_preview_url && <a href={result.video_preview_url} target="_blank" rel="noreferrer"><Button variant="ghost" className="text-slate-300 hover:text-white">{t('video.result.preview')}</Button></a>}
              {onReset && <Button variant="ghost" onClick={onReset} className="text-slate-400 hover:text-white">{t('video.result.newVideo')}</Button>}
            </div>
          </div>
        </div>
      </div>

      {onCorriger && <CorrectionAgent result={result} onEnvoyer={onCorriger} choixMusique={choixMusique} musique={musique} />}
    </div>
  );
}

function Switch({ on, onClick }) {
  return <button type="button" onClick={onClick} className={`sv-sw ${on ? 'on' : ''}`} aria-pressed={on} />;
}

function InfoTip({ text }) {
  return (
    <span className="sv-tip" tabIndex={0}>
      <Info className="w-3.5 h-3.5" />
      <span className="sv-tip-box">{text}</span>
    </span>
  );
}

const CSS = `
.sv .sv-sec{padding:16px 0;border-top:1px solid rgba(255,255,255,.07)}
.sv .sv-sec:first-of-type{padding-top:2px;border-top:none}
.sv .sv-tabs{display:flex;gap:5px;overflow-x:auto;padding-bottom:2px;margin-bottom:10px;scrollbar-width:none}
.sv .sv-tabs::-webkit-scrollbar{display:none}
.sv .sv-tabbtn{flex:none;padding:8px 13px;border-radius:10px;border:1px solid rgba(255,255,255,.07);background:#0c111f;color:#8593ae;font-size:12.5px;font-weight:600;font-family:'Sora',sans-serif;cursor:pointer;white-space:nowrap;transition:.15s}
.sv .sv-tabbtn:hover{color:#e8edf7;border-color:rgba(255,255,255,.14)}
.sv .sv-tabbtn.on{border-color:transparent;background:linear-gradient(135deg,#5B6CFF,#8A6CFF);color:#fff}
.sv .sv-lab{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;color:#e8edf7;margin-bottom:3px}
.sv .sv-hint{margin:0 0 12px;color:#8593ae;font-size:12px}
.sv .sv-t{font-size:13.5px;font-weight:600;color:#e8edf7}
.sv .sv-s{font-size:12px;color:#8593ae;margin-top:1px}
.sv .sv-trow{display:flex;align-items:center;gap:12px}
.sv .sv-tpls{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}
.sv .sv-tpl{cursor:pointer;border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:6px 6px 8px;background:#0c111f;transition:.15s;position:relative}
.sv .sv-tpl:hover{border-color:rgba(255,255,255,.14);transform:translateY(-1px)}
.sv .sv-tpl.on{border-color:#8A6CFF;box-shadow:0 0 0 1px #8A6CFF,0 8px 22px rgba(138,108,255,.18)}
.sv .sv-tick{position:absolute;top:7px;right:7px;width:17px;height:17px;border-radius:50%;background:linear-gradient(135deg,#5B6CFF,#8A6CFF);display:grid;place-items:center;z-index:3}
.sv .sv-prev{aspect-ratio:9/13;border-radius:8px;overflow:hidden;position:relative;background:linear-gradient(165deg,#1a2233,#0c1220);display:grid;place-items:center}
.sv .sv-cap{position:absolute;bottom:9px;left:5px;right:5px;text-align:center;line-height:1.15;font-size:13px}
.sv .cap-hl{color:#3AFFA3}
.sv .sv-name{display:block;text-align:center;margin-top:6px;font-size:11px;color:#8593ae;font-family:'Sora',sans-serif;font-weight:600}
.sv .sv-tpl.on .sv-name{color:#e8edf7}
.sv .sv-chip{padding:8px 13px;border-radius:11px;border:1px solid rgba(255,255,255,.07);background:#0c111f;cursor:pointer;font-size:12.5px;color:#8593ae;transition:.15s;font-family:inherit}
.sv .sv-chip:hover{color:#e8edf7;border-color:rgba(255,255,255,.14)}
.sv .sv-chip.on{border-color:#3AFFA3;color:#3AFFA3;background:rgba(58,255,163,.07)}
.sv .sv-sw{width:42px;height:24px;border-radius:99px;background:#1b2436;border:1px solid rgba(255,255,255,.12);position:relative;cursor:pointer;transition:.18s;flex:none}
.sv .sv-sw::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#8290ab;transition:.18s}
.sv .sv-sw.on{background:linear-gradient(90deg,rgba(58,255,163,.25),rgba(58,255,163,.4));border-color:rgba(58,255,163,.5)}
.sv .sv-sw.on::after{left:20px;background:#3AFFA3}
.sv input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:6px;border-radius:99px;outline:none;background:linear-gradient(90deg,#5B6CFF,#8A6CFF) no-repeat;background-size:var(--pct,50%) 100%;box-shadow:inset 0 0 0 100px rgba(255,255,255,.06)}
.sv input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#fff;border:3px solid #8A6CFF;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4)}
.sv input[type=range]::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#fff;border:3px solid #8A6CFF;cursor:pointer}
.sv .sv-tip{position:relative;display:inline-flex;color:#5a6680;cursor:help}
.sv .sv-tip:hover,.sv .sv-tip:focus{color:#cbd5e1;outline:none}
.sv .sv-tip .sv-tip-box{position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);width:210px;background:#0b1120;border:1px solid rgba(255,255,255,.14);border-radius:9px;padding:8px 10px;font-family:'Inter',sans-serif;font-weight:400;font-size:11.5px;line-height:1.5;color:#cbd5e1;text-align:left;opacity:0;visibility:hidden;transition:.15s;z-index:30;box-shadow:0 10px 30px rgba(0,0,0,.55);pointer-events:none}
.sv .sv-tip:hover .sv-tip-box,.sv .sv-tip:focus .sv-tip-box{opacity:1;visibility:visible}
`;

/** Photos de la banque du client à confier à l'agent (sélection multiple, ajout direct). */
function ImagesBanque({ selection, onChange, max = 10 }) {
  const { t } = useTranslation();
  const [banque, setBanque] = useState(null);
  const [ajout, setAjout] = useState(false);
  const charger = () => contenuService.reelBanque().then((l) => setBanque((l || []).filter((a) => a.type !== 'video'))).catch(() => setBanque([]));
  useEffect(() => { charger(); }, []);
  const choisie = (url) => selection.some((im) => im.url === url);
  const basculer = (a) => onChange(choisie(a.url)
    ? selection.filter((im) => im.url !== a.url)
    : selection.length < max ? [...selection, { url: a.url, description: a.description || '' }] : selection);
  const ajouter = async (f) => {
    if (!f) return;
    setAjout(true);
    try {
      const a = await contenuService.reelBanqueAjouter(f);
      await charger();
      if (a?.url && selection.length < max) onChange([...selection, { url: a.url, description: a.description || '' }]);
    } catch (e) {
      toast.error(e.response?.data?.message || t('video.agent.imagesErreur'));
    } finally { setAjout(false); }
  };
  return (
    <div data-testid="agent-video-images">
      <div className="flex items-baseline justify-between mb-1.5">
        <p className="text-[11px] uppercase tracking-wider text-slate-600 font-inter">{t('video.agent.images')}</p>
        {selection.length > 0 && <span className="text-[11px] text-[#b9a6ff] font-inter tabular-nums">{selection.length} / {max}</span>}
      </div>
      <p className="text-[11.5px] text-slate-500 font-inter mb-2">{t('video.agent.imagesAide')}</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <label className="shrink-0 w-16 h-16 rounded-lg border border-dashed border-white/15 hover:border-[#8A6CFF]/50 grid place-items-center cursor-pointer text-slate-400" title={t('video.agent.imagesAjouter')}>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => ajouter(e.target.files?.[0])} />
          {ajout ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
        </label>
        {(banque || []).map((a) => (
          <button key={a.id || a.url} type="button" onClick={() => basculer(a)} title={a.description || ''}
            className={`relative shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${choisie(a.url) ? 'border-[#8A6CFF]' : 'border-transparent hover:border-white/20'}`}>
            <img src={a.apercu_url || a.url} alt={a.description || ''} className="w-full h-full object-cover" loading="lazy" />
            {choisie(a.url) && <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#8A6CFF] grid place-items-center"><Check className="w-3 h-3 text-white" /></span>}
          </button>
        ))}
        {banque && !banque.length && <p className="text-[11.5px] text-slate-600 font-inter self-center">{t('video.agent.imagesVide')}</p>}
      </div>
    </div>
  );
}

function CorrectionAgent({ result, onEnvoyer, choixMusique, musique }) {
  const { t } = useTranslation();
  const [texte, setTexte] = useState('');
  const [images, setImages] = useState([]);
  const [changerMusique, setChangerMusique] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  if (!result.correctionPossible) return <p className="text-[12px] text-slate-500 font-inter px-1">{t('video.agent.correctionExpiree')}</p>;
  const pret = texte.trim() || changerMusique;
  const envoyer = async () => {
    if (!pret) return;
    setEnvoi(true);
    try { await onEnvoyer(texte.trim(), images, changerMusique ? musique : null); } finally { setEnvoi(false); }
  };
  return (
    <div className="rounded-2xl border border-[#8A6CFF]/25 bg-[#0f172a] p-5 sm:p-6 space-y-5" data-testid="agent-video-correction">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-full bg-[#8A6CFF]/15 grid place-items-center shrink-0"><PenLine className="w-4 h-4 text-[#c4b5fd]" /></span>
        <div className="min-w-0">
          <h3 className="text-[16px] text-white font-sora font-semibold">{t('video.agent.correctionTitre')}</h3>
          <p className="text-[12.5px] text-slate-400 font-inter mt-0.5">
            {result.gratuites > 0 ? t('video.agent.correctionGratuites', { n: result.gratuites }) : t('video.agent.correctionPayante')}
          </p>
        </div>
      </div>

      <textarea rows={3} maxLength={1500} value={texte} onChange={(e) => setTexte(e.target.value)} data-testid="agent-video-correction-texte"
        placeholder={t('video.agent.correctionPlaceholder')}
        className="w-full bg-[#0c111f] border border-white/10 rounded-xl px-4 py-3 text-[13.5px] leading-relaxed text-white font-inter outline-none focus:border-[#8A6CFF]/50 resize-y" />

      <div className="rounded-xl border border-white/[0.06] bg-[#0c111f] p-4">
        <div className="flex items-center gap-3">
          <Music className="w-4 h-4 text-[#8A6CFF] shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[13.5px] text-white font-inter font-medium">{t('video.agent.correctionMusique')}</p>
            <p className="text-[12px] text-slate-500 font-inter">{t('video.agent.correctionMusiqueAide')}</p>
          </div>
          <Switch on={changerMusique} onClick={() => setChangerMusique((v) => !v)} />
        </div>
        {changerMusique && <div className="mt-4 pt-4 border-t border-white/[0.06]">{choixMusique}</div>}
      </div>

      <ImagesBanque selection={images} onChange={setImages} />

      <div className="flex justify-end">
        <Button onClick={envoyer} disabled={envoi || !pret} className="w-full sm:w-auto bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white hover:opacity-90 gap-2 disabled:opacity-50">
          {envoi ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}{t('video.agent.correctionEnvoyer')}
        </Button>
      </div>
    </div>
  );
}

/** Motion design : le texte que la voix off lira, et le choix de la voix (ElevenLabs, ou la sienne). */
function TexteVoixOff({ script, setScript, voix, setVoix, dureeMax }) {
  const { t } = useTranslation();
  const [catalogue, setCatalogue] = useState(null);
  const [ecoute, setEcoute] = useState(null);
  const lecteur = useRef(null);
  useEffect(() => {
    contenuService.reelVoix().then((c) => { setCatalogue(c); if (!voix && c?.defaut) setVoix(c.defaut); }).catch(() => setCatalogue({ voix: [] }));
    return () => lecteur.current?.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const ecouter = (v) => {
    lecteur.current?.pause();
    if (ecoute === v.id || !v.apercu) { setEcoute(null); return; }
    lecteur.current = new Audio(v.apercu);
    lecteur.current.onended = () => setEcoute(null);
    lecteur.current.play().catch(() => setEcoute(null));
    setEcoute(v.id);
  };
  const choix = [...(catalogue?.voix || []), ...(catalogue?.clone?.existe ? [{ id: 'moi', genre: 'moi', apercu: catalogue.clone.apercu }] : [])];
  return (
    <div className="space-y-4" data-testid="agent-video-motion">
      <div className="rounded-xl border border-[#F2A65A]/25 bg-[#F2A65A]/[0.06] p-3.5">
        <p className="text-[13.5px] text-white font-sora font-semibold flex items-center gap-2"><Wand2 className="w-4 h-4 text-[#F2A65A]" />{t('video.agent.motionTitre')}</p>
        <p className="text-[12px] text-slate-400 font-inter mt-1 leading-relaxed">{t('video.agent.motionAide')}</p>
      </div>
      <div>
        <label htmlFor="agent-script" className="text-[11px] uppercase tracking-wider text-slate-600 font-inter mb-1.5 block">{t('video.agent.script')}</label>
        <textarea id="agent-script" data-testid="agent-video-script" rows={9} maxLength={3000}
          value={script} onChange={(e) => setScript(e.target.value)} placeholder={t('video.agent.scriptPlaceholder')}
          className="w-full bg-[#0c111f] border border-white/10 rounded-xl px-3.5 py-2.5 text-[13.5px] leading-relaxed text-white font-inter outline-none focus:border-[#F2A65A]/50 resize-y" />
        <p className={`text-[10.5px] font-inter flex justify-between tabular-nums ${dureeVoix(script) > dureeMax * 1.15 ? 'text-amber-300' : 'text-slate-600'}`}>
          <span>{t('video.agent.scriptDuree', { s: dureeVoix(script) })}</span>
          <span>{script.length} / 3000</span>
        </p>
        {dureeVoix(script) > dureeMax * 1.15 && (
          <p className="text-[12px] text-amber-300 font-inter mt-1" data-testid="agent-video-script-trop-long">
            {t('video.agent.scriptTropLong', { s: dureeVoix(script), max: dureeMax })}
          </p>
        )}
        {texteParle(script) && texteParle(script) !== script.trim() && (
          <p className="text-[11px] text-slate-500 font-inter mt-1">{t('video.agent.scriptNettoye')}</p>
        )}
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wider text-slate-600 font-inter mb-1.5">{t('video.agent.voix')}</p>
        <div className="flex gap-2 flex-wrap">
          {catalogue === null && <Loader2 className="w-4 h-4 animate-spin text-slate-500" />}
          {choix.map((v) => (
            <div key={v.id} onClick={() => setVoix(v.id)} className={`sv-chip cursor-pointer flex items-center gap-1.5 capitalize ${voix === v.id ? 'on' : ''}`}>
              {v.apercu && (
                <button type="button" aria-label={t('video.music.listen')} onClick={(e) => { e.stopPropagation(); ecouter(v); }}
                  className="w-5 h-5 -ml-0.5 rounded-full flex items-center justify-center hover:bg-white/15 transition-colors">
                  {ecoute === v.id ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                </button>
              )}
              {v.id === 'moi' ? t('video.agent.voixClone') : v.id}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
