import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUser } from '../context/UserContext';
import { useDemarrage } from '../context/DemarrageContext';
import {
  AlertTriangle, CheckCircle2, MessageCircle, CalendarDays, Clock, ArrowRight, Handshake, PenLine, RefreshCw,
} from 'lucide-react';
import { analyticsService } from '../services/analyticsService';
import { contenuService } from '../services/contenuService';
import { agentService } from '../services/agentService';
import CartePremiersPas from '../components/CartePremiersPas';
import { LogoReseau } from '../components/LogoReseau';
import { ResumePerformance } from '../components/performance/TableauPerformance';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8A6CFF]/70';
const MOIS_KEYS = ['moisJanvier', 'moisFevrier', 'moisMars', 'moisAvril', 'moisMai', 'moisJuin', 'moisJuillet', 'moisAout', 'moisSeptembre', 'moisOctobre', 'moisNovembre', 'moisDecembre'];
const idReseau = (r) => String(r || '').toLowerCase().replace(/\s+/g, '');

/**
 * Accueil : répond d'abord à « que dois-je faire, et tout va-t-il bien ? ».
 * 1. « À faire » (échecs d'envoi, à valider, commentaires, plan du mois, à programmer), chaque ligne mène au travail ;
 * 2. la prochaine publication (le contenu, pas un chiffre) ;
 * 3. un résumé des performances (le détail vit dans Performance).
 */
export default function AccueilPage() {
  const { t, i18n } = useTranslation();
  const langue = i18n.resolvedLanguage || i18n.language || 'fr';
  const { user } = useUser();
  const { etat: demarrage } = useDemarrage();

  const [contenus, setContenus] = useState(null); // null = chargement
  const [stats, setStats] = useState(null);
  const [plan, setPlan] = useState([]);
  const [erreur, setErreur] = useState(false);

  const charger = useCallback(() => {
    setErreur(false);
    setContenus(null);
    const now = new Date();
    contenuService.getAll()
      .then((d) => setContenus(Array.isArray(d) ? d : (d?.contenus || [])))
      .catch(() => { setContenus([]); setErreur(true); });
    analyticsService.getStats().then(setStats).catch(() => setStats(null));
    agentService.plan(now.getFullYear(), now.getMonth() + 1).then((d) => setPlan(d?.plan || [])).catch(() => setPlan([]));
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const maintenant = Date.now();
  const taches = useMemo(() => {
    if (!contenus) return [];
    const echecs = contenus.filter((c) => c.publish_status === 'échec').length;
    const aValider = contenus.filter((c) => c.statut === 'A valider').length;
    const aProgrammer = contenus.filter((c) => c.statut === 'Valider' && c.reseau_cible
      && ['', null, undefined, 'annulé'].includes(c.publish_status)).length;
    const commentaires = Number(stats?.nouveaux_commentaires) || 0;
    const needed = plan.reduce((a, p) => a + (p.needed || 0), 0);
    const filled = plan.reduce((a, p) => a + (p.filled || 0), 0);
    const mois = t(`plan.${MOIS_KEYS[new Date().getMonth()]}`);
    const l = [];
    if (echecs) l.push({ cle: 'echecs', ton: 'danger', Icon: AlertTriangle, texte: t('accueil.tacheEchecs', { count: echecs }), action: t('accueil.actionVoir'), to: '/dashboard/contenus' });
    if (aValider) l.push({ cle: 'valider', ton: 'attention', Icon: CheckCircle2, texte: t('accueil.tacheAValider', { count: aValider }), action: t('accueil.actionValider'), to: '/dashboard/contenus' });
    if (aProgrammer) l.push({ cle: 'programmer', ton: 'attention', Icon: CalendarDays, texte: t('accueil.tacheAProgrammer', { count: aProgrammer }), action: t('accueil.actionProgrammer'), to: '/dashboard/planification' });
    if (commentaires) l.push({ cle: 'commentaires', ton: 'neutre', Icon: MessageCircle, texte: t('accueil.tacheCommentaires', { count: commentaires }), action: t('accueil.actionRepondre'), to: '/dashboard/commentaires' });
    if (needed > filled) l.push({ cle: 'plan', ton: 'neutre', Icon: PenLine, texte: t('accueil.tachePlan', { mois, filled, needed }), action: t('accueil.actionCompleter'), to: '/dashboard/plan', progression: needed ? filled / needed : 0 });
    return l;
  }, [contenus, stats, plan, t]);

  const prochaine = useMemo(() => (contenus || [])
    .filter((c) => c.date_publication && new Date(c.date_publication).getTime() >= maintenant && ['programmé', 'programme', 'envoi'].includes(c.publish_status))
    .sort((a, b) => new Date(a.date_publication) - new Date(b.date_publication))[0] || null, [contenus, maintenant]);

  const prenom = user?.prenom || user?.nom || '';
  const nouveauCompte = demarrage && !demarrage.termine;
  const chargement = contenus === null;
  const sousTitre = chargement ? '' : nouveauCompte && !taches.length ? t('accueil.sousNouveau') : taches.length ? t('accueil.resteAFaire', { count: taches.length }) : t('accueil.toutEnOrdre');
  const dateProchaine = prochaine ? new Date(prochaine.date_publication).toLocaleString(langue, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
  const visuel = prochaine && (prochaine.lien_visuel || (Array.isArray(prochaine.slides_images) && prochaine.slides_images[0]));
  const TONS = {
    danger: 'text-red-200 bg-red-400/10 border-red-400/35',
    attention: 'text-amber-100 bg-amber-300/10 border-amber-300/30',
    neutre: 'text-slate-100 bg-white/[0.03] border-white/10',
  };
  const ICONES = { danger: 'text-red-300', attention: 'text-amber-300', neutre: 'text-[#c9c1ff]' };

  return (
    <div className="space-y-6 max-w-[1100px]">
      {/* ─── En-tête : une phrase qui dit l'essentiel ─── */}
      <header>
        <h1 className="text-[28px] sm:text-[32px] font-extrabold font-sora text-white tracking-tight">
          {prenom ? t('accueil.greeting', { name: prenom }) : t('accueil.greetingSansNom')}
        </h1>
        <p className="text-slate-300 mt-1.5 font-inter text-[15px] min-h-[22px]" aria-live="polite">{sousTitre}</p>
      </header>

      {nouveauCompte && <CartePremiersPas />}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-5 items-start">
        {/* ─── À faire ─── */}
        <section aria-labelledby="accueil-a-faire" className="rounded-2xl border border-white/[0.08] bg-[#0b1326] p-5">
          <div className="flex items-center gap-2 mb-3">
            <h2 id="accueil-a-faire" className="font-sora font-bold text-[17px] text-white">{t('accueil.aFaireTitre')}</h2>
            {!chargement && taches.length > 0 && <span className="text-[12px] text-[#d8d2ff] bg-[#6f5cff]/20 rounded-full px-2 py-0.5 font-inter tabular-nums">{taches.length}</span>}
          </div>

          {chargement ? (
            <ul className="flex flex-col gap-2" aria-busy="true">
              {[0, 1, 2].map((i) => <li key={i} className="h-[58px] rounded-xl bg-white/[0.04] animate-pulse" />)}
            </ul>
          ) : erreur ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-400/30 bg-red-400/[0.06] px-4 py-3 text-[13.5px] text-red-100 font-inter" role="alert">
              <AlertTriangle className="w-4 h-4 text-red-300" aria-hidden="true" />{t('accueil.erreurChargement')}
              <button type="button" onClick={charger} className={`ml-auto inline-flex items-center gap-1.5 font-semibold text-white underline underline-offset-2 rounded ${FOCUS}`}>
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />{t('accueil.reessayer')}
              </button>
            </div>
          ) : taches.length === 0 ? (
            <div className="flex items-start gap-3 rounded-xl border border-[#3AFFA3]/25 bg-[#3AFFA3]/[0.05] px-4 py-3.5 font-inter">
              <CheckCircle2 className="w-5 h-5 text-[#3AFFA3] shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-[14.5px] font-semibold text-white">{nouveauCompte ? t('accueil.tachesVidesNouveau') : t('accueil.toutEnOrdre')}</p>
                <p className="text-[13px] text-slate-300 mt-0.5">{nouveauCompte ? t('accueil.tachesVidesNouveauSous') : t('accueil.toutEnOrdreSous')}</p>
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {taches.map((tache) => (
                <li key={tache.cle}>
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
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-white/[0.07]">
            <Link to="/dashboard/studio" className={`inline-flex items-center gap-1.5 rounded-lg bg-[#5a4ae8] hover:bg-[#6757f0] text-white text-[13px] font-semibold font-inter px-3.5 py-2 ${FOCUS}`}>
              <PenLine className="w-4 h-4" aria-hidden="true" />{t('accueil.creerContenu')}
            </Link>
            <Link to="/dashboard/plan" className={`inline-flex items-center gap-1.5 rounded-lg border border-white/15 hover:bg-white/5 text-white text-[13px] font-semibold font-inter px-3.5 py-2 ${FOCUS}`}>
              <CalendarDays className="w-4 h-4" aria-hidden="true" />{t('accueil.remplirMois')}
            </Link>
          </div>
        </section>

        {/* ─── Prochaine publication : le contenu lui-même ─── */}
        <section aria-labelledby="accueil-prochaine" className="rounded-2xl border border-white/[0.08] bg-[#0b1326] p-5">
          <h2 id="accueil-prochaine" className="font-sora font-bold text-[17px] text-white mb-3">{t('accueil.prochainePub')}</h2>
          {chargement ? (
            <div className="h-[120px] rounded-xl bg-white/[0.04] animate-pulse" aria-busy="true" />
          ) : prochaine ? (
            <Link to="/dashboard/planification" className={`flex gap-3 rounded-xl hover:bg-white/[0.03] -m-1 p-1 ${FOCUS}`}>
              {visuel
                ? <img src={visuel} alt="" className="w-[88px] h-[88px] rounded-xl object-cover ring-1 ring-white/10 shrink-0" />
                : <LogoReseau id={idReseau(prochaine.reseau_cible)} className="w-[88px] h-[88px] rounded-xl shrink-0" />}
              <span className="min-w-0 font-inter">
                <span className="flex items-center gap-1.5 text-[13px] text-slate-300">
                  <LogoReseau id={idReseau(prochaine.reseau_cible)} className="w-5 h-5 rounded-[5px]" />
                  <Clock className="w-3.5 h-3.5" aria-hidden="true" /><span className="first-letter:uppercase">{dateProchaine}</span>
                </span>
                <span className="block text-[15px] font-semibold text-white mt-1 line-clamp-2">{prochaine.titre || (prochaine.contenu || '').slice(0, 80)}</span>
                {prochaine.contenu && <span className="block text-[13px] text-slate-400 mt-0.5 line-clamp-2">{prochaine.contenu}</span>}
              </span>
            </Link>
          ) : (
            <div className="font-inter">
              <p className="text-[14px] text-slate-200">{t('accueil.aucunePubProgrammee')}</p>
              <Link to="/dashboard/contenus" className={`inline-flex items-center gap-1 mt-2 text-[13px] font-semibold text-[#c9c1ff] hover:text-white rounded ${FOCUS}`}>{t('accueil.voirContenus')}<ArrowRight className="w-3.5 h-3.5" aria-hidden="true" /></Link>
            </div>
          )}
        </section>
      </div>

      {/* ─── Résumé des performances (le détail est dans Performance) ─── */}
      <ResumePerformance repli={(
        <p className="rounded-2xl border border-white/[0.08] bg-[#0b1326] px-5 py-4 text-[13.5px] text-slate-300 font-inter">
          {t('accueil.statsApres')}{' '}
          <Link to="/dashboard/performance" className={`font-semibold text-[#c9c1ff] hover:text-white underline underline-offset-2 rounded ${FOCUS}`}>{t('accueil.voirPerformances')}</Link>
        </p>
      )} />

      {/* ─── Parrainage, en dernier ─── */}
      <Link to="/dashboard/parametres?s=parrainage" data-testid="accueil-parrainage"
        className={`flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-[#0b1326] px-5 py-3.5 hover:border-white/20 transition-colors ${FOCUS}`}>
        <Handshake className="w-5 h-5 text-[#3AFFA3] shrink-0" aria-hidden="true" />
        <span className="min-w-0 font-inter">
          <span className="block text-white font-semibold text-[14.5px]">{t('accueil.parrainageTitre')}</span>
          <span className="block text-slate-300 text-[13px]">{t('accueil.parrainageSous')}</span>
        </span>
        <span className="ml-auto flex items-center gap-1 text-white text-[13px] font-semibold font-inter whitespace-nowrap">{t('accueil.parrainageOuvrir')}<ArrowRight className="w-4 h-4" aria-hidden="true" /></span>
      </Link>
    </div>
  );
}
