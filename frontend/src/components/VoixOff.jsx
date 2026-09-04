import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, Mic, Pause, Play } from 'lucide-react';
import { contenuService } from '../services/contenuService';

/**
 * Bloc « Voix off » d'un reel : un interrupteur, trois voix du catalogue à écouter,
 * et « Ma voix » (le clone du client, créé dans Paramètres › Voix de marque).
 *
 * `valeur` = id de la voix retenue (victor|yann|adina|moi) ou null = pas de voix.
 * Le composant charge lui-même le catalogue ; il n'affiche rien si la voix off
 * n'est pas disponible sur le serveur (clé absente), pour ne pas promettre à vide.
 */
const ONDE = [0, 0.15, 0.3, 0.45];

export default function VoixOff({ valeur, onChange }) {
  const { t } = useTranslation();
  const [cat, setCat] = useState(null);
  const [joue, setJoue] = useState(null);      // id de la voix en écoute
  const audio = useRef(null);
  const [memoire, setMemoire] = useState(null); // dernière voix choisie, pour ré-allumer

  useEffect(() => {
    contenuService.reelVoix().then((c) => {
      setCat(c);
      // Première ouverture : on propose la voix par défaut du compte, éteinte.
      setMemoire(c?.defaut || 'victor');
    }).catch(() => setCat({ disponible: false }));
    return () => { if (audio.current) { audio.current.pause(); audio.current = null; } };
  }, []);

  if (!cat || !cat.disponible) return null;

  const on = !!valeur;
  const clone = cat.clone || {};
  const cloneOk = !!clone.existe;
  const basculer = () => {
    arreter();
    onChange(on ? null : (memoire || cat.defaut || 'victor'));
  };
  const choisir = (id) => { setMemoire(id); onChange(id); };

  const arreter = () => {
    if (audio.current) { audio.current.pause(); audio.current = null; }
    setJoue(null);
  };
  const ecouter = (e, id, url) => {
    e.stopPropagation();
    if (joue === id) { arreter(); return; }
    arreter();
    if (!url) return;
    const a = new Audio(url);
    a.onended = () => setJoue(null);
    a.play().then(() => { audio.current = a; setJoue(id); }).catch(() => setJoue(null));
  };

  const voix = [
    ...(cat.voix || []).map((v) => ({ ...v, nom: t(`voixOff.voix.${v.id}.nom`), desc: t(`voixOff.voix.${v.id}.desc`) })),
    { id: 'moi', nom: t('voixOff.maVoix'), verrou: !cloneOk, apercu: clone.apercu,
      desc: cloneOk ? t('voixOff.maVoixPrete') : t('voixOff.maVoixAbsente') },
  ];
  const nomChoisi = voix.find((v) => v.id === valeur)?.nom;

  return (
    <div data-testid="reel-voix-off">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase flex items-center gap-2">
          {t('voixOff.titre')}
          <span className="text-[9.5px] px-1.5 py-0.5 rounded-full bg-[#3AFFA3]/10 text-[#3AFFA3] border border-[#3AFFA3]/25 tracking-[0.06em]">{t('voixOff.nouveau')}</span>
        </div>
        <button type="button" role="switch" aria-checked={on} aria-label={t('voixOff.activer')} onClick={basculer}
          data-testid="reel-voix-inter"
          className={`relative w-[42px] h-6 rounded-full transition-colors ${on ? 'bg-[#3AFFA3]' : 'bg-white/10'}`}>
          <span className={`absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full transition-transform ${on ? 'translate-x-[18px] bg-[#04130c]' : 'bg-white'}`} />
        </button>
      </div>

      {on && (
        <div className="mt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {voix.map((v) => {
              const actif = valeur === v.id;
              const enEcoute = joue === v.id;
              const contenu = (
                <>
                  <button type="button" onClick={(e) => ecouter(e, v.id, v.apercu)} disabled={v.verrou || !v.apercu}
                    aria-label={t('voixOff.ecouter')} data-testid={`reel-voix-ecouter-${v.id}`}
                    className={`w-9 h-9 rounded-[10px] border grid place-items-center shrink-0 transition-all ${enEcoute ? 'border-[#3AFFA3]/60 text-[#3AFFA3] bg-[#3AFFA3]/10' : 'border-white/10 text-slate-400 hover:border-white/30 hover:text-white'} ${v.verrou ? 'border-dashed' : ''}`}>
                    {v.verrou ? <Mic className="w-3.5 h-3.5" />
                      : enEcoute ? <span className="flex items-end gap-[2px] h-3.5">{ONDE.map((d) => <i key={d} className="block w-[2px] rounded-sm bg-current animate-onde" style={{ animationDelay: `${d}s` }} />)}</span>
                      : <Play className="w-3.5 h-3.5" />}
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[13.5px] font-semibold text-white font-inter">
                      {v.nom}
                      {v.id === 'moi' && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#8A6CFF]/15 text-[#c4b5fd] border border-[#8A6CFF]/30 font-bold tracking-wide">PRO</span>}
                    </span>
                    <span className="block text-[12px] text-slate-500 font-inter leading-snug">{v.desc}</span>
                  </span>
                  <span className={`w-[18px] h-[18px] rounded-full border-[1.5px] grid place-items-center shrink-0 ${actif ? 'border-[#3AFFA3] bg-[#3AFFA3] text-[#04130c]' : 'border-white/10 text-transparent'}`}>
                    <Check className="w-[11px] h-[11px]" strokeWidth={3} />
                  </span>
                </>
              );
              const classes = `flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${actif ? 'border-[#3AFFA3]/55 bg-[#3AFFA3]/[0.05]' : 'border-white/10 bg-slate-950/40 hover:border-white/25'} ${v.verrou ? 'opacity-60' : ''}`;
              return v.verrou
                ? <Link key={v.id} to="/dashboard/parametres?s=marque" className={classes} data-testid="reel-voix-moi-creer" title={t('voixOff.maVoixAbsente')}>{contenu}</Link>
                : <button key={v.id} type="button" onClick={() => choisir(v.id)} className={classes} data-testid={`reel-voix-${v.id}`}>{contenu}</button>;
            })}
          </div>
          <div className="mt-2 flex items-start justify-between gap-3 text-[11.5px] text-slate-500 font-inter">
            <span>{valeur === 'moi' ? t('voixOff.resumeMoi') : t('voixOff.resume', { nom: nomChoisi || '' })}</span>
            {!cloneOk && <Link to="/dashboard/parametres?s=marque" className="shrink-0 font-semibold text-[#a5b0ff] hover:underline">{t('voixOff.creerMaVoix')}</Link>}
          </div>
        </div>
      )}
      <style>{`@keyframes onde{0%,100%{height:4px}50%{height:14px}} .animate-onde{height:4px;animation:onde 1s ease-in-out infinite}`}</style>
    </div>
  );
}
