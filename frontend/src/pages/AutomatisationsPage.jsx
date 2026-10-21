import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Workflow, Loader2, Plus, Play, Pause, Trash2, MessageCircle, MessagesSquare, AtSign, Plug, ChevronRight, RotateCw, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '../components/PageHeader';
import { SocialIcon } from '../components/SocialIcon';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MODELES } from '../components/automatisations/catalogue';
import { messageErreur, workflowService } from '../services/workflowService';

const ICONES_MODELES = { 'commentaire-dm': MessageCircle, qualifier: MessagesSquare, story: AtSign };
const NOMS_RESEAUX = { instagram: 'Instagram', facebook: 'Facebook' };
// Pastille + couleur du texte de statut : le libellé porte le sens, la couleur le confirme.
const STATUTS = {
  active: { point: 'bg-[#3AFFA3]', texte: 'text-[#3AFFA3]' },
  paused: { point: 'bg-amber-400', texte: 'text-amber-300' },
  draft: { point: 'bg-slate-500', texte: 'text-slate-400' },
};

const BOUTON_SECONDAIRE = 'inline-flex items-center justify-center gap-1.5 h-11 sm:h-9 rounded-lg text-[13px] font-medium font-inter transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8A6CFF] disabled:opacity-50';

export default function AutomatisationsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [action, setAction] = useState(null);
  const [aSupprimer, setASupprimer] = useState(null);

  const charger = useCallback(async () => {
    try {
      setData(await workflowService.lister());
    } catch (e) {
      setData({ workflows: [], comptes: [], erreur: messageErreur(e, t('auto.erreur.chargement')) });
    }
  }, [t]);

  useEffect(() => { charger(); }, [charger]);

  const basculer = async (wf) => {
    setAction(wf.id);
    try {
      if (wf.status === 'active') await workflowService.pause(wf.id); else await workflowService.activer(wf.id);
      toast.success(wf.status === 'active' ? t('auto.misEnPause') : t('auto.active'));
      await charger();
    } catch (e) {
      if (!e.__handled) toast.error(messageErreur(e, t('auto.erreur.activation')), { duration: 9000 });
    } finally {
      setAction(null);
    }
  };

  const supprimer = async () => {
    const wf = aSupprimer;
    setASupprimer(null);
    setAction(wf.id);
    try {
      await workflowService.supprimer(wf.id);
      toast.success(t('auto.supprime'));
      await charger();
    } catch (e) {
      toast.error(messageErreur(e, t('auto.erreur.suppression')));
    } finally {
      setAction(null);
    }
  };

  const recharger = () => { setData(null); charger(); };

  const comptes = data?.comptes || [];
  const workflows = data?.workflows || [];
  const aInstagram = comptes.some((c) => c.platform === 'instagram');
  const modeles = MODELES.filter((m) => m.id !== 'vide' && (!m.instagram || aInstagram));
  const actives = workflows.filter((wf) => wf.status === 'active').length;
  const ouvrirModele = (id) => navigate(`/dashboard/automatisations/nouveau?modele=${id}`);

  // Une ligne d'automatisation : ce qui la déclenche, son activité, puis ses actions.
  const ligne = (wf) => {
    const actif = wf.status === 'active';
    const st = STATUTS[wf.status] || STATUTS.draft;
    const declencheur = (wf.nodes || []).find((nd) => nd.type === 'trigger')?.config?.triggerType;
    const lances = wf.totalStarted || 0;
    const termines = wf.totalCompleted || 0;
    const enCours = action === wf.id;
    const libelleBascule = actif ? t('auto.pause') : t('auto.activer');
    return (
      <li key={wf.id} className="flex items-center gap-3 px-3 sm:px-4 py-3.5" data-testid={`auto-ligne-${wf.id}`}>
        <Link to={`/dashboard/automatisations/${wf.id}`}
          className="flex items-center gap-3 flex-1 min-w-0 rounded-lg -m-1 p-1 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8A6CFF]">
          <span className="w-9 h-9 rounded-lg grid place-items-center shrink-0 bg-[#0a1120] border border-white/[0.07]" aria-hidden="true">
            <SocialIcon network={wf.platform} className="w-4 h-4 text-slate-200" />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-x-2 gap-y-0.5 flex-wrap">
              <span className="min-w-0 text-[14px] text-white font-semibold font-inter line-clamp-2 sm:truncate group-hover:underline underline-offset-2">{wf.name}</span>
              <span className={`inline-flex items-center gap-1.5 text-[11.5px] font-medium font-inter ${st.texte}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${st.point}`} aria-hidden="true" />{t(`auto.statut.${wf.status}`)}
              </span>
            </span>
            <span className="block text-[12.5px] text-slate-400 font-inter mt-0.5 sm:truncate">
              {declencheur ? `${t(`auto.declencheur.${declencheur}`)} · ` : ''}{NOMS_RESEAUX[wf.platform] || wf.platform}
              <span className="tabular-nums"> · {lances
                ? `${t('auto.lances', { count: lances })} · ${t('auto.termines', { count: termines })}`
                : t('auto.jamaisLancee')}</span>
              {wf.createdAt && <span className="hidden md:inline"> · {t('auto.creeLe', { date: new Date(wf.createdAt).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' }) })}</span>}
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => basculer(wf)} disabled={enCours} aria-label={libelleBascule} title={libelleBascule} data-testid={`auto-basculer-${wf.id}`}
            className={`${BOUTON_SECONDAIRE} w-11 sm:w-auto sm:px-3 border border-white/10 text-slate-200 hover:text-white hover:bg-white/[0.06]`}>
            {enCours ? <Loader2 className="w-4 h-4 animate-spin" /> : actif ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span className="hidden sm:inline">{libelleBascule}</span>
          </button>
          <button type="button" onClick={() => setASupprimer(wf)} disabled={enCours} aria-label={t('auto.supprimer')} title={t('auto.supprimer')} data-testid={`auto-supprimer-${wf.id}`}
            className={`${BOUTON_SECONDAIRE} w-11 sm:w-9 sm:-mr-2.5 text-slate-500 hover:text-rose-300 hover:bg-rose-500/10`}>
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </li>
    );
  };

  // Les modèles : une liste de départs possibles, « Partir de zéro » à part.
  const sectionModeles = (enTete) => (
    <section aria-labelledby="auto-modeles">
      <div className="flex items-center justify-between gap-3">
        <h2 id="auto-modeles" className={`font-semibold font-sora text-white ${enTete ? 'text-[16px]' : 'text-[14px]'}`}>
          {enTete ? t('auto.commencer') : t('auto.nouvelle')}
        </h2>
        <button type="button" onClick={() => ouvrirModele('vide')} data-testid="auto-modele-vide"
          className={`${BOUTON_SECONDAIRE} px-3 -mr-3 shrink-0 text-slate-300 hover:text-white hover:bg-white/[0.06]`}>
          <Plus className="w-4 h-4" />{t('auto.modeles.vide.nom')}
        </button>
      </div>
      <p className="text-[12.5px] text-slate-400 font-inter mb-3 max-w-prose">{t('auto.limiteReseaux')}</p>
      <ul className="-mx-3 sm:-mx-4 border-y border-white/[0.06] divide-y divide-white/[0.06]">
        {modeles.map((m) => {
          const Icone = ICONES_MODELES[m.id] || MessageCircle;
          return (
            <li key={m.id}>
              <button type="button" onClick={() => ouvrirModele(m.id)} data-testid={`auto-modele-${m.id}`}
                className="w-full flex items-center gap-3 px-3 sm:px-4 py-3.5 text-left rounded-lg transition-colors duration-150 hover:bg-white/[0.03] group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8A6CFF]">
                <span className="w-9 h-9 rounded-lg grid place-items-center shrink-0 bg-[#8A6CFF]/[0.12] text-[#a594ff]" aria-hidden="true"><Icone className="w-[18px] h-[18px]" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-white font-inter">{t(`auto.modeles.${m.cle}.nom`)}</span>
                  <span className="block text-[12.5px] text-slate-400 font-inter mt-0.5 leading-snug">{t(`auto.modeles.${m.cle}.desc`)}</span>
                </span>
                <span className="hidden sm:inline text-[13px] font-medium font-inter text-[#a594ff] opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-150">{t('auto.utiliser')}</span>
                <ChevronRight className="w-4 h-4 text-slate-500 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );

  return (
    <div className="w-full space-y-8 pb-10">
      <PageHeader icon={Workflow} title={t('auto.titre')} subtitle={t('auto.sousTitre')} />

      <div className="max-w-4xl space-y-10">

      {!data ? (
        // Squelette : la forme de la liste à venir, pas un spinner au milieu de la page.
        <div className="space-y-2" aria-busy="true" aria-label={t('auto.chargement')}>
          <div className="h-4 w-40 rounded bg-white/[0.06] animate-pulse motion-reduce:animate-none" />
          <div className="border-y border-white/[0.06] divide-y divide-white/[0.06]">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 py-4">
                <div className="w-9 h-9 rounded-lg bg-white/[0.05] animate-pulse motion-reduce:animate-none" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-1/3 rounded bg-white/[0.06] animate-pulse motion-reduce:animate-none" />
                  <div className="h-3 w-1/2 rounded bg-white/[0.04] animate-pulse motion-reduce:animate-none" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : data.erreur ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-500/25 bg-rose-500/[0.07] px-4 py-3.5" role="alert" data-testid="auto-erreur">
          <AlertTriangle className="w-4 h-4 text-rose-300 shrink-0" aria-hidden="true" />
          <p className="flex-1 min-w-[200px] text-[13px] text-rose-100 font-inter">{data.erreur}</p>
          <button type="button" onClick={recharger} className={`${BOUTON_SECONDAIRE} px-3 border border-rose-300/30 text-rose-100 hover:bg-rose-500/10`}>
            <RotateCw className="w-4 h-4" />{t('auto.reessayer')}
          </button>
        </div>
      ) : comptes.length === 0 ? (
        <div className="max-w-lg mx-auto text-center py-10" data-testid="auto-sans-compte">
          <span className="w-12 h-12 mx-auto mb-4 rounded-xl grid place-items-center bg-[#0a1120] border border-white/[0.07]" aria-hidden="true">
            <Plug className="w-5 h-5 text-slate-300" />
          </span>
          <h2 className="text-lg font-semibold font-sora text-white">{t('auto.sansCompteTitre')}</h2>
          <p className="text-sm text-slate-400 font-inter mt-2 leading-relaxed">{t('auto.sansCompteDesc')}</p>
          <Link to="/dashboard/parametres?s=connections"
            className="inline-flex items-center gap-2 mt-5 h-11 sm:h-10 px-4 rounded-lg bg-[#e7ecf5] text-[#0b1322] text-[13px] font-semibold font-inter hover:bg-white transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8A6CFF]">
            {t('auto.connecter')}<ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      ) : workflows.length === 0 ? (
        sectionModeles(true)
      ) : (
        <>
          <section aria-labelledby="auto-mes">
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <h2 id="auto-mes" className="text-[16px] font-semibold font-sora text-white">{t('auto.mesAutomatisations')}</h2>
              <p className="text-[13px] text-slate-300 font-inter tabular-nums" data-testid="auto-resume">{t('auto.resumeActives', { count: actives, total: workflows.length })}</p>
            </div>
            <ul className="-mx-3 sm:-mx-4 border-y border-white/[0.06] divide-y divide-white/[0.06]">
              {workflows.map(ligne)}
            </ul>
          </section>
          {sectionModeles(false)}
        </>
      )}
      </div>

      <AlertDialog open={!!aSupprimer} onOpenChange={(o) => !o && setASupprimer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('auto.confirmerSuppressionTitre')}</AlertDialogTitle>
            <AlertDialogDescription>{t('auto.confirmerSuppression', { nom: aSupprimer?.name || '' })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('auto.annuler')}</AlertDialogCancel>
            <AlertDialogAction onClick={supprimer} className="bg-rose-600 hover:bg-rose-500">{t('auto.supprimer')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
