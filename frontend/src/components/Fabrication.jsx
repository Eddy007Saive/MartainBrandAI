import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Clapperboard } from 'lucide-react';

/**
 * Indicateurs de FABRICATION longue (reel ~2 min, carrousel, slides).
 * Pas d'avancement serveur : les étapes sont indicatives, calées sur le temps
 * écoulé — l'utilisateur voit que ça travaille, où ça en est, depuis combien
 * de temps.
 *  - <OverlayFabrication/> : plein écran (page Studio Reel, on attend sur place)
 *  - <PillFabrication/>    : pastille flottante (page Contenus, on peut continuer)
 */

function useEtapes(actif) {
  const { t } = useTranslation();
  const [sec, setSec] = useState(0);
  useEffect(() => {
    if (!actif) { setSec(0); return undefined; }
    const it = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(it);
  }, [actif]);
  const etape = sec < 18 ? t('contenus.reel.fab.etape1')
    : sec < 95 ? t('contenus.reel.fab.etape2')
    : t('contenus.reel.fab.etape3');
  const mmss = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  // Progression estimée (~2 min), plafonnée à 95 % tant que le serveur n'a pas répondu
  const pct = Math.min(95, Math.round((sec / 130) * 100));
  return { etape, mmss, pct };
}

export function OverlayFabrication({ actif }) {
  const { t } = useTranslation();
  const { etape, mmss, pct } = useEtapes(actif);
  if (!actif) return null;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[#020617]/88 backdrop-blur-md">
      <div className="w-[min(420px,90vw)] rounded-2xl border border-white/[0.08] bg-[#0f172a] p-7 text-center shadow-2xl">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-[#5B6CFF]/25 to-[#8A6CFF]/25 grid place-items-center mb-4">
          <Clapperboard className="w-6 h-6 text-[#8A6CFF] animate-pulse" />
        </div>
        <h3 className="font-sora font-bold text-white text-lg">{t('contenus.reel.fab.titre')}</h3>
        <p className="text-[13px] text-slate-400 font-inter mt-1.5 min-h-[20px]">{etape}</p>
        <div className="mt-5 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-[#5B6CFF] to-[#3AFFA3] transition-all duration-1000"
            style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 text-[11px] text-slate-500 font-inter tabular-nums">{mmss}</div>
        <p className="text-[11.5px] text-slate-500 font-inter mt-4 leading-relaxed">{t('contenus.reel.fab.note')}</p>
      </div>
    </div>
  );
}

export function PillFabrication({ actif, label }) {
  const { etape, mmss } = useEtapes(actif);
  if (!actif) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[55] flex items-center gap-3 rounded-2xl border border-white/[0.1] bg-[#0f172a]/95 backdrop-blur-md pl-3.5 pr-4 py-3 shadow-2xl max-w-[86vw]">
      <Loader2 className="w-[18px] h-[18px] animate-spin text-[#8A6CFF] shrink-0" />
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold font-sora text-white truncate">{label}</div>
        <div className="text-[11px] text-slate-400 font-inter truncate">{etape} · {mmss}</div>
      </div>
    </div>
  );
}
