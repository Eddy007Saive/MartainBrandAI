import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  ArrowLeft, CalendarClock, Check, Loader2, PauseCircle, PhoneCall, X,
} from 'lucide-react';

import { billingService } from '../services/billingService';
import { propsRdv } from '../lib/rdv';

/**
 * Le parcours de résiliation, en quatre écrans.
 *
 * Une règle gouverne tout le reste : **la sortie est visible et cliquable à
 * chaque écran**. Jamais cachée, jamais grisée, jamais reportée d'un clic
 * supplémentaire. Un tunnel qui retient de force produit des litiges
 * bancaires et des avis à une étoile — on retient en proposant mieux, pas en
 * fermant la porte.
 *
 * Ce qu'on cherche vraiment ici n'est pas de garder tout le monde : c'est de
 * savoir POURQUOI les gens partent. L'écran 2 est le seul dont on ne peut pas
 * se passer, et c'est aussi le seul obligatoire.
 *
 * Le parcours est raccourci pendant l'essai : quelqu'un qui n'a jamais rien
 * payé n'a pas à subir une remise de rétention ni une proposition de pause.
 * On lui demande la raison, et on le laisse partir.
 */
const RAISONS = ['prix', 'temps', 'resultats', 'complexite', 'fonctionnalite',
  'concurrent', 'test', 'autre'];

// Les raisons qui appellent une réponse ciblée. Les autres — concurrent, test,
// autre — n'en reçoivent pas : insister devant quelqu'un qui a déjà choisi
// ailleurs, ou qui n'a jamais eu l'intention de rester, n'apporte rien.
const OFFRES = {
  prix: 'appel_prix',
  temps: 'appel',
  resultats: 'appel',
  complexite: 'appel',
  fonctionnalite: 'fonctionnalite',
};

const PAUSES = [1, 2, 3];

const Bouton = ({ variante = 'sortie', children, ...reste }) => {
  const styles = {
    // Le bouton qui RETIENT : plein, en avant.
    rester: 'bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white '
          + 'shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_10px_24px_-8px_rgba(91,108,255,.6)] hover:brightness-110',
    // Le bouton qui SORT : discret, mais parfaitement lisible et cliquable.
    // Un gris trop pâle serait une façon polie de cacher la porte.
    sortie: 'bg-white/[0.04] text-slate-300 border border-white/[0.12] hover:text-white hover:border-white/25',
  };
  return (
    <button {...reste}
      className={`inline-flex items-center justify-center gap-2 h-11 px-5 rounded-[12px]
                  font-inter font-semibold text-[14px] active:scale-[0.97]
                  disabled:opacity-60 disabled:active:scale-100
                  transition-[transform,filter,color,border-color,background-color]
                  duration-150 ease-out-strong ${styles[variante]}`}>
      {children}
    </button>
  );
};

export default function Resiliation({ ouvert, surFermeture, enEssai, surChangement }) {
  const { t } = useTranslation();
  const [ecran, setEcran] = useState(1);
  const [raison, setRaison] = useState(null);
  const [commentaire, setCommentaire] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [fin, setFin] = useState(null);
  // L'identifiant de la ligne ouverte a l'ecran du motif : les issues la
  // mettent a jour au lieu d'en creer une seconde.
  const [parcours, setParcours] = useState(null);

  useEffect(() => {
    if (!ouvert) return undefined;
    setEcran(1); setRaison(null); setCommentaire(''); setFin(null); setParcours(null);
    const auClavier = (e) => { if (e.key === 'Escape') surFermeture(); };
    document.addEventListener('keydown', auClavier);
    return () => document.removeEventListener('keydown', auClavier);
  }, [ouvert, surFermeture]);

  if (!ouvert) return null;

  const partir = async () => {
    setEnvoi(true);
    try {
      const r = await billingService.resilier(raison || 'autre', commentaire, parcours);
      setFin(r.fin_acces_le || null);
      setEcran(5);
      surChangement?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('resil.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  const pause = async (mois) => {
    setEnvoi(true);
    try {
      const r = await billingService.pause(mois, raison, commentaire, parcours);
      toast.success(t('resil.pauseOk', { date: new Date(r.reprise_le).toLocaleDateString('fr-FR') }));
      surChangement?.();
      surFermeture();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('resil.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  // Les offres qui retiennent sans transaction — « rester et attendre » sur
  // une fonctionnalité manquante — se contentent de noter que la personne
  // reste. Les appels sont des liens de rendez-vous, traités a l'affichage.
  const accepterOffre = () => resterEtNoter(`attend : ${offre}`);

  // Après la raison : l'offre ciblée s'il y en a une, sinon la pause. Pendant
  // l'essai, ni l'une ni l'autre — on n'a rien encaissé, il n'y a rien à
  // sauver, et retenir quelqu'un qui n'a pas payé serait déplacé.
  const apresRaison = async () => {
    // La raison part MAINTENANT, avant toute decision. Ce qui suit peut se
    // terminer par un depart, une offre acceptee, ou une fermeture de fenetre —
    // dans ce dernier cas, sans cet appel, tout serait perdu.
    if (!parcours) {
      try {
        const o = await billingService.motifDepart(raison, commentaire);
        setParcours(o?.id || null);
      } catch { /* jamais bloquant : on ne retient personne pour un journal */ }
    }
    if (enEssai) return partir();
    return setEcran(OFFRES[raison] ? 3 : 4);
  };

  /** Elle reste, sans prendre d'offre. On note l'issue et on ferme. */
  const resterEtNoter = (detail) => {
    if (parcours) billingService.parcoursRetenu(parcours, detail).catch(() => {});
    surFermeture();
  };

  const offre = OFFRES[raison];

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="resil-titre" data-testid="resiliation"
      className="fixed inset-0 z-[96] grid place-items-center p-4 bg-[#020617]/78 backdrop-blur-sm
                 animate-fondu motion-reduce:animate-none">
      <div className="relative w-[min(560px,100%)] max-h-[92vh] overflow-y-auto rounded-[20px]
                      border border-white/[0.09] bg-[#0f172a] p-7 sm:p-8
                      shadow-[inset_0_1px_0_rgba(255,255,255,.055),0_20px_50px_-18px_rgba(0,0,0,.85)]
                      animate-monter [animation-duration:240ms] motion-reduce:animate-none">

        <button onClick={surFermeture} aria-label={t('resil.fermer')} data-testid="resil-fermer"
          className="absolute top-3.5 right-3.5 w-[30px] h-[30px] grid place-items-center rounded-[9px]
                     bg-white/[0.04] text-slate-500 hover:text-white hover:bg-white/[0.1] active:scale-90
                     transition-[color,background-color,transform] duration-150 ease-out-strong">
          <X className="w-3.5 h-3.5" />
        </button>

        {ecran > 1 && ecran < 5 && (
          <button onClick={() => setEcran(ecran - 1)} data-testid="resil-retour"
            className="inline-flex items-center gap-1.5 text-[12.5px] text-slate-500 hover:text-slate-200
                       mb-4 transition-colors duration-150">
            <ArrowLeft className="w-3.5 h-3.5" />{t('resil.retour')}
          </button>
        )}

        {/* ── 1. Faire réfléchir ─────────────────────────────────────── */}
        {ecran === 1 && (
          <>
            <h2 id="resil-titre" className="font-sora text-[22px] font-bold leading-[1.2] text-white">
              {t('resil.e1.titre')}
            </h2>
            <p className="mt-3 text-[14.5px] leading-[1.65] text-slate-400 font-inter">
              {t('resil.e1.texte')}
            </p>
            <div className="mt-7 flex flex-col sm:flex-row gap-3">
              <Bouton variante="rester" onClick={surFermeture} data-testid="resil-rester">
                {t('resil.e1.rester')}
              </Bouton>
              <Bouton onClick={() => setEcran(2)} data-testid="resil-continuer">
                {t('resil.e1.continuer')}
              </Bouton>
            </div>
          </>
        )}

        {/* ── 2. La raison. Le seul écran dont on ne peut pas se passer ── */}
        {ecran === 2 && (
          <>
            <h2 id="resil-titre" className="font-sora text-[21px] font-bold leading-[1.22] text-white">
              {t('resil.e2.titre')}
            </h2>
            <div className="mt-5 space-y-1.5">
              {RAISONS.map((r) => (
                <label key={r} data-testid={`resil-raison-${r}`}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-[11px] cursor-pointer
                              border transition-colors duration-150 ${raison === r
                                ? 'border-[#8A6CFF]/50 bg-[#5B6CFF]/[0.1]'
                                : 'border-white/[0.07] hover:border-white/20 hover:bg-white/[0.03]'}`}>
                  <input type="radio" name="raison" value={r} checked={raison === r}
                    onChange={() => setRaison(r)} className="sr-only" />
                  <span className={`w-[17px] h-[17px] rounded-full border grid place-items-center shrink-0
                                    ${raison === r ? 'border-[#8A6CFF]' : 'border-white/25'}`}>
                    {raison === r && <span className="w-[9px] h-[9px] rounded-full bg-[#8A6CFF]" />}
                  </span>
                  <span className="text-[13.5px] text-slate-300 font-inter">{t(`resil.raisons.${r}`)}</span>
                </label>
              ))}
            </div>
            <textarea value={commentaire} onChange={(e) => setCommentaire(e.target.value)}
              rows={3} placeholder={t('resil.e2.libre')} data-testid="resil-commentaire"
              className="mt-3.5 w-full rounded-[11px] bg-slate-950/60 border border-white/10
                         text-slate-200 text-[13.5px] px-3.5 py-2.5 outline-none resize-none
                         focus:border-[#5B6CFF]/50 font-inter" />
            <div className="mt-5 flex flex-col sm:flex-row gap-3">
              <Bouton variante="rester" data-testid="resil-rester-2"
                onClick={async () => {
                  // Elle a coche un motif et peut-etre ecrit un commentaire :
                  // fermer sans l'enregistrer perdrait justement ce qu'on
                  // cherchait a savoir.
                  if (raison) {
                    try {
                      const o = await billingService.motifDepart(raison, commentaire);
                      if (o?.id) await billingService.parcoursRetenu(o.id, 'a renonce');
                    } catch { /* jamais bloquant */ }
                  }
                  surFermeture();
                }}>
                {t('resil.e1.rester')}
              </Bouton>
              <Bouton onClick={apresRaison} disabled={!raison || envoi} data-testid="resil-continuer-2">
                {envoi ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {t('resil.e2.continuer')}
              </Bouton>
            </div>
            {!raison && (
              <p className="mt-2.5 text-[12px] text-slate-600 font-inter">{t('resil.e2.requis')}</p>
            )}
          </>
        )}

        {/* ── 3. La réponse à CE motif précis ────────────────────────── */}
        {ecran === 3 && (
          <>
            <h2 id="resil-titre" className="font-sora text-[21px] font-bold leading-[1.22] text-white">
              {t(`resil.e3.${offre}.titre`)}
            </h2>
            <p className="mt-3 text-[14.5px] leading-[1.65] text-slate-400 font-inter">
              {t(`resil.e3.${offre}.texte`)}
            </p>
            <div className="mt-7 flex flex-col sm:flex-row gap-3">
              {offre && offre.startsWith('appel') ? (
                <a {...propsRdv()} data-testid="resil-appel"
                  className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-[12px]
                             font-inter font-semibold text-[14px] text-white active:scale-[0.97]
                             bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] hover:brightness-110
                             shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_10px_24px_-8px_rgba(91,108,255,.6)]
                             transition-[transform,filter] duration-150 ease-out-strong">
                  <PhoneCall className="w-4 h-4" />{t(`resil.e3.${offre}.cta`)}
                </a>
              ) : (
                <Bouton variante="rester" onClick={accepterOffre} disabled={envoi}
                  data-testid="resil-offre-ok">
                  {envoi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {t(`resil.e3.${offre}.cta`)}
                </Bouton>
              )}
              <Bouton onClick={() => setEcran(4)} data-testid="resil-continuer-3">
                {t('resil.e1.continuer')}
              </Bouton>
            </div>
          </>
        )}

        {/* ── 4. La pause, puis la sortie ────────────────────────────── */}
        {ecran === 4 && (
          <>
            <h2 id="resil-titre" className="font-sora text-[21px] font-bold leading-[1.22] text-white">
              {t('resil.e4.titre')}
            </h2>
            <p className="mt-3 text-[14.5px] leading-[1.65] text-slate-400 font-inter">
              {t('resil.e4.texte')}
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2.5">
              {PAUSES.map((m) => (
                <button key={m} onClick={() => pause(m)} disabled={envoi}
                  data-testid={`resil-pause-${m}`}
                  className="flex flex-col items-center gap-1 py-3.5 rounded-[12px] border
                             border-white/[0.09] bg-white/[0.03] hover:border-[#8A6CFF]/40
                             hover:bg-white/[0.06] active:scale-[0.97] disabled:opacity-60
                             transition-[transform,border-color,background-color] duration-150 ease-out-strong">
                  <PauseCircle className="w-[18px] h-[18px] text-[#8A6CFF]" />
                  <span className="font-sora font-bold text-white text-[15px]">
                    {t('resil.e4.mois', { count: m })}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-[12.5px] text-slate-600 font-inter">{t('resil.e4.note')}</p>
            <div className="mt-6 pt-5 border-t border-white/[0.07]">
              <Bouton onClick={partir} disabled={envoi} data-testid="resil-definitif">
                {envoi ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {t('resil.e4.definitif')}
              </Bouton>
            </div>
          </>
        )}

        {/* ── Confirmation ───────────────────────────────────────────── */}
        {ecran === 5 && (
          <>
            <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase
                             tracking-[0.11em] text-slate-500 font-inter">
              <CalendarClock className="w-3.5 h-3.5" />{t('resil.fin.surTitre')}
            </span>
            <h2 id="resil-titre" className="mt-3 font-sora text-[21px] font-bold leading-[1.22] text-white">
              {t('resil.fin.titre')}
            </h2>
            <p className="mt-3 text-[14.5px] leading-[1.65] text-slate-400 font-inter">
              {fin
                ? t('resil.fin.texte', { date: new Date(fin).toLocaleDateString('fr-FR') })
                : t('resil.fin.texteSansDate')}
            </p>
            <div className="mt-7">
              <Bouton variante="rester" onClick={surFermeture} data-testid="resil-termine">
                {t('resil.fin.cta')}
              </Bouton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
