import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Scissors, Undo2, Wand2, Check, Play, Pause } from 'lucide-react';
import { videoService } from '../services/videoService';

// Édition d'une vidéo déjà montée par le Studio Vidéo (façon Submagic) : la transcription en mots
// cliquables (corriger un mot, supprimer un passage), le lecteur qui se cale sur le mot, et les
// réglages du montage. « Refaire le montage » relance seulement le rendu : pas de nouvelle
// transcription, pas de quota. La vidéo est remplacée sur place.
const PRESETS = ['classic', 'hormozi', 'neon', 'leon', 'molly', 'caleb', 'william', 'beast', 'duo', 'noah', 'brandin', 'bahn'];

const fmt = (s) => { const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };

export default function EditionVideo() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const contenuId = params.get('contenu');
  const video = useRef(null);

  const [chargement, setChargement] = useState(true);
  const [info, setInfo] = useState(null);           // réponse de /edition
  const [mots, setMots] = useState([]);             // [{text, start, end, supprime}]
  const [options, setOptions] = useState({});
  const [presets, setPresets] = useState(PRESETS);
  const [musiques, setMusiques] = useState([]);
  const [edition, setEdition] = useState(null);     // index du mot en cours de correction
  const [selection, setSelection] = useState(null); // {a, b} indices d'une plage sélectionnée
  const [tete, setTete] = useState(0);
  const [lecture, setLecture] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [statut, setStatut] = useState(null);       // en_traitement | pret | echec
  const [etape, setEtape] = useState('');
  const [erreur, setErreur] = useState(null);       // chargement impossible (montage introuvable, service éteint…)

  useEffect(() => {
    if (!contenuId) return;
    Promise.all([videoService.edition(contenuId), videoService.getOptions().catch(() => null)])
      .then(([d, o]) => {
        setInfo(d); setOptions(d.options || {}); setStatut(d.video_status);
        const suppr = d.removed || [];
        setMots((d.words || []).map((w) => ({ ...w, supprime: suppr.some(([a, b]) => a <= (w.start + w.end) / 2 && (w.start + w.end) / 2 <= b) })));
        if (o?.templates?.length) setPresets(o.templates.map((x) => (typeof x === 'string' ? x : x.id)));
        if (o?.music?.length) setMusiques(o.music);
      })
      .catch((e) => { const msg = e.response?.data?.detail || t('video.edition.echecChargement'); setErreur(msg); toast.error(msg); })
      .finally(() => setChargement(false));
  }, [contenuId, t]);

  // Suivi du mot lu
  useEffect(() => {
    const v = video.current; if (!v) return undefined;
    const tick = () => setTete(v.currentTime);
    v.addEventListener('timeupdate', tick); return () => v.removeEventListener('timeupdate', tick);
  }, [info]);

  // Après « Refaire le montage » : on attend la nouvelle version
  useEffect(() => {
    if (statut !== 'en_traitement' || !contenuId) return undefined;
    const it = setInterval(async () => {
      try {
        const s = await videoService.status(contenuId);
        setEtape(s.stage || '');
        if (s.video_status === 'pret') { setStatut('pret'); setInfo((p) => ({ ...p, video_url: s.video_url })); toast.success(t('video.edition.pret')); }
        if (s.video_status === 'echec') { setStatut('echec'); toast.error(t('video.edition.echec')); }
      } catch (e) { /* on réessaie au prochain tour */ }
    }, 5000);
    return () => clearInterval(it);
  }, [statut, contenuId, t]);

  // Note : les temps des mots sont ceux de la vidéo SOURCE ; la vidéo montée a des coupes, donc
  // le calage lecteur/mot est approximatif quand les coupes de silences sont actives.
  const motActif = useMemo(() => mots.findIndex((w) => !w.supprime && w.start <= tete && tete <= w.end + 0.15), [mots, tete]);

  const clicMot = (i, e) => {
    if (e.shiftKey && selection) { setSelection({ a: Math.min(selection.a, i), b: Math.max(selection.b, i) }); return; }
    setSelection({ a: i, b: i });
    const v = video.current; if (v) { v.currentTime = mots[i].start; }
  };
  const corriger = (i, texte) => { setMots((p) => p.map((w, k) => (k === i ? { ...w, text: texte } : w))); setEdition(null); };
  const supprimerSelection = () => {
    if (!selection) return;
    setMots((p) => p.map((w, k) => (k >= selection.a && k <= selection.b ? { ...w, supprime: true } : w))); setSelection(null);
  };
  const restaurerSelection = () => {
    if (!selection) return;
    setMots((p) => p.map((w, k) => (k >= selection.a && k <= selection.b ? { ...w, supprime: false } : w))); setSelection(null);
  };
  const toutRestaurer = () => setMots((p) => p.map((w) => ({ ...w, supprime: false })));

  // Les mots supprimés deviennent des passages coupés [début du 1er, fin du dernier] (fusion des voisins)
  const passagesSupprimes = useMemo(() => {
    const out = []; let cur = null;
    mots.forEach((w) => {
      if (w.supprime) { if (cur && w.start - cur[1] < 0.6) cur[1] = w.end; else { if (cur) out.push(cur); cur = [w.start, w.end]; } }
    });
    if (cur) out.push(cur);
    return out.map(([a, b]) => [Math.max(0, a - 0.05), b + 0.05]);
  }, [mots]);
  const nbSupprimes = mots.filter((w) => w.supprime).length;
  const dureeSupprimee = passagesSupprimes.reduce((s, [a, b]) => s + (b - a), 0);

  const refaire = async () => {
    setEnvoi(true);
    try {
      await videoService.rerender(contenuId, {
        words: mots.filter((w) => !w.supprime).map(({ text, start, end }) => ({ text, start, end })),
        removed: passagesSupprimes, options,
      });
      setStatut('en_traitement'); toast.success(t('video.edition.lance'));
    } catch (e) { toast.error(e.response?.data?.detail || t('video.edition.echecLancement')); }
    finally { setEnvoi(false); }
  };

  const jouer = () => { const v = video.current; if (!v) return; if (lecture) { v.pause(); setLecture(false); } else v.play().then(() => setLecture(true)).catch(() => {}); };
  const regle = (k, v) => setOptions((o) => ({ ...o, [k]: v }));

  if (!contenuId) return <div className="p-6 text-slate-400 font-inter">{t('video.edition.aucun')}</div>;
  if (chargement) return <div className="p-10 flex items-center justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" />{t('video.edition.chargement')}</div>;
  if (!info) {
    return (
      <div className="max-w-[720px] mx-auto px-4 py-10 font-inter" data-testid="edition-video-erreur">
        <button type="button" onClick={() => navigate('/dashboard/contenus')} className="inline-flex items-center gap-1.5 text-[13px] text-slate-400 hover:text-white mb-4"><ArrowLeft className="w-4 h-4" />{t('video.edition.retour')}</button>
        <div className="rounded-2xl border border-white/[0.07] bg-slate-950/40 p-6">
          <h1 className="text-[18px] font-sora font-bold text-white">{t('video.edition.titre')}</h1>
          <p className="text-[13.5px] text-slate-300 mt-2">{erreur || t('video.edition.echecChargement')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 font-inter" data-testid="edition-video">
      <button type="button" onClick={() => navigate('/dashboard/contenus')} className="inline-flex items-center gap-1.5 text-[13px] text-slate-400 hover:text-white mb-4"><ArrowLeft className="w-4 h-4" />{t('video.edition.retour')}</button>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-semibold">{t('video.edition.sur')}</p>
          <h1 className="text-[22px] font-sora font-bold text-white leading-tight mt-1">{t('video.edition.titre')}</h1>
          <p className="text-[13px] text-slate-400 mt-1 max-w-[62ch]">{t('video.edition.aide')}</p>
        </div>
        <button type="button" onClick={refaire} disabled={envoi || statut === 'en_traitement' || !info.editable} data-testid="edition-refaire"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-sora font-semibold text-white bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] hover:opacity-90 disabled:opacity-40 shadow-[0_0_12px_rgba(91,108,255,.3)]">
          {envoi || statut === 'en_traitement' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
          {statut === 'en_traitement' ? t('video.edition.enCours', { etape: etape || '…' }) : t('video.edition.refaire')}
        </button>
      </div>

      {!info.editable && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] text-amber-200 text-[13px] px-4 py-3">{t('video.edition.nonEditable')}</div>
      )}

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)] items-start">
        {/* Lecteur */}
        <aside className="lg:sticky lg:top-[78px]">
          <div className="relative rounded-2xl overflow-hidden bg-black border border-white/10" style={{ aspectRatio: '9 / 16' }}>
            <video ref={video} key={info.video_url} src={info.video_url} playsInline className="w-full h-full object-contain" onEnded={() => setLecture(false)} />
            <button type="button" onClick={jouer} className="absolute inset-0 grid place-items-center text-white/90"><span className="w-12 h-12 rounded-full bg-black/55 grid place-items-center">{lecture ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}</span></button>
            {statut === 'en_traitement' && <div className="absolute inset-x-0 bottom-0 bg-black/70 text-[12px] text-slate-200 px-3 py-2 text-center">{t('video.edition.nouvelleVersion')}</div>}
          </div>
          <p className="text-[11.5px] text-slate-600 mt-2 text-center">{t('video.edition.noteCalage')}</p>
        </aside>

        <div className="grid gap-4 min-w-0">
          {/* Transcription */}
          <section className="rounded-2xl border border-white/[0.07] bg-slate-950/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-semibold">{t('video.edition.transcription')}</p>
                <p className="text-xs text-slate-500 mt-0.5">{t('video.edition.transcriptionAide')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={supprimerSelection} disabled={!selection} data-testid="edition-supprimer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold border border-[#F26B6B]/40 text-[#F26B6B] hover:bg-[#F26B6B]/10 disabled:opacity-40"><Scissors className="w-3.5 h-3.5" />{t('video.edition.supprimerPassage')}</button>
                <button type="button" onClick={restaurerSelection} disabled={!selection}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold border border-white/10 text-slate-300 hover:border-white/25 disabled:opacity-40"><Undo2 className="w-3.5 h-3.5" />{t('video.edition.restaurer')}</button>
                {nbSupprimes > 0 && <button type="button" onClick={toutRestaurer} className="px-3 py-1.5 rounded-lg text-[12.5px] text-slate-400 hover:text-white">{t('video.edition.toutRestaurer')}</button>}
              </div>
            </div>
            <div className="leading-[2.1] text-[15px]" data-testid="edition-mots">
              {mots.map((w, i) => {
                const sel = selection && i >= selection.a && i <= selection.b;
                if (edition === i) {
                  return (
                    <input key={i} autoFocus defaultValue={w.text} onBlur={(e) => corriger(i, e.target.value.trim() || w.text)}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEdition(null); }}
                      className="inline-block w-[10ch] mx-0.5 px-1.5 rounded bg-slate-900 border border-[#3AFFA3] text-white text-[14px] outline-none" />
                  );
                }
                return (
                  <button key={i} type="button" onClick={(e) => clicMot(i, e)} onDoubleClick={() => !w.supprime && setEdition(i)} title={`${fmt(w.start)} · ${t('video.edition.doubleClic')}`}
                    className={`inline-block mx-[1px] px-1 rounded transition-colors ${w.supprime ? 'line-through text-slate-600 bg-[#F26B6B]/10' : i === motActif ? 'bg-[#3AFFA3] text-[#0b1322] font-semibold' : sel ? 'bg-[#5B6CFF]/40 text-white' : 'text-slate-200 hover:bg-white/10'}`}>
                    {w.text}
                  </button>
                );
              })}
            </div>
            <p className="text-[11.5px] text-slate-500 mt-3">{t('video.edition.bilan', { n: nbSupprimes, s: dureeSupprimee.toFixed(1) })}</p>
          </section>

          {/* Réglages */}
          <section className="rounded-2xl border border-white/[0.07] bg-slate-950/40 p-4 grid gap-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-semibold">{t('video.edition.reglages')}</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="grid gap-1.5 text-[12.5px] text-slate-300">{t('video.edition.style')}
                <select value={options.preset || 'classic'} onChange={(e) => regle('preset', e.target.value)} className="bg-slate-950/60 border border-white/10 text-slate-200 text-[13px] rounded-lg px-3 py-2 outline-none focus:border-[#5B6CFF]/50">
                  {presets.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label className="grid gap-1.5 text-[12.5px] text-slate-300">{t('video.edition.musique')}
                <select value={options.music_id || 'none'} onChange={(e) => regle('music_id', e.target.value)} className="bg-slate-950/60 border border-white/10 text-slate-200 text-[13px] rounded-lg px-3 py-2 outline-none focus:border-[#5B6CFF]/50">
                  <option value="none">{t('video.edition.aucuneMusique')}</option>
                  {musiques.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </label>
              <label className="grid gap-1.5 text-[12.5px] text-slate-300 sm:col-span-2">{t('video.edition.accroche')}
                <input value={options.hook || ''} maxLength={80} onChange={(e) => regle('hook', e.target.value)} placeholder={t('video.edition.accrochePlaceholder')}
                  className="bg-slate-950/60 border border-white/10 text-slate-200 text-[13px] rounded-lg px-3 py-2 outline-none focus:border-[#5B6CFF]/50" />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {[['cuts', 'coupes'], ['zoom', 'zooms'], ['emojis', 'emojis'], ['brolls', 'brolls'], ['audio_clean', 'audio']].map(([k, lib]) => (
                <button key={k} type="button" onClick={() => regle(k, !options[k])} aria-pressed={!!options[k]}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12.5px] font-semibold ${options[k] ? 'border-[#3AFFA3] text-[#3AFFA3] bg-[#3AFFA3]/[0.08]' : 'border-white/10 text-slate-400 hover:border-white/25'}`}>
                  {options[k] && <Check className="w-3 h-3" />}{t(`video.edition.${lib}`)}
                </button>
              ))}
            </div>
            <p className="text-[11.5px] text-slate-600">{t('video.edition.cout')}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
