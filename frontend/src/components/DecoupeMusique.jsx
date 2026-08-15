import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Pause, Scissors, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { contenuService } from '../services/contenuService';

const mmss = (s) => `${Math.floor((s || 0) / 60)}:${String(Math.floor((s || 0) % 60)).padStart(2, '0')}`;

/**
 * Découpe d'une musique importée : le client garde le passage qui l'intéresse
 * (le refrain, en général) au lieu du morceau entier.
 *
 * Non destructif — on n'enregistre que deux bornes, appliquées à la volée par
 * Cloudinary. Gain mesuré : 5,4 Mo -> 313 Ko pour 20 s retenues, soit autant de
 * moins à télécharger avant CHAQUE rendu.
 */
export default function DecoupeMusique({ piste, onChange }) {
  const { t } = useTranslation();
  const audioRef = useRef(null);
  const arretRef = useRef(null);                       // timer de fin d'extrait
  const [total, setTotal] = useState(0);               // durée du morceau
  const [debut, setDebut] = useState(piste?.debut_s ?? 0);
  const [duree, setDuree] = useState(piste?.duree_s ?? 20);
  const [joue, setJoue] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  // Nouvelle piste sélectionnée -> on repart de ses bornes enregistrées
  useEffect(() => {
    setDebut(piste?.debut_s ?? 0);
    setDuree(piste?.duree_s ?? 20);
    setTotal(0);
    stop();
  }, [piste?.id]);                                     // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { clearTimeout(arretRef.current); }, []);

  const stop = () => {
    clearTimeout(arretRef.current);
    if (audioRef.current) audioRef.current.pause();
    setJoue(false);
  };

  const ecouter = () => {
    const a = audioRef.current;
    if (!a) return;
    if (joue) { stop(); return; }
    a.currentTime = debut;
    a.play().then(() => {
      setJoue(true);
      // On ne joue QUE l'extrait : arrêt automatique au bout de la durée retenue.
      arretRef.current = setTimeout(stop, duree * 1000);
    }).catch(() => setJoue(false));
  };

  const enregistrer = async () => {
    setEnvoi(true);
    try {
      const m = await contenuService.reelMusiqueDecouper(piste.id, debut, duree);
      onChange?.(m);
      toast.success(t('contenus.reel.seq.coupeOk', { debut: mmss(debut), duree: Math.round(duree) }));
    } catch (e) {
      toast.error(e.response?.data?.detail || t('contenus.reel.seq.coupeEchec'));
    } finally { setEnvoi(false); }
  };

  const max = total || 180;
  const finExtrait = Math.min(debut + duree, max);
  const modifie = (piste?.debut_s ?? 0) !== debut || (piste?.duree_s ?? 20) !== duree;

  return (
    <div className="mt-2.5 rounded-xl border border-white/[0.07] bg-slate-950/40 p-3">
      <div className="flex items-center gap-2 mb-2.5">
        <Scissors className="w-3.5 h-3.5 text-[#8A6CFF]" />
        <span className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">{t('contenus.reel.seq.couper')}</span>
        <span className="ml-auto text-[11.5px] text-[#3AFFA3] font-inter tabular-nums">
          {mmss(debut)} → {mmss(finExtrait)}
        </span>
      </div>

      {/* Début du passage */}
      <label className="block text-[11px] text-slate-500 font-inter mb-1">{t('contenus.reel.seq.debut')}</label>
      <input type="range" min="0" max={Math.max(0, max - 1)} step="0.5" value={Math.min(debut, max)}
        onChange={(e) => { setDebut(parseFloat(e.target.value)); stop(); }}
        className="w-full accent-[#8A6CFF] h-1.5" />

      {/* Durée retenue */}
      <label className="block text-[11px] text-slate-500 font-inter mt-2 mb-1">
        {t('contenus.reel.seq.duree', { n: Math.round(duree) })}
      </label>
      <input type="range" min="5" max="60" step="1" value={duree}
        onChange={(e) => { setDuree(parseFloat(e.target.value)); stop(); }}
        className="w-full accent-[#3AFFA3] h-1.5" />

      <div className="flex items-center gap-2 mt-3">
        <button type="button" onClick={ecouter}
          className={`inline-flex items-center gap-1.5 text-[12.5px] font-inter px-3 py-1.5 rounded-lg border transition-all active:scale-95 ${joue ? 'border-[#3AFFA3]/60 text-[#3AFFA3] bg-[#3AFFA3]/10' : 'border-white/10 text-slate-300 hover:border-white/25'}`}>
          {joue ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          {t('contenus.reel.seq.ecouterExtrait')}
        </button>
        <button type="button" onClick={enregistrer} disabled={envoi || !modifie}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold font-inter text-white px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] hover:opacity-90 active:scale-95 disabled:opacity-40">
          {envoi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {t('contenus.reel.seq.garderExtrait')}
        </button>
        {total > 0 && <span className="ml-auto text-[11px] text-slate-600 tabular-nums">{mmss(total)}</span>}
      </div>

      <audio ref={audioRef} src={piste?.url} preload="metadata" className="hidden"
        onLoadedMetadata={(e) => setTotal(e.currentTarget.duration || 0)}
        onEnded={stop} />
    </div>
  );
}
