import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, Loader2, Mic, Pause, Play, Square, Upload } from 'lucide-react';
import { contenuService } from '../services/contenuService';
import { useUser } from '../context/UserContext';

/**
 * Paramètres › Voix de marque › « Ma voix » : le client enregistre (ou dépose) une à
 * deux minutes d'audio, coche le consentement, et ElevenLabs crée un clone qui dira
 * ses reels. Quatre états : aucune voix / enregistrement / création / prête.
 * Réservé au forfait payé (le badge Pro le dit, le serveur le vérifie).
 */
const RICO = 'https://res.cloudinary.com/dy9gp5pim/image/upload/w_300,q_auto,f_auto/brand/rico-v4/';
const MIN_S = 45;      // en dessous, le serveur refuse (clone médiocre)
const CIBLE_S = 60;

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Le texte à lire pendant l'enregistrement : une minute de parole variée (une
 *  question, une affirmation, une phrase posée), personnalisée avec le prénom et
 *  le secteur. Lire quelque chose évite le « euh… je dis quoi ? » qui gâche la prise. */
function TexteALire({ ouvertParDefaut = false }) {
  const { t } = useTranslation();
  const { user } = useUser();
  const [ouvert, setOuvert] = useState(ouvertParDefaut);
  const nom = (user?.nom || user?.user_name || '').trim().split(/\s+/)[0] || t('maVoix.lecture.nomDefaut');
  const secteur = (user?.secteur || '').trim();
  const texte = [t('maVoix.lecture.intro', { nom }), secteur ? t('maVoix.lecture.secteur', { secteur }) : '', t('maVoix.lecture.corps')]
    .filter(Boolean).join(' ');
  return (
    <div className="mt-3.5 rounded-xl border border-white/[0.08] bg-slate-950/40" data-testid="ma-voix-texte">
      <button type="button" onClick={() => setOuvert((o) => !o)} className="w-full flex items-center justify-between px-3.5 py-2.5 text-left">
        <span className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{t('maVoix.lecture.titre')}</span>
        <span className="text-[12px] text-[#a5b0ff] font-inter">{ouvert ? t('maVoix.lecture.masquer') : t('maVoix.lecture.voir')}</span>
      </button>
      {ouvert && (
        <div className="px-4 pb-4">
          <p className="font-sora text-[17px] sm:text-[19px] leading-[1.55] text-white/95">{texte}</p>
          <p className="mt-2.5 text-[12px] text-slate-500 font-inter">{t('maVoix.lecture.aide')}</p>
        </div>
      )}
    </div>
  );
}

export default function MaVoix() {
  const { t } = useTranslation();
  const [cat, setCat] = useState(null);
  const [etat, setEtat] = useState('aucune');       // aucune | enregistrement | analyse | prete
  const [consent, setConsent] = useState(false);
  const [fichier, setFichier] = useState(null);      // Blob/File prêt à envoyer
  const [secondes, setSecondes] = useState(0);
  const [joue, setJoue] = useState(false);
  const rec = useRef(null); const morceaux = useRef([]); const timer = useRef(null); const audio = useRef(null);

  const charger = () => contenuService.reelVoix().then((c) => {
    setCat(c);
    setEtat(c?.clone?.existe ? 'prete' : 'aucune');
  }).catch(() => setCat({ disponible: false }));
  useEffect(() => { charger(); return () => { clearInterval(timer.current); if (audio.current) audio.current.pause(); }; }, []);

  if (!cat || !cat.disponible) return null;
  const clone = cat.clone || {};
  const autorise = !!cat.clone_autorise;
  const migration = clone.migration !== false;

  // ---- enregistrement micro
  const demarrerEnregistrement = async () => {
    try {
      const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      const r = new MediaRecorder(flux, type ? { mimeType: type } : undefined);
      morceaux.current = [];
      r.ondataavailable = (e) => { if (e.data.size) morceaux.current.push(e.data); };
      r.onstop = () => {
        flux.getTracks().forEach((p) => p.stop());
        const blob = new Blob(morceaux.current, { type: r.mimeType || 'audio/webm' });
        setFichier(new File([blob], 'enregistrement.webm', { type: blob.type }));
        setEtat('aucune');
      };
      rec.current = r; r.start(1000);
      setSecondes(0); setEtat('enregistrement');
      timer.current = setInterval(() => setSecondes((s) => s + 1), 1000);
    } catch (e) {
      toast.error(t('maVoix.microRefuse'));
    }
  };
  const arreterEnregistrement = () => { clearInterval(timer.current); rec.current?.stop(); };

  const creer = async () => {
    if (!fichier || !consent) return;
    setEtat('analyse');
    try {
      const s = await contenuService.reelVoixCloner(fichier, true);
      setCat((c) => ({ ...c, clone: s, defaut: s.defaut || c.defaut }));
      setFichier(null); setConsent(false);
      setEtat('prete');
      toast.success(t('maVoix.creee'));
    } catch (e) {
      setEtat('aucune');
      toast.error(e.response?.data?.detail || t('maVoix.echec'));
    }
  };
  const supprimer = async () => {
    if (!window.confirm(t('maVoix.confirmerSuppression'))) return;
    try {
      const s = await contenuService.reelVoixSupprimer();
      setCat((c) => ({ ...c, clone: s })); setEtat('aucune'); toast.success(t('maVoix.supprimee'));
    } catch (e) { toast.error(e.response?.data?.detail || t('maVoix.echec')); }
  };
  const ecouter = () => {
    if (joue) { audio.current?.pause(); setJoue(false); return; }
    if (!clone.apercu) return;
    const a = new Audio(clone.apercu); a.onended = () => setJoue(false);
    a.play().then(() => { audio.current = a; setJoue(true); }).catch(() => setJoue(false));
  };

  const pose = etat === 'prete' ? 'pouce-leve' : etat === 'analyse' ? 'idee' : 'annonce';

  return (
    <div data-testid="ma-voix" className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0b1222]">
      <div className="p-5 pr-5 md:pr-[190px]">
        <h3 className="font-sora text-[16px] font-bold text-white flex items-center gap-2.5 flex-wrap">
          {t('maVoix.titre')}
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#8A6CFF]/15 text-[#c4b5fd] border border-[#8A6CFF]/30 font-bold tracking-wide">PRO</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#3AFFA3]/10 text-[#3AFFA3] border border-[#3AFFA3]/25 font-bold tracking-wide uppercase">{t('voixOff.nouveau')}</span>
        </h3>
        <p className="mt-1 text-[13px] text-slate-400 font-inter max-w-[56ch]">{t('maVoix.sous')}</p>

        {!migration && <p className="mt-4 text-[12.5px] text-amber-300/90 font-inter">{t('maVoix.indisponible')}</p>}
        {migration && !autorise && etat !== 'prete' && (
          <p className="mt-4 text-[12.5px] text-slate-400 font-inter">{t('maVoix.reserveePro')}</p>
        )}

        {migration && autorise && etat === 'aucune' && (
          <div className="mt-4">
            <div className="rounded-[14px] border border-dashed border-white/20 bg-white/[0.015] p-5 grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 items-center">
              <div className="flex flex-col items-center gap-2 text-center">
                <button type="button" onClick={demarrerEnregistrement} data-testid="ma-voix-enregistrer"
                  className="w-14 h-14 rounded-full grid place-items-center border border-red-400/40 bg-red-400/10 text-red-300 hover:bg-red-400/20 active:scale-95 transition-all">
                  <Mic className="w-5 h-5" />
                </button>
                <p className="text-[12.5px] text-slate-400 font-inter"><b className="text-white">{t('maVoix.enregistrer')}</b><br />{t('maVoix.enregistrerSous')}</p>
              </div>
              <span className="text-[11px] uppercase tracking-[0.1em] text-slate-600 text-center">{t('maVoix.ou')}</span>
              <div className="flex flex-col items-center gap-2 text-center">
                <label className="w-14 h-14 rounded-full grid place-items-center border border-white/15 text-white hover:bg-white/[0.06] cursor-pointer active:scale-95 transition-all" data-testid="ma-voix-deposer">
                  <input type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) setFichier(f); e.target.value = ''; }} />
                  <Upload className="w-5 h-5" />
                </label>
                <p className="text-[12.5px] text-slate-400 font-inter"><b className="text-white">{t('maVoix.deposer')}</b><br />{t('maVoix.deposerSous')}</p>
              </div>
            </div>
            {fichier && (
              <p className="mt-3 text-[12.5px] text-[#3AFFA3] font-inter flex items-center gap-2" data-testid="ma-voix-fichier">
                <Check className="w-3.5 h-3.5" /> {t('maVoix.fichierPret', { nom: fichier.name, taille: Math.max(1, Math.round(fichier.size / 1024)) })}
                <button type="button" onClick={() => setFichier(null)} className="text-slate-500 hover:text-white">{t('maVoix.retirer')}</button>
              </p>
            )}
            <ul className="mt-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px] text-slate-400 font-inter">
              {['c1', 'c2', 'c3'].map((k) => (
                <li key={k} className="px-3 py-2 rounded-[10px] bg-white/[0.03] border border-white/[0.06]"><b className="text-white">{t(`maVoix.conseils.${k}.t`)}</b> {t(`maVoix.conseils.${k}.s`)}</li>
              ))}
            </ul>
            <TexteALire />
            <label className="mt-3.5 flex items-start gap-2.5 p-3 rounded-xl border border-white/10 bg-slate-950/50 text-[12.5px] text-slate-400 font-inter cursor-pointer">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-[#3AFFA3]" data-testid="ma-voix-consent" />
              <span>{t('maVoix.consentement')}</span>
            </label>
            <button type="button" onClick={creer} disabled={!fichier || !consent} data-testid="ma-voix-creer"
              className="mt-3 w-full h-11 rounded-xl text-[14px] font-semibold text-white bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] disabled:opacity-50 hover:opacity-90 active:scale-[0.98]">
              {t('maVoix.creer')}
            </button>
          </div>
        )}

        {etat === 'enregistrement' && (<>
          <div className="mt-4 rounded-[14px] border border-dashed border-white/20 p-5 flex items-center gap-4">
            <span className="w-14 h-14 rounded-full grid place-items-center border border-red-400/40 bg-red-400/10 text-red-300 animate-pulse"><span className="w-4 h-4 rounded-sm bg-current" /></span>
            <div className="flex-1 min-w-0">
              <b className="text-white font-inter">{t('maVoix.enCours')} <span className="font-sora tabular-nums">{fmt(secondes)}</span></b>
              <div className="h-1.5 rounded-full bg-white/10 mt-2 overflow-hidden"><i className="block h-full rounded-full bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF]" style={{ width: `${Math.min(100, (secondes / 120) * 100)}%` }} /></div>
              <p className="text-[11.5px] text-slate-500 font-inter mt-1.5">
                {secondes < MIN_S ? t('maVoix.encore', { s: MIN_S - secondes }) : secondes < CIBLE_S ? t('maVoix.presque') : t('maVoix.assez')}
              </p>
            </div>
            <button type="button" onClick={arreterEnregistrement} disabled={secondes < 5} data-testid="ma-voix-arreter"
              className="h-10 px-4 rounded-[11px] border border-white/15 text-white text-sm font-semibold hover:border-white/30 disabled:opacity-50 flex items-center gap-2"><Square className="w-3.5 h-3.5" />{t('maVoix.arreter')}</button>
          </div>
          <TexteALire ouvertParDefaut />
        </>)}

        {etat === 'analyse' && (
          <div className="mt-4 flex items-center gap-3.5 p-3.5 rounded-[14px] border border-[#8A6CFF]/35 bg-[#8A6CFF]/[0.06]">
            <span className="w-11 h-11 rounded-xl grid place-items-center bg-[#8A6CFF]/15 text-[#c4b5fd]"><Loader2 className="w-5 h-5 animate-spin" /></span>
            <div className="flex-1"><b className="block text-white font-inter">{t('maVoix.analyse')}</b><span className="text-[12.5px] text-slate-400 font-inter">{t('maVoix.analyseSous')}</span></div>
          </div>
        )}

        {etat === 'prete' && (
          <div className="mt-4">
            <div className="flex items-center gap-3.5 p-3.5 rounded-[14px] border border-[#3AFFA3]/30 bg-[#3AFFA3]/[0.05]">
              <span className="w-11 h-11 rounded-xl grid place-items-center bg-[#3AFFA3]/12 text-[#3AFFA3]"><Check className="w-5 h-5" strokeWidth={2.5} /></span>
              <div className="flex-1 min-w-0">
                <b className="block text-white font-inter">{t('maVoix.prete')}</b>
                <span className="text-[12.5px] text-slate-400 font-inter">
                  {t('maVoix.preteSous', { date: clone.cree_le ? new Date(clone.cree_le).toLocaleDateString('fr-FR') : '', duree: clone.duree_s ? fmt(clone.duree_s) : '' })}
                </span>
              </div>
              <button type="button" onClick={ecouter} disabled={!clone.apercu} aria-label={t('voixOff.ecouter')} data-testid="ma-voix-ecouter"
                className={`w-10 h-10 rounded-[11px] border grid place-items-center ${joue ? 'border-[#3AFFA3]/60 text-[#3AFFA3] bg-[#3AFFA3]/10' : 'border-white/10 text-slate-300 hover:border-white/30'} disabled:opacity-40`}>
                {joue ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-[12.5px] font-inter">
              <button type="button" onClick={() => { setEtat('aucune'); }} className="font-semibold text-[#a5b0ff] hover:underline">{t('maVoix.reenregistrer')}</button>
              <button type="button" onClick={supprimer} className="font-semibold text-red-300 hover:underline" data-testid="ma-voix-supprimer">{t('maVoix.supprimer')}</button>
              <span className="ml-auto text-slate-600">{t('maVoix.consentementLe', { date: clone.consentement_le ? new Date(clone.consentement_le).toLocaleDateString('fr-FR') : '' })}</span>
            </div>
          </div>
        )}
      </div>
      <img src={`${RICO}${pose}.png`} alt="" aria-hidden="true"
        className="hidden md:block absolute right-3 bottom-0 h-[150px] pointer-events-none drop-shadow-[0_14px_22px_rgba(0,0,0,.5)]" />
    </div>
  );
}
