import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Pause, Scissors, X, Plus } from 'lucide-react';

// Découpe d'un clip vidéo pour le Studio Reel : deux poignées (début, fin) sur une barre, un
// lecteur qui ne joue que le morceau choisi. Le morceau part tel quel au rendu (Remotion) :
// ce que le client voit ici est ce qu'il aura. 1 s minimum, 15 s maximum (un plan de reel).
const MIN_S = 1;
const MAX_S = 15;
const fmt = (s) => {
  const m = Math.floor(s / 60); const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, '0')}`;
};

export default function DecoupeClip({ url, debut, fin, onChange, onSplit, onClose, verrou = false }) {
  const { t } = useTranslation();
  const video = useRef(null);
  const barre = useRef(null);
  const [duree, setDuree] = useState(0);
  const [tete, setTete] = useState(debut || 0);
  const [lecture, setLecture] = useState(false);
  const [drag, setDrag] = useState(null);   // 'debut' | 'fin' | 'tete'
  const d = debut ?? 0;
  const f = fin ?? Math.min(duree || MAX_S, MAX_S);

  // Métadonnées : durée réelle du clip ; une fin absente = min(clip, 15 s)
  const surMeta = () => {
    const v = video.current; if (!v) return;
    setDuree(v.duration || 0);
    if (fin == null) onChange(d, Math.min(v.duration || MAX_S, d + MAX_S));
    v.currentTime = d;
  };
  // Lecture bornée au morceau
  useEffect(() => {
    const v = video.current; if (!v) return undefined;
    const tick = () => {
      setTete(v.currentTime);
      if (v.currentTime >= f - 0.05) { v.currentTime = d; if (!lecture) v.pause(); }
    };
    v.addEventListener('timeupdate', tick);
    return () => v.removeEventListener('timeupdate', tick);
  }, [d, f, lecture]);

  const jouer = () => {
    const v = video.current; if (!v) return;
    if (lecture) { v.pause(); setLecture(false); return; }
    if (v.currentTime < d || v.currentTime >= f - 0.05) v.currentTime = d;
    v.play().then(() => setLecture(true)).catch(() => setLecture(false));
  };

  // Position souris -> seconde
  const seconde = useCallback((clientX) => {
    const r = barre.current?.getBoundingClientRect(); if (!r || !duree) return 0;
    const x = Math.min(Math.max(clientX - r.left, 0), r.width);
    return Math.round((x / r.width) * duree * 10) / 10;
  }, [duree]);

  useEffect(() => {
    if (!drag) return undefined;
    const move = (e) => {
      const s = seconde(e.clientX);
      if (drag === 'debut') onChange(Math.min(s, f - MIN_S), Math.min(f, Math.min(s, f - MIN_S) + MAX_S));
      else if (drag === 'fin') onChange(Math.max(d, s - MAX_S), Math.max(s, d + MIN_S));
      else if (video.current) { video.current.currentTime = Math.min(Math.max(s, d), f); setTete(video.current.currentTime); }
    };
    const up = () => setDrag(null);
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [drag, d, f, seconde, onChange]);

  const pct = (s) => (duree ? `${(s / duree) * 100}%` : '0%');
  const longueur = Math.max(0, f - d);

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3 space-y-3" data-testid="decoupe-clip">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-200 font-inter"><Scissors className="w-4 h-4 text-[#3AFFA3]" />{t('contenus.reel.seq.decoupeTitre')}</div>
        <button type="button" onClick={onClose} className="w-7 h-7 grid place-items-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10" title={t('contenus.reel.seq.decoupeFermer')}><X className="w-4 h-4" /></button>
      </div>
      <p className="text-[11.5px] text-slate-500 font-inter">{verrou ? t('contenus.reel.seq.decoupeIA') : t('contenus.reel.seq.decoupeAide')}</p>

      <div className="relative rounded-lg overflow-hidden bg-black mx-auto" style={{ aspectRatio: '9 / 16', maxHeight: 300 }}>
        <video ref={video} src={url} preload="metadata" playsInline onLoadedMetadata={surMeta} onEnded={() => setLecture(false)} className="w-full h-full object-cover" />
        <button type="button" onClick={jouer} data-testid="decoupe-lire"
          className="absolute inset-0 grid place-items-center text-white/90 hover:text-white">
          <span className="w-12 h-12 rounded-full bg-black/55 grid place-items-center">{lecture ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}</span>
        </button>
      </div>

      {/* Barre : zone gardée en menthe, poignées début/fin, tête de lecture */}
      <div ref={barre} className={`relative h-8 rounded-md bg-slate-800 select-none ${verrou ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}
        onPointerDown={(e) => { if (e.target === barre.current) { const s = seconde(e.clientX); if (video.current) { video.current.currentTime = Math.min(Math.max(s, d), f); } setDrag('tete'); } }}>
        <div className="absolute inset-y-0 bg-[#3AFFA3]/25 border-y border-[#3AFFA3]/60" style={{ left: pct(d), width: pct(longueur) }} />
        <div className="absolute inset-y-0 w-0.5 bg-white/80" style={{ left: pct(Math.min(Math.max(tete, d), f)) }} />
        {[['debut', d], ['fin', f]].map(([cle, val]) => (
          <button key={cle} type="button" aria-label={t(`contenus.reel.seq.decoupe${cle === 'debut' ? 'Debut' : 'Fin'}`)} data-testid={`decoupe-${cle}`}
            onPointerDown={(e) => { e.stopPropagation(); setDrag(cle); }}
            className="absolute top-0 bottom-0 w-3 -ml-1.5 rounded-sm bg-[#3AFFA3] shadow-[0_0_0_1px_#0b1322] cursor-ew-resize touch-none"
            style={{ left: pct(val) }} />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] font-inter text-slate-300">
        <span>{t('contenus.reel.seq.decoupeDebut')} <b className="font-mono">{fmt(d)}</b> · {t('contenus.reel.seq.decoupeFin')} <b className="font-mono">{fmt(f)}</b> · {t('contenus.reel.seq.decoupeDuree')} <b className="font-mono">{longueur.toFixed(1)} s</b></span>
        {longueur >= MAX_S - 0.05 && <span className="text-amber-300/90">{t('contenus.reel.seq.decoupeMax')}</span>}
      </div>

      {!verrou && (
        <button type="button" onClick={onSplit} data-testid="decoupe-morceau"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#a5b0ff] hover:text-white font-inter">
          <Plus className="w-3.5 h-3.5" />{t('contenus.reel.seq.morceauAjouter')}
        </button>
      )}
    </div>
  );
}
