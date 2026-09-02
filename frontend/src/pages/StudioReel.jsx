import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Clapperboard, Maximize2, X, ChevronLeft, ChevronRight, Play, Pause, Loader2, ArrowLeft, Plus } from 'lucide-react';
import { contenuService } from '../services/contenuService';
import { OverlayFabrication } from '../components/Fabrication';
import DecoupeMusique from '../components/DecoupeMusique';

/**
 * Studio Reel — création LIBRE d'un reel Séquence en pleine page.
 * Même moteur que le dialogue Séquence de Contenus (templates, banque, musique),
 * mais avec l'espace d'une vraie page : galerie à gauche, réglages à droite.
 * La modification d'un reel existant reste dans le popup de Contenus.
 */
export default function StudioReel() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [templates, setTemplates] = useState([]);
  const [musiques, setMusiques] = useState([]);
  const [musicCats, setMusicCats] = useState([]);
  const [banque, setBanque] = useState(null);        // null = chargement
  const [style, setStyle] = useState('signature');
  const [zoom, setZoom] = useState(null);            // index lightbox
  const [brief, setBrief] = useState('');
  const [reseau, setReseau] = useState('Instagram');
  const [images, setImages] = useState([]);          // {url, desc, src}
  const [musique, setMusique] = useState('none');
  const [mp3, setMp3] = useState(false);          // import d'un MP3 perso en cours
  const [playing, setPlaying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    contenuService.reelTemplates().then((d) => {
      const tpls = Array.isArray(d) ? d : d?.templates;
      if (tpls?.length) setTemplates(tpls.filter((x) => x.id.startsWith('sequence')));
      if (d?.musiques?.length) setMusiques(d.musiques);
      if (d?.categories?.length) setMusicCats(d.categories);
    }).catch(() => {});
    contenuService.reelBanque().then(setBanque).catch(() => setBanque([]));
  }, []);
  useEffect(() => () => { if (audioRef.current) audioRef.current.pause(); }, []);

  const stopPreview = () => { if (audioRef.current) audioRef.current.pause(); setPlaying(false); };

  // Import d'une musique du client : elle rejoint sa bibliothèque et devient la piste choisie.
  const importerMp3 = async (file) => {
    if (!file) return;
    setMp3(true);
    try {
      const m = await contenuService.reelMusiqueImporter(file);
      setMusiques((prev) => [m, ...prev]);
      setMusicCats((prev) => (prev.some((c) => c.id === 'perso')
        ? prev : [{ id: 'perso', label: t('contenus.reel.seq.mesMusiques') }, ...prev]));
      setMusique(m.id);
      toast.success(t('contenus.reel.seq.mp3Ajoute', { nom: m.label }));
    } catch (e) {
      toast.error(e.response?.data?.detail || t('contenus.reel.seq.mp3Echec'));
    } finally { setMp3(false); }
  };
  const togglePreview = () => {
    const m = musiques.find((x) => x.id === musique);
    const a = audioRef.current;
    if (!a || !m?.url) return;
    if (playing) { a.pause(); setPlaying(false); return; }
    a.src = m.url; a.currentTime = 0;
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };

  const toggleImage = (img) => {
    setImages((prev) => prev.some((i) => i.url === img.url)
      ? prev.filter((i) => i.url !== img.url)
      : (prev.length >= 6 ? prev : [...prev, { url: img.url, desc: img.description || '', src: 'banque', apercu_url: img.apercu_url || null, type: img.type || 'image' }]));
  };
  const upload = async (files) => {
    const list = Array.from(files || []).slice(0, 6 - images.length);
    if (!list.length) return;
    setUploading(true);
    try {
      for (const f of list) {
        const a = await contenuService.reelBanqueAjouter(f);   // entre dans la banque (conservée)
        setBanque((prev) => [a, ...(prev || [])]);
        setImages((prev) => prev.length >= 6 ? prev : [...prev, { url: a.url, desc: a.description || '', src: 'banque' }]);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || t('contenus.reel.seq.uploadEchec'));
    } finally { setUploading(false); }
  };

  const generer = async () => {
    if (!brief.trim()) { toast.error(t('contenus.reel.seq.briefRequis')); return; }
    stopPreview();
    setGenerating(true);
    try {
      // Réponse immédiate : le rendu se fait en arrière-plan (worker), la carte
      // « Rendu en cours » prend le relais dans Contenus, puis une notification.
      await contenuService.creerReel({
        brief: brief.trim(),
        images: images.map((i) => ({ url: i.url, desc: i.desc || null })),
        reseau, style, musique,
      });
      toast.success(t('contenus.toast.reelEnFile'));
      navigate('/dashboard/contenus');
    } catch (e) {
      toast.error(e.response?.data?.detail || t('contenus.toast.reelEchec'));
      setGenerating(false);
    }
  };

  const nomDe = (tpl) => tpl.id === 'sequence' ? 'Signature' : tpl.label.replace(/^Séquence\s*—\s*/, '');

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1280px] mx-auto">
      <OverlayFabrication actif={generating} />
      {/* En-tête */}
      <div className="flex items-center gap-3 mb-1.5">
        <button type="button" onClick={() => navigate('/dashboard/contenus')}
          className="w-9 h-9 rounded-lg border border-white/10 grid place-items-center text-slate-400 hover:text-white hover:border-white/25 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-xl sm:text-2xl font-bold font-sora flex items-center gap-2.5">
          <Clapperboard className="w-5 h-5 text-[#8A6CFF]" />{t('contenus.reel.seq.creerTitre')}
        </h1>
      </div>
      <p className="text-[13.5px] text-slate-400 font-inter mb-6 ml-12">{t('contenus.reel.seq.description')}</p>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-7 items-start">
        {/* ---- GAUCHE : galerie de templates ---- */}
        <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a] p-4 sm:p-5">
          <div className="flex items-baseline gap-2 mb-3.5">
            <span className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{t('contenus.reel.seq.tplTitre')}</span>
            {(() => {
              const cur = templates.find((x) => (x.id === 'sequence' ? 'signature' : x.id.split('-')[1]) === style);
              return cur ? <span className="ml-auto text-[12px] font-semibold text-[#3AFFA3]">✓ {nomDe(cur)}</span> : null;
            })()}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-[repeat(auto-fill,minmax(118px,1fr))] gap-3.5">
            {templates.map((tpl, idx) => {
              const st = tpl.id === 'sequence' ? 'signature' : tpl.id.split('-')[1];
              const on = style === st;
              return (
                <div key={tpl.id} role="button" tabIndex={0} onClick={() => setStyle(st)} data-testid={`studio-reel-style-${st}`}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setStyle(st); } }}
                  className="group relative cursor-pointer transition-transform hover:-translate-y-0.5 active:scale-95">
                  <div className={`relative aspect-[9/16] rounded-xl overflow-hidden bg-[#060b18] border-[1.5px] transition-all ${on ? 'border-[#3AFFA3] shadow-[0_0_0_1.5px_#3AFFA3,0_8px_30px_rgba(58,255,163,0.14)]' : 'border-white/[0.09] group-hover:border-[#8A6CFF]/60'}`}>
                    {tpl.apercu && <video src={tpl.apercu} autoPlay muted loop playsInline className="w-full h-full object-cover" />}
                    <button type="button" title={t('contenus.reel.seq.agrandir')} aria-label={t('contenus.reel.seq.agrandir')}
                      onClick={(e) => { e.stopPropagation(); setZoom(idx); }}
                      className="absolute top-1.5 right-1.5 z-[3] w-[26px] h-[26px] rounded-lg border border-white/25 bg-[#020617]/75 text-white grid place-items-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity backdrop-blur-sm cursor-zoom-in active:scale-90">
                      <Maximize2 className="w-3 h-3" />
                    </button>
                    {on && <span className="absolute right-1.5 bottom-1.5 z-[2] w-[22px] h-[22px] rounded-full bg-[#3AFFA3] text-[#05261a] grid place-items-center text-[11px] font-extrabold">✓</span>}
                  </div>
                  <div className={`mt-1.5 text-center text-[11.5px] font-sora font-bold truncate ${on ? 'text-[#3AFFA3]' : 'text-slate-300'}`}>{nomDe(tpl)}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ---- DROITE : sujet, réseau, images, musique, CTA ---- */}
        <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a] p-4 sm:p-5 space-y-5">
          <div>
            <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase mb-2">{t('contenus.reel.seq.briefSujet')}</div>
            <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={4} maxLength={500}
              placeholder={t('contenus.reel.seq.briefPh')} data-testid="studio-reel-brief"
              className="w-full bg-slate-950/60 border border-white/10 text-slate-200 text-[13px] font-inter rounded-lg px-3 py-2 outline-none focus:border-[#5B6CFF]/50 resize-none" />
          </div>

          <div>
            <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase mb-2">{t('contenus.reel.seq.reseau')}</div>
            <select value={reseau} onChange={(e) => setReseau(e.target.value)}
              className="w-full bg-slate-950/60 border border-white/10 text-slate-200 text-[13px] font-inter rounded-lg px-3 py-2 outline-none focus:border-[#5B6CFF]/50">
              {['Instagram', 'TikTok', 'Facebook', 'LinkedIn', 'YouTube'].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {/* Visuels choisis */}
          {images.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase mb-2">{t('contenus.reel.seq.choisis')}</div>
              <div className="flex flex-wrap gap-2">
                {images.map((img, idx) => (
                  <div key={img.url} className="relative w-14 h-14 rounded-lg overflow-hidden border border-[#3AFFA3]/40">
                    <img src={img.apercu_url || img.url} alt="" className="w-full h-full object-cover" />
                              {img.type === 'video' && <span className="absolute top-1 left-1 z-[2] text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/75 text-white">▶</span>}
                    <span className="absolute bottom-0.5 left-0.5 text-[10px] font-bold text-white bg-black/60 rounded px-1">{idx + 1}</span>
                    <button type="button" onClick={() => setImages((p) => p.filter((i) => i.url !== img.url))}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white text-[12px] leading-none">×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className={`inline-flex items-center gap-2 text-[13px] font-inter font-semibold px-3.5 py-2 rounded-[10px] border border-dashed cursor-pointer transition-colors ${uploading || images.length >= 6 ? 'border-white/10 text-slate-600 cursor-not-allowed' : 'border-[#5B6CFF]/50 text-[#a5b0ff] hover:bg-[#5B6CFF]/10'}`}>
              <input type="file" accept="image/*,video/mp4,video/quicktime,.mp4,.mov" multiple className="hidden" disabled={uploading || images.length >= 6}
                onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
              {uploading ? t('contenus.reel.seq.envoi') : t('contenus.reel.seq.importer')}
            </label>
            <span className="ml-2 text-[11px] text-slate-500 font-inter">{images.length}/6</span>
          </div>

          {/* Banque */}
          <div>
            <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase mb-2">{t('contenus.reel.seq.banque')}</div>
            {banque === null ? (
              <div className="text-xs text-slate-500 font-inter">…</div>
            ) : banque.length === 0 ? (
              <div className="text-xs text-slate-500 font-inter">{t('contenus.reel.seq.banqueVide')}</div>
            ) : (
              <div className="grid grid-cols-5 gap-2 max-h-[150px] overflow-y-auto pr-1">
                {banque.map((img) => {
                  const on = images.some((i) => i.url === img.url);
                  return (
                    <button key={img.id} type="button" onClick={() => toggleImage(img)} title={img.description || ''}
                      className={`relative aspect-square rounded-lg overflow-hidden border transition-all ${on ? 'border-[#3AFFA3] ring-2 ring-[#3AFFA3]/40' : 'border-white/10 hover:border-white/30'}`}>
                      <img src={img.apercu_url || img.url} alt="" className="w-full h-full object-cover" />
                              {img.type === 'video' && <span className="absolute top-1 left-1 z-[2] text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/75 text-white">▶</span>}
                      {on && <span className="absolute inset-0 bg-[#3AFFA3]/20 grid place-items-center text-[#3AFFA3] font-bold">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Musique */}
          {musiques.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase mb-2">{t('contenus.reel.seq.musique')}</div>
              <div className="flex items-center gap-2">
                <select value={musique} onChange={(e) => { setMusique(e.target.value); stopPreview(); }}
                  className="flex-1 bg-slate-950/60 border border-white/10 text-slate-200 text-[13px] font-inter rounded-lg px-3 py-2 outline-none focus:border-[#5B6CFF]/50">
                  <option value="none">{t('contenus.reel.seq.sansMusique')}</option>
                  {musicCats.map((c) => (
                    <optgroup key={c.id} label={c.label}>
                      {musiques.filter((m) => m.category === c.id).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </optgroup>
                  ))}
                </select>
                <button type="button" onClick={togglePreview} disabled={musique === 'none'}
                  title={t('contenus.reel.seq.ecouter')} aria-label={t('contenus.reel.seq.ecouter')}
                  className={`w-9 h-9 rounded-lg border grid place-items-center transition-all active:scale-95 shrink-0 ${musique === 'none' ? 'border-white/[0.06] text-slate-700' : playing ? 'border-[#3AFFA3]/60 text-[#3AFFA3] bg-[#3AFFA3]/10' : 'border-white/10 text-slate-300 hover:border-white/25'}`}>
                  {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <label title={t('contenus.reel.seq.importerMp3')} aria-label={t('contenus.reel.seq.importerMp3')}
                  className={`w-9 h-9 shrink-0 rounded-lg border grid place-items-center transition-all active:scale-95 cursor-pointer ${mp3 ? 'border-white/[0.06] text-slate-700' : 'border-[#5B6CFF]/40 text-[#a5b0ff] hover:bg-[#5B6CFF]/10'}`}>
                  <input type="file" accept="audio/*,.mp3,.m4a,.wav" className="hidden" disabled={mp3}
                    onChange={(e) => { importerMp3(e.target.files?.[0]); e.target.value = ''; }} />
                  {mp3 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </label>
              </div>
              <p className="text-[11px] text-slate-600 font-inter mt-1.5">{t('contenus.reel.seq.mp3Aide')}</p>
              {(() => {
                const p = musiques.find((m) => m.id === musique && m.category === 'perso');
                return p ? <DecoupeMusique piste={p} onChange={(m) => setMusiques((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)))} /> : null;
              })()}
              <audio ref={audioRef} onEnded={() => setPlaying(false)} className="hidden" />
            </div>
          )}

          <button type="button" onClick={generer} disabled={generating || uploading} data-testid="studio-reel-generer"
            className="w-full text-[14px] font-semibold font-inter text-white px-5 py-3 rounded-xl bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] hover:opacity-90 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2">
            {generating ? <><Loader2 className="w-4 h-4 animate-spin" />{t('contenus.reel.seq.envoi')}</> : t('contenus.reel.seq.monter')}
          </button>
        </div>
      </div>

      {/* ---- LIGHTBOX ---- */}
      {zoom !== null && templates[zoom] && (() => {
        const tpl = templates[zoom];
        const st = tpl.id === 'sequence' ? 'signature' : tpl.id.split('-')[1];
        const prev = () => setZoom((zoom - 1 + templates.length) % templates.length);
        const next = () => setZoom((zoom + 1) % templates.length);
        return (
          <div className="fixed inset-0 z-[60] grid place-items-center bg-[#020617]/85 backdrop-blur-md" onClick={() => setZoom(null)}>
            <button type="button" aria-label={t('contenus.actions.annuler')} onClick={(e) => { e.stopPropagation(); setZoom(null); }}
              className="absolute top-5 right-6 w-10 h-10 rounded-xl border border-white/15 bg-[#0f172a]/85 text-white grid place-items-center hover:bg-[#5B6CFF]/30 active:scale-95 transition-all"><X className="w-[18px] h-[18px]" /></button>
            {templates.length > 1 && (<>
              <button type="button" onClick={(e) => { e.stopPropagation(); prev(); }}
                className="absolute left-4 sm:left-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full border border-white/15 bg-[#0f172a]/85 text-white grid place-items-center hover:bg-[#5B6CFF]/30 active:scale-95 transition-all"><ChevronLeft className="w-5 h-5" /></button>
              <button type="button" onClick={(e) => { e.stopPropagation(); next(); }}
                className="absolute right-4 sm:right-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full border border-white/15 bg-[#0f172a]/85 text-white grid place-items-center hover:bg-[#5B6CFF]/30 active:scale-95 transition-all"><ChevronRight className="w-5 h-5" /></button>
            </>)}
            <div className="flex flex-col md:flex-row items-center gap-5 md:gap-9 px-4" onClick={(e) => e.stopPropagation()}>
              <div className="h-[52vh] md:h-[74vh] aspect-[9/16] rounded-2xl overflow-hidden border border-white/15 shadow-2xl bg-[#060b18] shrink-0">
                {tpl.apercu && <video key={tpl.id} src={tpl.apercu} autoPlay muted loop playsInline className="w-full h-full object-cover" />}
              </div>
              <div className="max-w-[330px] text-center md:text-left">
                <div className="text-[11px] font-bold tracking-[0.16em] uppercase text-[#3AFFA3]">{t('contenus.reel.seq.apercuTpl')}</div>
                <h2 className="font-sora font-extrabold text-white text-2xl md:text-3xl mt-2 tracking-tight">{nomDe(tpl)}</h2>
                <p className="text-sm text-slate-400 font-inter leading-relaxed mt-3">{tpl.desc}</p>
                {(tpl.tags || []).length > 0 && (
                  <div className="flex gap-2 flex-wrap justify-center md:justify-start mt-4">
                    {tpl.tags.map((x) => <span key={x} className="text-[11px] text-slate-500 border border-white/10 rounded-full px-2.5 py-0.5">{x}</span>)}
                  </div>
                )}
                <div className="flex gap-2.5 justify-center md:justify-start mt-6">
                  <button type="button" onClick={() => setZoom(null)}
                    className="text-[13px] font-inter text-slate-400 hover:text-white px-4 py-2 rounded-lg border border-white/10">{t('contenus.actions.annuler')}</button>
                  <button type="button" onClick={() => { setStyle(st); setZoom(null); }}
                    className="text-[13px] font-semibold font-inter text-white px-5 py-2 rounded-lg bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] hover:opacity-90 active:scale-[0.97]">
                    {t('contenus.reel.seq.choisirTpl')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
