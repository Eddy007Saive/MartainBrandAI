import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Video, Upload, Loader2, Sparkles, Check, AlertCircle, Wand2, Music, Film, ArrowRight, ScrollText, ChevronDown, Play, Pause, Info, Scissors } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { videoService } from '../services/videoService';
import { contenuService } from '../services/contenuService';

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

// Tuiles d'aperçu (noms RÉELS Submagic + style de caption approximatif)
const TEMPLATES = [
  { name: 'Hormozi 2', cls: 'c-hormozi', html: 'PLUS DE <b class="hl">MARGE</b>' },
  { name: 'Beast', cls: 'c-beast', html: 'INCROYABLE' },
  { name: 'Karl', cls: 'c-karl', html: 'le <b class="box">secret</b>' },
  { name: 'Kelly 2', cls: 'c-kelly', html: 'SCALE X3' },
  { name: 'Matt', cls: 'c-matt', html: 'ton message' },
  { name: 'Jess', cls: 'c-jess', html: 'écoute <b class="em">ça</b>' },
  { name: 'Nick', cls: 'c-nick', html: 'une erreur clé' },
  { name: 'Laura', cls: 'c-laura', html: 'méthode' },
];

export default function StudioVideo() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const contenuId = params.get('contenu_id');

  const [options, setOptions] = useState({ templates: [], music: [], music_categories: [] });
  const [draft, setDraft] = useState(null);        // contenu-script chargé
  const [scriptOpen, setScriptOpen] = useState(true);
  const [file, setFile] = useState(null);
  const [localUrl, setLocalUrl] = useState(null);  // aperçu local (blob) — pas d'upload avant « Monter »
  const [uploadPct, setUploadPct] = useState(0);
  const [step, setStep] = useState('idle');        // idle|ready|processing|done|error
  const [form, setForm] = useState({ template: 'Hormozi 2', langue: 'fr', zooms: true, music: 'none' });
  const [brolls, setBrolls] = useState(true);
  const [brollPct, setBrollPct] = useState(45);
  const [silencePace, setSilencePace] = useState('off'); // off | natural | fast | extra-fast
  const [badTakes, setBadTakes] = useState(false);
  const [cleanAudio, setCleanAudio] = useState(false);
  const [volume, setVolume] = useState(25);
  const [showAll, setShowAll] = useState(false);
  const [customId, setCustomId] = useState(null);  // thème/preset perso sélectionné
  const [mode, setMode] = useState('montage');     // 'montage' (Submagic) | 'direct' (import tel quel)
  const [reseaux, setReseaux] = useState(['instagram']);  // multi-réseaux → 1 carte contenu par réseau
  const [asStory, setAsStory] = useState(false);          // story 24h (Instagram/Facebook) au lieu de Reel
  const [result, setResult] = useState(null);
  const [playing, setPlaying] = useState(null);    // id de la piste en cours d'écoute
  const [musicCat, setMusicCat] = useState(null);  // catégorie de musique ouverte (menu 2 niveaux)
  const [stage, setStage] = useState(null);        // étape Submagic (processing|transcribing|exporting)
  const pollRef = useRef(null);
  const audioRef = useRef(null);

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
    videoService.getOptions().then(setOptions).catch(() => {});
    if (contenuId) {
      contenuService.getById(contenuId)
        .then((c) => {
          setDraft(c);
          if (c.langue) setForm((f) => ({ ...f, langue: c.langue }));
          if (c.reseau_cible) setReseaux([String(c.reseau_cible).toLowerCase()]);
          if (c.video_status === 'pret' && c.video_url) { setResult(c); setStep('done'); }
          else if (c.video_status === 'en_traitement') { setStep('processing'); startPolling(contenuId); }
        })
        .catch(() => {});
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contenuId]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onFile = (f) => {
    if (!f) return;
    if (!f.type.startsWith('video/')) { toast.error(t('video.fileType')); return; }
    if (f.size > 300 * 1024 * 1024) { toast.error(t('video.fileTooBig')); return; }
    if (localUrl) URL.revokeObjectURL(localUrl);
    setFile(f);
    setLocalUrl(URL.createObjectURL(f));   // aperçu LOCAL : rien n'est envoyé tant qu'on ne monte pas
    setStep('ready');
  };

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

  const lancer = async () => {
    if (!file) return;
    stopPreview();
    setStep('processing'); setResult(null); setUploadPct(0);
    try {
      // Upload MAINTENANT (pas à la sélection) → aucun orphelin si l'utilisateur abandonne avant.
      const up = await videoService.uploadRaw(file, setUploadPct);
      const titre = draft?.titre || file?.name?.replace(/\.[^.]+$/, '') || t('video.defaultTitle');
      if (mode === 'direct') {
        // Import tel quel : pas de Submagic, pas de quota.
        await videoService.importVideo({ video_url: up.video_url, contenu_id: contenuId || undefined, titre, reseaux, as_story: asStory });
        setResult({ video_url: up.video_url }); setStep('done');
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
        brolls, broll_pct: brolls ? brollPct : undefined,
        zooms: form.zooms,
        silence_pace: silencePace === 'off' ? undefined : silencePace,
        bad_takes: badTakes, clean_audio: cleanAudio,
        music: form.music, music_volume: volume,
      });
      startPolling(d.contenu_id);
    } catch (e) {
      setStep('ready');
      if (e.response?.status === 402) toast.error(e.response?.data?.detail || t('video.proOnly'));
      else toast.error(e.response?.data?.detail || t('video.startError'));
    }
  };

  const reset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (localUrl) URL.revokeObjectURL(localUrl);
    setFile(null); setLocalUrl(null); setUploadPct(0); setStep('idle'); setResult(null);
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

      {(step === 'done' && result) ? (
        <ResultCard result={result} onReset={reset} navigate={navigate}
          reseaux={reseaux} setReseaux={setReseaux} onPublish={publishMontaged} publishing={publishing} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* GAUCHE : vidéo */}
          <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a] p-5 space-y-4">
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
                <video src={localUrl} controls className="w-full max-h-[420px] rounded-xl bg-black object-contain" />
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
              {[{ id: 'montage', labelKey: 'video.mode.montage' }, { id: 'direct', labelKey: 'video.mode.direct' }].map((m) => (
                <button key={m.id} type="button" onClick={() => setMode(m.id)}
                  className={`flex-1 py-2 rounded-lg text-[13px] font-sora font-semibold transition-all ${mode === m.id ? 'bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white' : 'text-slate-400 hover:text-white'}`}>
                  {t(m.labelKey)}
                </button>
              ))}
            </div>

            {mode === 'montage' ? (<>
            {/* Templates */}
            <div className="sv-sec">
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
                      <span className={`sv-prev ${tp.cls}`}><span className="sv-cap" dangerouslySetInnerHTML={{ __html: tp.html }} /></span>
                      <span className="sv-name">{tp.name}</span>
                    </button>
                  );
                })}
              </div>
              {!showAll ? (
                <button onClick={() => setShowAll(true)} className="w-full text-center text-[12px] text-slate-500 hover:text-white py-2 font-inter">{t('video.tpl.seeAll')}</button>
              ) : (
                <select value={form.template} onChange={(e) => set('template', e.target.value)} className="sv-select mt-2">
                  {options.templates.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              )}
            </div>

            {/* B-roll */}
            <div className="sv-sec">
              <div className="sv-trow">
                <div className="flex-1"><div className="sv-t">{t('video.broll.title')}</div><div className="sv-s">{t('video.broll.sub')}</div></div>
                <Switch on={brolls} onClick={() => setBrolls((v) => !v)} />
              </div>
              {brolls && (
                <div className="mt-3.5">
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
                  <div className="sv-t flex items-center gap-1.5">{t('video.pro.badTakes')} <InfoTip text={t('video.pro.badTakesTip')} /></div>
                  <div className="sv-s">{t('video.pro.badTakesSub')}</div>
                </div>
                <Switch on={badTakes} onClick={() => setBadTakes((v) => !v)} />
              </div>

              <div className="sv-trow mt-3.5">
                <div className="flex-1">
                  <div className="sv-t flex items-center gap-1.5">{t('video.pro.cleanAudio')} <InfoTip text={t('video.pro.cleanAudioTip')} /></div>
                  <div className="sv-s">{t('video.pro.cleanAudioSub')}</div>
                </div>
                <Switch on={cleanAudio} onClick={() => setCleanAudio((v) => !v)} />
              </div>
            </div>

            {/* Musique */}
            <div className="sv-sec">
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
            </div>
            </>) : (
              <div className="rounded-xl border border-dashed border-white/10 bg-[#0c111f] p-4 text-center mb-1">
                <p className="text-sm text-white font-inter font-medium">{t('video.direct.title')}</p>
                <p className="text-xs text-slate-500 font-inter mt-1">{t('video.direct.sub')} <b className="text-slate-300">{t('video.direct.free')}</b>{t('video.direct.sub2')}</p>
              </div>
            )}

            {/* CTA */}
            <div className="pt-4 mt-1 border-t border-white/[0.06]">
              <Button onClick={lancer} disabled={!file || step === 'processing'} className="w-full bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white hover:opacity-90 gap-2">
                {step === 'processing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {step === 'processing' ? (mode === 'direct' ? t('video.cta.importing') : t('video.cta.editing')) : (mode === 'direct' ? t('video.cta.import') : t('video.cta.edit'))}
              </Button>
              {mode === 'montage' ? (
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

      {step === 'processing' && (() => { const p = progress(); return (
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
          <div className="flex-1"><p className="text-sm text-white font-inter font-medium">{t('video.error.failed')}</p><p className="text-xs text-slate-400 font-inter">{t('video.error.requeued')}</p></div>
          <Button variant="ghost" onClick={reset} className="text-slate-300">{t('video.error.retry')}</Button>
        </div>
      )}
    </div>
  );
}

function ResultCard({ result, onReset, navigate, reseaux, setReseaux, onPublish, publishing }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-[#3AFFA3]/25 bg-[#3AFFA3]/[0.06] p-5 space-y-4">
      <div className="flex items-center gap-2 text-[#3AFFA3]"><Check className="w-5 h-5" /><p className="font-semibold font-sora">{t('video.result.done')}</p></div>
      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4 items-start">
        {result.video_url && <video src={result.video_url} controls className="w-full max-h-[420px] rounded-xl bg-black" />}
        <div className="space-y-3">
          {/* Réseaux de publication (multi) */}
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-500 font-inter mb-1.5">{t('video.result.publishOn')}</p>
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
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={onPublish} disabled={publishing || !reseaux.length}
              className="bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white hover:opacity-90 gap-2 disabled:opacity-50">
              {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {t('video.result.saveAndPublish')}
            </Button>
            <Button variant="ghost" onClick={() => navigate('/dashboard/contenus')} className="text-slate-300">{t('video.result.seeContents')}</Button>
            {result.video_preview_url && <a href={result.video_preview_url} target="_blank" rel="noreferrer"><Button variant="ghost" className="text-slate-300">{t('video.result.preview')}</Button></a>}
            {onReset && <Button variant="ghost" onClick={onReset} className="text-slate-400">{t('video.result.newVideo')}</Button>}
          </div>
          <p className="text-[11px] text-slate-500 font-inter">{t('video.result.note1')} <b className="text-slate-300">{t('video.result.note2')}</b>.</p>
        </div>
      </div>
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
.sv .sv-cap{position:absolute;bottom:9px;left:5px;right:5px;text-align:center;line-height:1.02}
.sv .sv-name{display:block;text-align:center;margin-top:6px;font-size:11px;color:#8593ae;font-family:'Sora',sans-serif;font-weight:600}
.sv .sv-tpl.on .sv-name{color:#e8edf7}
.sv .c-hormozi .sv-cap{font-family:'Anton',sans-serif;font-size:15px;color:#FFE24B;-webkit-text-stroke:2px #08111f;paint-order:stroke fill;text-transform:uppercase}
.sv .c-hormozi .hl{color:#3AFFA3}
.sv .c-beast .sv-cap{font-family:'Anton',sans-serif;font-size:14px;color:#fff;-webkit-text-stroke:2px #E5484D;paint-order:stroke fill;text-transform:uppercase}
.sv .c-karl .sv-cap{font-family:'Sora',sans-serif;font-weight:700;font-size:11.5px;color:#fff}
.sv .c-karl .box{background:#8A6CFF;border-radius:4px;padding:0 3px}
.sv .c-kelly .sv-cap{font-family:'Anton',sans-serif;font-size:14px;text-transform:uppercase;background:linear-gradient(90deg,#5BE0FF,#8A6CFF);-webkit-background-clip:text;background-clip:text;color:transparent}
.sv .c-matt .sv-cap{font-family:'Sora',sans-serif;font-weight:800;font-size:12px;color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.6)}
.sv .c-jess .sv-cap{font-family:'Sora',sans-serif;font-weight:800;font-size:12px;color:#fff}
.sv .c-jess .em{color:#FFE24B}
.sv .c-nick{align-items:flex-end}
.sv .c-nick .sv-cap{background:rgba(4,6,12,.66);border-radius:6px;padding:5px 4px;font-family:'Inter',sans-serif;font-weight:700;font-size:10.5px;color:#fff}
.sv .c-laura .sv-cap{font-family:'Sora',sans-serif;font-weight:600;font-size:10.5px;letter-spacing:.14em;color:#fff;text-transform:uppercase}
.sv .sv-select{width:100%;background:#0c111f;border:1px solid rgba(255,255,255,.1);color:#cbd5e1;font-size:13.5px;border-radius:10px;padding:10px 12px;outline:none}
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
