import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useUser } from '../context/UserContext';
import { useDemarrage } from '../context/DemarrageContext';
import {
  AlertTriangle, CheckCircle2, MessageCircle, CalendarDays, Clock, ArrowRight, Handshake, PenLine, RefreshCw,
  Link2Off, Film, Gauge, CreditCard, Loader2, Pencil,
} from 'lucide-react';
import { analyticsService } from '../services/analyticsService';
import { contenuService } from '../services/contenuService';
import { agentService } from '../services/agentService';
import CartePremiersPas from '../components/CartePremiersPas';
import { LogoReseau } from '../components/LogoReseau';
import { ResumePerformance } from '../components/performance/TableauPerformance';
import { erreurLisible, erreurDeConnexion } from '../lib/publication';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8A6CFF]/70';
const MOIS_KEYS = ['moisJanvier', 'moisFevrier', 'moisMars', 'moisAvril', 'moisMai', 'moisJuin', 'moisJuillet', 'moisAout', 'moisSeptembre', 'moisOctobre', 'moisNovembre', 'moisDecembre'];
const NOMS_RESEAUX = { instagram: 'Instagram', linkedin: 'LinkedIn', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', googlebusiness: 'Fiche Google', twitter: 'X' };
const idReseau = (r) => String(r || '').toLowerCase().replace(/\s+/g, '');
const nomReseau = (r) => NOMS_RESEAUX[idReseau(r)] || r || '';
// Au-delà, un quota est illimité (comptes Boss / admin) : jamais signalé.
const SEUIL_ILLIMITE = 100000;
const joursRestants = (fin) => (fin ? Math.max(0, Math.ceil((new Date(fin) - Date.now()) / 86400000)) : null);

const TONS = {
  danger: 'text-red-100 bg-red-400/10 border-red-400/40',
  attention: 'text-amber-50 bg-amber-300/10 border-amber-300/30',
  neutre: 'text-slate-100 bg-white/[0.03] border-white/10',
};
const ICONES = { danger: 'text-red-300', attention: 'text-amber-300', neutre: 'text-[#c9c1ff]' };

/**
 * Accueil : répond d'abord à « que dois-je faire, et tout va-t-il bien ? ».
 * - « À régler » (urgent : échecs d'envoi, réseau déconnecté, rendus ratés, essai, quotas, validations)
 *   puis « Quand tu as un moment » (commentaires, plan du mois) ; chaque ligne mène au travail.
 * - « Tout est en ordre » n'est affiché que si TOUTES les données ont bien été chargées.
 * - Compte neuf : seulement les Premiers pas, avec l'étape suivante comme action principale.
 */
export default function AccueilPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const langue = i18n.resolvedLanguage || i18n.language || 'fr';
  const { user } = useUser();
  const { etat: demarrage } = useDemarrage();

  const [contenus, setContenus] = useState(null); // null = chargement
  const [stats, setStats] = useState(null);
  const [plan, setPlan] = useState([]);
  const [usage, setUsage] = useState(null);
  const [erreurs, setErreurs] = useState({}); // source -> true si le chargement a échoué
  const [relance, setRelance] = useState(null);

  const charger = useCallback(() => {
    setErreurs({});
    setContenus(null);
    const echec = (cle) => () => setErreurs((e) => ({ ...e, [cle]: true }));
    const now = new Date();
    contenuService.getAll()
      .then((d) => setContenus(Array.isArray(d) ? d : (d?.contenus || [])))
      .catch(() => { setContenus([]); echec('contenus')(); });
    analyticsService.getStats().then(setStats).catch(echec('stats'));
    agentService.plan(now.getFullYear(), now.getMonth() + 1).then((d) => setPlan(d?.plan || [])).catch(echec('plan'));
    agentService.usage().then(setUsage).catch(echec('usage'));
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const chargement = contenus === null;
  const chargementPartiel = Object.keys(erreurs).length > 0;
  const nouveauCompte = !!demarrage && !demarrage.termine;

  const echecs = useMemo(() => (contenus || []).filter((c) => c.publish_status === 'échec'), [contenus]);
  const { urgent, plusTard } = useMemo(() => {
    if (!contenus) return { urgent: [], plusTard: [] };
    const u = [];
    const p = [];
    // Réseaux à reconnecter : déduits des échecs dus à la connexion du compte
    // (un seul échec : sa carte propose déjà « Reconnecter », pas de doublon)
    const aReconnecter = echecs.length > 1 ? [...new Set(echecs.filter((c) => erreurDeConnexion(c.publish_error)).map((c) => idReseau(c.reseau_cible)))] : [];
    aReconnecter.forEach((r) => u.push({ cle: `reco-${r}`, ton: 'danger', Icon: Link2Off, texte: t('accueil.tacheReconnexion', { reseau: nomReseau(r) }), action: t('accueil.actionReconnecter'), to: '/dashboard/parametres?s=connections' }));
    if (echecs.length > 1) u.push({ cle: 'echecs', ton: 'danger', Icon: AlertTriangle, texte: t('accueil.tacheEchecs', { count: echecs.length }), action: t('accueil.actionVoir'), to: '/dashboard/contenus?filtre=echec' });
    const rendus = contenus.filter((c) => c.video_status === 'echec');
    if (rendus.length) u.push({ cle: 'rendus', ton: 'danger', Icon: Film, texte: t('accueil.tacheRendus', { count: rendus.length }), action: t('accueil.actionVoir'), to: `/dashboard/contenus?ouvrir=${rendus[0].id}` });
    const sub = usage?.subscription;
    if (sub?.status === 'trialing') {
      const j = joursRestants(sub.current_period_end);
      if (j != null && j <= 5) u.push({ cle: 'essai', ton: 'attention', Icon: CreditCard, texte: t('accueil.tacheEssai', { count: j }), action: t('accueil.actionAbonnement'), to: '/dashboard/parametres?s=abonnement' });
    } else if (sub?.cancel_at) {
      u.push({ cle: 'fin', ton: 'attention', Icon: CreditCard, texte: t('accueil.tacheFinAbonnement', { date: new Date(sub.cancel_at).toLocaleDateString(langue, { day: 'numeric', month: 'long' }) }), action: t('accueil.actionAbonnement'), to: '/dashboard/parametres?s=abonnement' });
    }
    (usage?.gauges || [])
      .filter((g) => g.limit > 0 && g.limit < SEUIL_ILLIMITE && g.used / g.limit >= 0.85)
      .sort((a, b) => b.used / b.limit - a.used / a.limit)
      .slice(0, 2)
      .forEach((g) => u.push({ cle: `quota-${g.action_type}`, ton: 'attention', Icon: Gauge, texte: t('accueil.tacheQuota', { label: g.label || g.action_type, used: g.used, limit: g.limit }), action: t('accueil.actionVoir'), to: '/dashboard/parametres?s=abonnement' }));
    const aValider = contenus.filter((c) => c.statut === 'A valider').length;
    if (aValider) u.push({ cle: 'valider', ton: 'attention', Icon: CheckCircle2, texte: t('accueil.tacheAValider', { count: aValider }), action: t('accueil.actionValider'), to: '/dashboard/contenus' });
    const aProgrammer = contenus.filter((c) => c.statut === 'Valider' && c.reseau_cible && ['', null, undefined, 'annulé'].includes(c.publish_status)).length;
    if (aProgrammer) u.push({ cle: 'programmer', ton: 'attention', Icon: CalendarDays, texte: t('accueil.tacheAProgrammer', { count: aProgrammer }), action: t('accueil.actionProgrammer'), to: '/dashboard/planification' });

    const commentaires = Number(stats?.nouveaux_commentaires) || 0;
    if (commentaires) p.push({ cle: 'commentaires', ton: 'neutre', Icon: MessageCircle, texte: t('accueil.tacheCommentaires', { count: commentaires }), action: t('accueil.actionRepondre'), to: '/dashboard/commentaires' });
    const needed = plan.reduce((a, x) => a + (x.needed || 0), 0);
    const filled = plan.reduce((a, x) => a + (x.filled || 0), 0);
    if (needed > filled) p.push({ cle: 'plan', ton: 'neutre', Icon: PenLine, texte: t('accueil.tachePlan', { mois: t(`plan.${MOIS_KEYS[new Date().getMonth()]}`), filled, needed }), action: t('accueil.actionCompleter'), to: '/dashboard/plan', progression: needed ? filled / needed : 0 });
    return { urgent: u, plusTard: p };
  }, [contenus, echecs, stats, plan, usage, t, langue]);

  const nbUrgent = urgent.length + (echecs.length === 1 ? 1 : 0);
  const aVenir = useMemo(() => {
    const maintenant = Date.now();
    return (contenus || [])
      .filter((c) => c.date_publication && new Date(c.date_publication).getTime() >= maintenant && ['programmé', 'programme', 'envoi'].includes(c.publish_status))
      .sort((a, b) => new Date(a.date_publication) - new Date(b.date_publication))
      .slice(0, 3);
  }, [contenus]);
  const prevus = plan.reduce((a, x) => a + (x.needed || 0), 0);
  const aPublie = (contenus || []).some((c) => c.statut === 'Publie' || c.publish_status === 'publié');

  const prenom = user?.prenom || user?.nom || '';
  const phrase = chargement ? ''
    : nouveauCompte ? t('accueil.sousNouveau')
      : chargementPartiel ? t('accueil.chargementPartiel')
        : nbUrgent ? t('accueil.urgentN', { count: nbUrgent })
          : plusTard.length ? t('accueil.rienDUrgent') : t('accueil.toutEnOrdre');

  const quand = (iso) => {
    const d = new Date(iso);
    const jours = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(new Date().setHours(0, 0, 0, 0))) / 86400000);
    let rel = '';
    try { rel = new Intl.RelativeTimeFormat(langue, { numeric: 'auto' }).format(jours, 'day'); } catch (e) { /* navigateur ancien */ }
    return `${rel ? `${rel.charAt(0).toUpperCase()}${rel.slice(1)} · ` : ''}${d.toLocaleString(langue, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
  };

  const relancer = async (c) => {
    setRelance(c.id);
    try {
      await contenuService.publier(c.id);
      toast.success(t('accueil.relanceOk'));
      charger();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('accueil.relanceEchec'));
    } finally { setRelance(null); }
  };

  const Ligne = ({ tache }) => (
    <li>
      <Link to={tache.to} data-testid={`accueil-tache-${tache.cle}`}
        className={`flex items-center gap-3 rounded-xl border px-4 py-3 font-inter transition-colors hover:border-white/30 ${TONS[tache.ton]} ${FOCUS}`}>
        <tache.Icon className={`w-5 h-5 shrink-0 ${ICONES[tache.ton]}`} aria-hidden="true" />
        <span className="flex-1 min-w-0">
          <span className="block text-[14.5px] font-semibold">{tache.texte}</span>
          {tache.progression != null && (
            <span className="block mt-1.5 h-1.5 w-full max-w-[220px] rounded-full bg-white/10 overflow-hidden" aria-hidden="true">
              <span className="block h-full rounded-full bg-[#2fd393]" style={{ width: `${Math.round(tache.progression * 100)}%` }} />
            </span>
          )}
        </span>
        <span className="flex items-center gap-1 text-[13px] font-semibold text-white whitespace-nowrap">{tache.action}<ArrowRight className="w-4 h-4" aria-hidden="true" /></span>
      </Link>
    </li>
  );

  // Un seul envoi raté : on le montre tel quel, avec sa cause et de quoi le corriger sur place
  const echecUnique = echecs.length === 1 ? echecs[0] : null;
  const CarteEchec = () => {
    const c = echecUnique;
    const visuel = c.lien_visuel || (Array.isArray(c.slides_images) && c.slides_images[0]);
    const connexion = erreurDeConnexion(c.publish_error);
    return (
      <li className="rounded-xl border border-red-400/40 bg-red-400/10 p-3.5 font-inter" data-testid="accueil-echec-unique">
        <p className="flex items-center gap-2 text-[14.5px] font-semibold text-red-100">
          <AlertTriangle className="w-5 h-5 text-red-300 shrink-0" aria-hidden="true" />{t('accueil.echecTitre')}
        </p>
        <div className="flex gap-3 mt-2.5">
          {visuel
            ? <img src={visuel} alt="" className="w-14 h-14 rounded-lg object-cover ring-1 ring-white/10 shrink-0" />
            : <LogoReseau id={idReseau(c.reseau_cible)} className="w-14 h-14 rounded-lg shrink-0" />}
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[12.5px] text-slate-200"><LogoReseau id={idReseau(c.reseau_cible)} className="w-4 h-4 rounded-[4px]" />{nomReseau(c.reseau_cible)}</p>
            <p className="text-[14px] font-semibold text-white line-clamp-1">{c.titre || (c.contenu || '').slice(0, 70)}</p>
            <p className="text-[13px] text-red-100 mt-0.5">{erreurLisible(c.publish_error, t)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {connexion ? (
            <Link to="/dashboard/parametres?s=connections" className={`inline-flex items-center gap-1.5 rounded-lg bg-white text-[#1a0b0b] text-[13px] font-semibold px-3 py-1.5 ${FOCUS}`}>
              <Link2Off className="w-4 h-4" aria-hidden="true" />{t('accueil.reconnecterReseau', { reseau: nomReseau(c.reseau_cible) })}
            </Link>
          ) : (
            <button type="button" onClick={() => relancer(c)} disabled={relance === c.id} className={`inline-flex items-center gap-1.5 rounded-lg bg-white text-[#1a0b0b] text-[13px] font-semibold px-3 py-1.5 disabled:opacity-60 ${FOCUS}`}>
              {relance === c.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-4 h-4" aria-hidden="true" />}{t('accueil.actionRelancer')}
            </button>
          )}
          <button type="button" onClick={() => navigate(`/dashboard/contenus?ouvrir=${c.id}`)} className={`inline-flex items-center gap-1.5 rounded-lg border border-white/25 text-white text-[13px] font-semibold px-3 py-1.5 hover:bg-white/5 ${FOCUS}`}>
            <Pencil className="w-4 h-4" aria-hidden="true" />{t('accueil.actionCorriger')}
          </button>
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-6 max-w-[1100px]">
      {/* ─── En-tête : la phrase d'état est le titre ─── */}
      <header>
        <p className="text-[14px] text-slate-300 font-inter">{prenom ? t('accueil.greeting', { name: prenom }) : t('accueil.greetingSansNom')}</p>
        <h1 className="text-[24px] sm:text-[28px] font-bold font-sora text-white tracking-tight mt-0.5 min-h-[34px] [text-wrap:balance]" aria-live="polite">
          {phrase || <span className="sr-only">{t('accueil.chargementSr')}</span>}
        </h1>
      </header>

      {nouveauCompte ? (
        /* Compte neuf : une seule chose à faire, l'étape suivante */
        <CartePremiersPas />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-5 items-start">
            {/* ─── À faire ─── */}
            <section aria-labelledby="accueil-a-faire" className="rounded-2xl border border-white/[0.08] bg-[#0b1326] p-5">
              <h2 id="accueil-a-faire" className="font-sora font-bold text-[17px] text-white mb-3">{t('accueil.aFaireTitre')}</h2>

              {chargement ? (
                <ul className="flex flex-col gap-2" aria-busy="true">
                  <li className="sr-only">{t('accueil.chargementSr')}</li>
                  {[0, 1, 2].map((i) => <li key={i} className="h-[58px] rounded-xl bg-white/[0.04] animate-pulse" aria-hidden="true" />)}
                </ul>
              ) : (
                <div className="flex flex-col gap-4">
                  {chargementPartiel && (
                    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-[13.5px] text-amber-50 font-inter" role="alert">
                      <AlertTriangle className="w-4 h-4 text-amber-300" aria-hidden="true" />{t('accueil.chargementPartiel')}
                      <button type="button" onClick={charger} className={`ml-auto inline-flex items-center gap-1.5 font-semibold text-white underline underline-offset-2 rounded ${FOCUS}`}>
                        <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />{t('accueil.reessayer')}
                      </button>
                    </div>
                  )}

                  {nbUrgent > 0 && (
                    <div>
                      <h3 className="text-[13px] font-semibold text-slate-200 font-inter mb-2">{t('accueil.urgentTitre')}</h3>
                      <ul className="flex flex-col gap-2">
                        {echecUnique && <CarteEchec />}
                        {urgent.map((tache) => <Ligne key={tache.cle} tache={tache} />)}
                      </ul>
                    </div>
                  )}
                  {plusTard.length > 0 && (
                    <div>
                      <h3 className="text-[13px] font-semibold text-slate-200 font-inter mb-2">{t('accueil.plusTardTitre')}</h3>
                      <ul className="flex flex-col gap-2">{plusTard.map((tache) => <Ligne key={tache.cle} tache={tache} />)}</ul>
                    </div>
                  )}
                  {!nbUrgent && !plusTard.length && !chargementPartiel && (
                    <div className="flex items-start gap-3 rounded-xl border border-[#3AFFA3]/25 bg-[#3AFFA3]/[0.05] px-4 py-3.5 font-inter">
                      <CheckCircle2 className="w-5 h-5 text-[#3AFFA3] shrink-0 mt-0.5" aria-hidden="true" />
                      <div>
                        <p className="text-[14.5px] font-semibold text-white">{t('accueil.toutEnOrdre')}</p>
                        <p className="text-[13px] text-slate-300 mt-0.5">{t('accueil.toutEnOrdreSous')}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-white/[0.07]">
                {/* Créer reste secondaire tant qu'il y a quelque chose d'urgent à régler */}
                <Link to="/dashboard/studio" className={`inline-flex items-center gap-1.5 rounded-lg text-white text-[13px] font-semibold font-inter px-3.5 py-2 ${nbUrgent ? 'border border-white/15 hover:bg-white/5' : 'bg-[#5a4ae8] hover:bg-[#6757f0]'} ${FOCUS}`}>
                  <PenLine className="w-4 h-4" aria-hidden="true" />{t('accueil.creerContenu')}
                </Link>
                {!plusTard.some((x) => x.cle === 'plan') && (
                  <Link to="/dashboard/plan" className={`inline-flex items-center gap-1.5 rounded-lg border border-white/15 hover:bg-white/5 text-white text-[13px] font-semibold font-inter px-3.5 py-2 ${FOCUS}`}>
                    <CalendarDays className="w-4 h-4" aria-hidden="true" />{t('accueil.remplirMois')}
                  </Link>
                )}
              </div>
            </section>

            {/* ─── À venir : les prochains posts eux-mêmes ─── */}
            <section aria-labelledby="accueil-a-venir" className="rounded-2xl border border-white/[0.08] bg-[#0b1326] p-5">
              <div className="flex items-center gap-2 mb-3">
                <h2 id="accueil-a-venir" className="font-sora font-bold text-[17px] text-white">{t('accueil.aVenirTitre')}</h2>
                <Link to="/dashboard/planification" className={`ml-auto text-[13px] font-semibold text-[#c9c1ff] hover:text-white rounded ${FOCUS}`}>{t('accueil.voirPlanification')} →</Link>
              </div>
              {chargement ? (
                <div className="h-[120px] rounded-xl bg-white/[0.04] animate-pulse" aria-hidden="true" />
              ) : aVenir.length ? (
                <ul className="flex flex-col gap-3">
                  {aVenir.map((c, i) => {
                    const visuel = c.lien_visuel || (Array.isArray(c.slides_images) && c.slides_images[0]);
                    const grand = i === 0;
                    return (
                      <li key={c.id}>
                        <Link to={`/dashboard/contenus?ouvrir=${c.id}`} className={`flex gap-3 rounded-xl hover:bg-white/[0.03] -m-1 p-1 ${FOCUS}`}>
                          {visuel
                            ? <img src={visuel} alt="" className={`${grand ? 'w-[88px] h-[88px]' : 'w-12 h-12'} rounded-xl object-cover ring-1 ring-white/10 shrink-0`} />
                            : <LogoReseau id={idReseau(c.reseau_cible)} className={`${grand ? 'w-[88px] h-[88px]' : 'w-12 h-12'} rounded-xl shrink-0`} />}
                          <span className="min-w-0 font-inter">
                            <span className="flex items-center gap-1.5 text-[12.5px] text-slate-300">
                              <LogoReseau id={idReseau(c.reseau_cible)} className="w-4 h-4 rounded-[4px]" />
                              <span className="sr-only">{nomReseau(c.reseau_cible)} · </span>
                              <Clock className="w-3.5 h-3.5" aria-hidden="true" />{quand(c.date_publication)}
                            </span>
                            <span className={`block font-semibold text-white mt-0.5 line-clamp-2 ${grand ? 'text-[15px]' : 'text-[13.5px]'}`}>{c.titre || (c.contenu || '').slice(0, 80)}</span>
                            {grand && c.contenu && <span className="block text-[13px] text-slate-400 mt-0.5 line-clamp-2">{c.contenu}</span>}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="font-inter">
                  <p className="text-[14px] text-slate-200">{t('accueil.aucunePubProgrammee')}</p>
                  <Link to="/dashboard/contenus" className={`inline-flex items-center gap-1 mt-2 text-[13px] font-semibold text-[#c9c1ff] hover:text-white rounded ${FOCUS}`}>{t('accueil.voirContenus')}<ArrowRight className="w-3.5 h-3.5" aria-hidden="true" /></Link>
                </div>
              )}
            </section>
          </div>

          {/* ─── Résumé des performances (le détail est dans Performance) ─── */}
          <ResumePerformance prevus={prevus || null} repli={(
            <p className="rounded-2xl border border-white/[0.08] bg-[#0b1326] px-5 py-4 text-[13.5px] text-slate-300 font-inter">
              {t('accueil.statsApres')}{' '}
              <Link to="/dashboard/performance" className={`font-semibold text-[#c9c1ff] hover:text-white underline underline-offset-2 rounded ${FOCUS}`}>{t('accueil.voirPerformances')}</Link>
            </p>
          )} />

          {/* ─── Parrainage : seulement une fois que Postorico a publié pour toi ─── */}
          {aPublie && (
            <Link to="/dashboard/parametres?s=parrainage" data-testid="accueil-parrainage"
              className={`flex items-center gap-3 rounded-2xl border border-white/[0.06] px-5 py-3 hover:border-white/20 transition-colors ${FOCUS}`}>
              <Handshake className="w-5 h-5 text-[#3AFFA3] shrink-0" aria-hidden="true" />
              <span className="min-w-0 font-inter">
                <span className="block text-white font-semibold text-[14px]">{t('accueil.parrainageTitre')}</span>
                <span className="block text-slate-300 text-[13px]">{t('accueil.parrainageSous')}</span>
              </span>
              <span className="ml-auto flex items-center gap-1 text-white text-[13px] font-semibold font-inter whitespace-nowrap">{t('accueil.parrainageOuvrir')}<ArrowRight className="w-4 h-4" aria-hidden="true" /></span>
            </Link>
          )}
        </>
      )}
    </div>
  );
}
