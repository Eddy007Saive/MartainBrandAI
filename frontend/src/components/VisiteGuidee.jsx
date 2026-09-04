import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import { useDemarrage } from '../context/DemarrageContext';
import { useUser } from '../context/UserContext';

/**
 * Visite guidée des premiers pas : l'écran s'assombrit sauf l'élément à utiliser,
 * une bulle explique quoi faire, et on passe à l'étape suivante quand l'action est
 * RÉELLEMENT faite (état serveur, jamais au clic). Les trois premières étapes
 * bloquent tout le reste de l'interface ; les suivantes guident sans bloquer.
 *
 * Le blocage ne repose pas sur la géométrie : un écouteur en phase de capture
 * arrête tout clic/touche dont la cible n'est pas dans un élément autorisé
 * (cibles de l'étape, bulle, barre latérale). Le voile n'est que visuel (SVG avec
 * des trous, pointer-events: none) — robuste au responsive et au défilement.
 *
 * Rico accompagne chaque bulle avec une pose différente (même banque d'images
 * que le mur de paiement : brand/rico-v4). L'étape « carte » n'a pas de bulle
 * propre : elle ouvre directement le mur de paiement, déjà illustré.
 */
const RICO = 'https://res.cloudinary.com/dy9gp5pim/image/upload/w_300,q_auto,f_auto/brand/rico-v4/';
const rico = (pose) => `${RICO}${pose}.png`;

const ETAPES = [
  { id: 'profil', route: '/dashboard/parametres', section: 'marque', pose: 'presente-produit',
    cibles: ['[data-testid="section-marque"]'],
    autorises: ['[data-testid="section-marque"]', '[data-testid="barre-enregistrer"]', '[data-testid="save-btn"]',
      '[data-testid^="settings-nav-"]'] },
  { id: 'reseau', route: '/dashboard/parametres', section: 'connections', pose: 'pointe-haut',
    cibles: ['[data-testid="section-connections"]'],
    autorises: ['[data-testid="section-connections"]', '[data-testid^="settings-nav-"]'] },
  { id: 'carte', route: '/dashboard/parametres', section: 'abonnement', pose: 'presente-calme',
    cibles: ['[data-testid="mur-demarrer"]', '[data-testid^="abonnement-"]'],
    autorises: ['[data-testid="mur-paiement"]', '[data-testid^="abonnement-"]', '[data-testid^="settings-nav-"]'] },
  { id: 'sujets', route: '/dashboard/studio', pose: 'idee', cibles: ['[data-testid="studio-generer-sujets"]'] },
  // Le post généré reste dans le Studio jusqu'au clic « Valider » : c'est lui qui crée
  // le contenu. Priorité des cibles : Valider (brouillon présent) > Générer > la carte sujet.
  { id: 'post', route: '/dashboard/studio', pose: 'annonce',
    cibles: ['[data-testid^="studio-valider-"]', '[data-testid^="studio-generer-post-"]', '[data-testid^="studio-sujet-"]'] },
  { id: 'validation', route: '/dashboard/contenus', pose: 'pouce-leve', cibles: ['[data-testid^="contenu-valider-"]'] },
];
const POSE_FIN = 'clin-oeil';
const BLOQUANTES = new Set(['profil', 'reseau', 'carte']);
const MARGE = 8;
const LARGEUR_BULLE = 440;

const cleTerminee = (tid) => `postorico_visite_terminee_${tid}`;
const clePlusTard = (tid) => `postorico_visite_plus_tard_${tid}`;
const lire = (store, k) => { try { return store.getItem(k); } catch (e) { return null; } };
const ecrire = (store, k, v) => { try { store.setItem(k, v); } catch (e) { /* ignore */ } };

// Le même halo que sur le mur de paiement : la bulle et le mur forment une famille.
const HALO = 'radial-gradient(ellipse at 92% 112%, rgba(58,255,163,.13), transparent 55%),'
           + 'radial-gradient(ellipse at 74% 122%, rgba(91,108,255,.2), transparent 62%)';

function Rico({ pose, hauteur = 150 }) {
  return (
    <div className="relative self-end" style={{ minHeight: hauteur - 20 }}>
      <span aria-hidden="true"
        className="absolute left-1/2 -translate-x-1/2 bottom-0 w-[120px] h-[100px] rounded-full blur-[24px]
                   bg-[radial-gradient(circle,rgba(58,255,163,.22),transparent_66%)]" />
      <img src={rico(pose)} alt="" aria-hidden="true" draggable="false"
        style={{ height: hauteur }}
        className="absolute inset-x-0 mx-auto bottom-0 w-auto object-contain pointer-events-none
                   drop-shadow-[0_16px_24px_rgba(0,0,0,.5)]" />
    </div>
  );
}

export default function VisiteGuidee() {
  const { t } = useTranslation();
  const { etat, visiteForcee, setVisiteForcee, rafraichir } = useDemarrage();
  const { user } = useUser();
  const location = useLocation();
  const navigate = useNavigate();
  const tid = user?.telegram_id || 'anon';
  const bulleRef = useRef(null);
  const murDejaOuvert = useRef(false);
  const derniereCible = useRef(null);
  const [rects, setRects] = useState([]);
  const [murOuvert, setMurOuvert] = useState(false);
  const [finVue, setFinVue] = useState(false);
  const [vuUneEtape, setVuUneEtape] = useState(false);
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);

  const etape = useMemo(() => (etat?.courante ? ETAPES.find((e) => e.id === etat.courante) : null), [etat]);
  const index = etape ? ETAPES.findIndex((e) => e.id === etape.id) : -1;
  const bloquant = !!etape && BLOQUANTES.has(etape.id);
  const terminee = lire(localStorage, cleTerminee(tid)) === '1';
  const plusTard = lire(sessionStorage, clePlusTard(tid)) === '1' && !visiteForcee;

  // Écran de fin : une seule fois, et seulement si on a vu au moins une étape dans
  // cette session (un compte déjà complet ne doit jamais le voir).
  const montrerFin = !!etat?.termine && !terminee && vuUneEtape && !finVue;
  // Une étape bloquante revient toujours (carte retirée, réseau déconnecté…), même
  // après l'écran de fin : sans elle, rien ne marche, autant le montrer.
  const visible = !!etape && (bloquant || (!terminee && !plusTard));

  useEffect(() => { if (visible) setVuUneEtape(true); }, [visible]);

  // Bonne page ? (pathname + section ?s= pour Paramètres)
  const surLaBonnePage = useMemo(() => {
    if (!etape) return false;
    if (location.pathname !== etape.route) return false;
    if (!etape.section) return true;
    return new URLSearchParams(location.search).get('s') === etape.section;
  }, [etape, location.pathname, location.search]);

  const yAller = () => {
    if (!etape) return;
    navigate(etape.section ? `${etape.route}?s=${etape.section}` : etape.route);
  };

  // Un ex-abonné n'a plus droit à l'essai : on ouvre le mur « retour », pas « 14 jours ».
  const ancienAbonne = !!(etat?.etapes || []).find((e) => e.id === 'carte')?.ancien_abonne;
  const ouvrirMur = () => {
    window.dispatchEvent(new CustomEvent('postorico:mur-paiement', {
      detail: { message: t('demarrage.etapes.carte.texte'), raison: ancienAbonne ? 'canceled' : 'no_subscription' },
    }));
  };

  // Étape « carte » : le mur de paiement (avec Rico) s'ouvre de lui-même, une seule
  // fois par arrivée sur l'étape. S'il est fermé, la bulle reprend avec « Ajouter ma carte ».
  useEffect(() => {
    const surCarte = visible && etape?.id === 'carte';
    if (!surCarte) { murDejaOuvert.current = false; return; }
    if (murDejaOuvert.current) return;
    murDejaOuvert.current = true;
    ouvrirMur();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, etape?.id]);

  // Le mur de paiement (z-95) passe au-dessus, et le menu mobile (z-40) passerait
  // dessous : dans les deux cas on met le voile et la bulle en pause.
  useEffect(() => {
    if (!visible) return undefined;
    const pause = () => !!document.querySelector('[data-testid="mur-paiement"], [data-menu-mobile]');
    const obs = new MutationObserver(() => setMurOuvert(pause()));
    obs.observe(document.body, { childList: true, subtree: true });
    setMurOuvert(pause());
    return () => obs.disconnect();
  }, [visible]);

  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Trous du voile : rectangles des cibles, recalculés en continu (scroll, resize, mise en page).
  useEffect(() => {
    if (!visible || murOuvert) { setRects([]); return undefined; }
    let raf = 0;
    const tick = () => {
      const els = etape.cibles.map((s) => document.querySelector(s)).filter(Boolean);
      // Cible hors écran (ex. bouton « Générer » en bas d'une carte) : on l'amène
      // en vue une fois par élément, sinon le voile n'a pas de trou et la bulle flotte.
      if (els[0] && derniereCible.current !== els[0]) {
        derniereCible.current = els[0];
        const b = els[0].getBoundingClientRect();
        if (b.top < 0 || b.bottom > window.innerHeight) {
          // Une section plus haute que l'écran se cale en haut, pas au centre.
          const haute = b.height > window.innerHeight * 0.6;
          els[0].scrollIntoView({ behavior: 'smooth', block: haute ? 'start' : 'center' });
        }
      }
      const el = els[0] ? [els[0]] : [];
      const r = el.map((e) => {
        const b = e.getBoundingClientRect();
        return { x: b.left - MARGE, y: b.top - MARGE, w: b.width + 2 * MARGE, h: b.height + 2 * MARGE };
      }).filter((b) => b.w > 0 && b.h > 0);
      setRects((prev) => (JSON.stringify(prev) === JSON.stringify(r) ? prev : r));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, murOuvert, etape]);

  // Blocage : rien ne réagit en dehors des éléments autorisés (étapes 1-3).
  useEffect(() => {
    if (!visible || !bloquant || murOuvert) return undefined;
    const autorises = [...(etape.autorises || []), ...etape.cibles, 'aside', '[data-visite-libre]', '[data-testid="notif-bell"]'];
    const estAutorise = (cible) => {
      if (!(cible instanceof Element)) return false;
      if (bulleRef.current && bulleRef.current.contains(cible)) return true;
      return autorises.some((s) => cible.closest(s));
    };
    const bloquer = (e) => {
      if (estAutorise(e.target)) return;
      e.stopPropagation();
      e.preventDefault();
    };
    const types = ['click', 'mousedown', 'pointerdown', 'touchstart', 'keydown'];
    types.forEach((ty) => document.addEventListener(ty, bloquer, true));
    return () => types.forEach((ty) => document.removeEventListener(ty, bloquer, true));
  }, [visible, bloquant, murOuvert, etape]);

  const fermerFin = () => {
    ecrire(localStorage, cleTerminee(tid), '1');
    setFinVue(true);
    setVisiteForcee(false);
  };

  const plusTardClic = () => {
    ecrire(sessionStorage, clePlusTard(tid), '1');
    setVisiteForcee(false);
  };

  // ---------------------------------------------------------------- écran de fin
  if (montrerFin) {
    const val = (etat.etapes || []).find((e) => e.id === 'validation') || {};
    const date = val.date_premiere_publication
      ? new Date(val.date_premiere_publication).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
      : null;
    return (
      <div role="dialog" aria-modal="true" data-testid="visite-fin"
        className="fixed inset-0 z-[70] grid place-items-center p-4 bg-[#020617]/80 backdrop-blur-sm animate-fondu motion-reduce:animate-none">
        <div className="relative w-[min(600px,100%)] overflow-hidden rounded-[20px] border border-white/[0.09] bg-[#0f172a]
                        shadow-[inset_0_1px_0_rgba(255,255,255,.055),0_20px_50px_-18px_rgba(0,0,0,.85)]
                        animate-monter [animation-duration:260ms] motion-reduce:animate-none">
          <span aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ backgroundImage: HALO }} />
          <div className="relative grid sm:grid-cols-[1fr_170px] gap-4 p-7 sm:p-8">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.11em] text-[#3AFFA3] font-inter">
                <span className="w-[5px] h-[5px] rounded-full bg-[#3AFFA3]" />
                {t('demarrage.etape', { n: ETAPES.length, total: ETAPES.length })}
              </span>
              <h2 className="mt-3 font-sora text-[23px] sm:text-[26px] font-bold leading-[1.16] tracking-[-0.5px] text-white">
                {t('demarrage.fin.titre')}
              </h2>
              <p className="mt-2.5 max-w-[46ch] text-[14px] leading-[1.62] text-slate-400 font-inter">
                {date ? t('demarrage.fin.texteDate', { date }) : t('demarrage.fin.texte')}
              </p>
              <button type="button" onClick={fermerFin} data-testid="visite-fin-ok"
                className="mt-6 inline-flex items-center gap-2.5 h-12 px-6 rounded-[13px] font-inter font-semibold text-[15px] text-white
                           bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] active:scale-[0.97] hover:brightness-110
                           shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_2px_5px_rgba(0,0,0,0.3),0_14px_30px_-9px_rgba(91,108,255,0.65)]">
                {t('demarrage.fin.ok')} <Sparkles className="w-[18px] h-[18px]" />
              </button>
            </div>
            <div className="hidden sm:block">
              <Rico pose={POSE_FIN} hauteur={230} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!visible || murOuvert) return null;

  // ---------------------------------------------------------------- bulle
  const manquants = (etat.etapes || []).find((e) => e.id === 'profil')?.manquants || [];
  const r0 = rects[0];
  let styleBulle;
  if (mobile) {
    styleBulle = { left: 16, right: 16, bottom: 16 };
  } else if (!r0) {
    // Pas de cible à l'écran : bulle centrée en bas, largeur fixe (pas un bandeau).
    // (pas de transform : l'animation « monter » en fixe un et l'écraserait)
    styleBulle = { left: `calc(50% - ${LARGEUR_BULLE / 2}px)`, bottom: 24, width: LARGEUR_BULLE };
  } else {
    const dessous = r0.y + r0.h + 12;
    const placerDessous = dessous + 240 < window.innerHeight;
    // La cible occupe presque tout l'écran (une section entière de Paramètres) :
    // la bulle se pose dans le coin bas-droit, par-dessus, plutôt que hors écran.
    const visibleH = Math.min(r0.y + r0.h, window.innerHeight) - Math.max(r0.y, 0);
    const enorme = visibleH > window.innerHeight * 0.55 && r0.w > window.innerWidth * 0.5;
    const placeADroite = r0.x + r0.w + 12 + LARGEUR_BULLE <= window.innerWidth - 16;
    const placeAGauche = r0.x - 12 - LARGEUR_BULLE >= 16;
    const left = Math.max(16, Math.min(r0.x, window.innerWidth - LARGEUR_BULLE - 16));
    const basAligne = Math.max(16, window.innerHeight - (r0.y + r0.h));
    if (enorme) {
      styleBulle = { right: 24, bottom: 24, width: LARGEUR_BULLE };
    } else if (placerDessous) {
      styleBulle = { left, top: dessous, width: LARGEUR_BULLE };
    } else if (placeADroite) {
      styleBulle = { left: r0.x + r0.w + 12, bottom: basAligne, width: LARGEUR_BULLE };
    } else if (placeAGauche) {
      // Pas de place dessous : à gauche de la cible plutôt qu'au-dessus, pour ne pas
      // recouvrir ce que l'utilisateur doit lire (ex. le post avant de le valider).
      styleBulle = { left: r0.x - 12 - LARGEUR_BULLE, bottom: basAligne, width: LARGEUR_BULLE };
    } else {
      styleBulle = { left, bottom: Math.max(16, window.innerHeight - r0.y + 12), width: LARGEUR_BULLE };
    }
  }

  return (
    <>
      <svg className="fixed inset-0 z-[60] pointer-events-none w-full h-full" width="100%" height="100%" aria-hidden="true">
        <defs>
          <mask id="visite-mask">
            <rect width="100%" height="100%" fill="white" />
            {rects.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx="14" fill="black" />)}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(2,6,23,0.72)" mask="url(#visite-mask)" />
        {rects.map((r, i) => (
          <rect key={`c${i}`} x={r.x} y={r.y} width={r.w} height={r.h} rx="14" fill="none" stroke="#8A6CFF" strokeWidth="2" />
        ))}
      </svg>

      <div ref={bulleRef} role="dialog" aria-live="polite" data-testid={`visite-etape-${etape.id}`}
        style={styleBulle}
        className="fixed z-[61] overflow-hidden rounded-[20px] border border-[#5B6CFF]/40 bg-[#0f172a]
                   shadow-[inset_0_1px_0_rgba(255,255,255,.055),0_20px_50px_-18px_rgba(0,0,0,.85)]
                   animate-monter [animation-duration:220ms] motion-reduce:animate-none">
        <span aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ backgroundImage: HALO }} />
        <div className="relative grid grid-cols-[1fr_104px] sm:grid-cols-[1fr_124px] gap-3 p-5">
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.11em] text-[#3AFFA3] font-inter">
                {t('demarrage.etape', { n: index + 1, total: ETAPES.length })}
              </span>
              {!bloquant && (
                <button type="button" onClick={plusTardClic} aria-label={t('demarrage.plusTard')} data-testid="visite-plus-tard"
                  className="w-7 h-7 grid place-items-center rounded-md text-slate-500 hover:text-white hover:bg-white/[0.06]">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <h3 className="mt-2 font-sora text-[17px] font-bold text-white leading-tight">{t(`demarrage.etapes.${etape.id}.titre`)}</h3>
            <p className="mt-1.5 text-[13.5px] text-slate-400 font-inter leading-relaxed">{t(`demarrage.etapes.${etape.id}.texte`)}</p>
            {etape.id === 'profil' && manquants.length > 0 && (
              <ul className="mt-2.5 flex flex-wrap gap-1.5">
                {manquants.map((c) => (
                  <li key={c} className="text-[11.5px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/25 font-inter">
                    {t(`demarrage.champs.${c}`)}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex items-center gap-2">
              {etape.id === 'carte' ? (
                <button type="button" onClick={ouvrirMur} data-testid="visite-ajouter-carte"
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] active:scale-[0.97]">
                  {t('demarrage.ajouterCarte')} <ArrowRight className="w-4 h-4" />
                </button>
              ) : !surLaBonnePage ? (
                <button type="button" onClick={yAller} data-testid="visite-y-aller"
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] active:scale-[0.97]">
                  {t('demarrage.yAller')} <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button type="button" onClick={() => rafraichir(true)} className="text-[12px] text-slate-500 hover:text-white font-inter">
                  {t('demarrage.jaiFait')}
                </button>
              )}
              {!bloquant && (
                <button type="button" onClick={plusTardClic} className="ml-auto text-[12px] text-slate-500 hover:text-white font-inter">
                  {t('demarrage.plusTard')}
                </button>
              )}
            </div>
          </div>
          <Rico pose={etape.pose} hauteur={mobile ? 128 : 156} />
        </div>
      </div>
    </>
  );
}
