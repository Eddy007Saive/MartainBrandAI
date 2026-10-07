import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Workflow, Loader2, Plus, Play, Pause, Trash2, MessageCircle, MessagesSquare, AtSign, Sparkles, Plug, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '../components/PageHeader';
import { SocialIcon } from '../components/SocialIcon';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MODELES } from '../components/automatisations/catalogue';
import { messageErreur, workflowService } from '../services/workflowService';

const ICONES_MODELES = { 'commentaire-dm': MessageCircle, qualifier: MessagesSquare, story: AtSign, vide: Sparkles };

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

  const comptes = data?.comptes || [];
  const workflows = data?.workflows || [];
  const aInstagram = comptes.some((c) => c.platform === 'instagram');
  const modeles = MODELES.filter((m) => !m.instagram || aInstagram);

  return (
    <div className="w-full space-y-6 pb-10">
      <PageHeader icon={Workflow} title={t('auto.titre')} subtitle={t('auto.sousTitre')} />

      {!data ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-[#5B6CFF]" /></div>
      ) : comptes.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a] p-8 text-center max-w-lg mx-auto">
          <Plug className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold font-sora text-white">{t('auto.sansCompteTitre')}</h3>
          <p className="text-sm text-slate-400 font-inter mt-2">{t('auto.sansCompteDesc')}</p>
          <Link to="/dashboard/parametres?s=connections" className="inline-block mt-4 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-200 text-sm hover:bg-white/10">{t('auto.connecter')}</Link>
        </div>
      ) : (
        <>
          {data.erreur && <p className="text-sm text-rose-300">{data.erreur}</p>}

          {/* Modèles */}
          <section>
            <h2 className="text-[15px] font-semibold font-sora text-white mb-3">{workflows.length ? t('auto.nouvelle') : t('auto.commencer')}</h2>
            <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {modeles.map((m) => {
                const Icone = ICONES_MODELES[m.id] || Sparkles;
                return (
                  <button key={m.id} type="button" onClick={() => navigate(`/dashboard/automatisations/nouveau?modele=${m.id}`)} data-testid={`auto-modele-${m.id}`}
                    className="text-left rounded-2xl border border-white/[0.06] bg-[#0f172a] p-4 hover:border-[#8A6CFF]/40 transition-all group">
                    <span className="w-9 h-9 rounded-xl grid place-items-center bg-[#8A6CFF]/15 mb-3"><Icone className="w-[18px] h-[18px] text-[#8A6CFF]" /></span>
                    <p className="text-[14px] font-semibold text-white font-sora">{t(`auto.modeles.${m.cle}.nom`)}</p>
                    <p className="text-[12.5px] text-slate-400 font-inter mt-1 leading-snug">{t(`auto.modeles.${m.cle}.desc`)}</p>
                    <span className="inline-flex items-center gap-1 text-[12px] text-[#8A6CFF] mt-3 group-hover:gap-2 transition-all">
                      {m.id === 'vide' ? <Plus className="w-3.5 h-3.5" /> : null}{t('auto.utiliser')}<ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Mes automatisations */}
          {workflows.length > 0 && (
            <section className="rounded-2xl border border-white/[0.06] bg-[#0f172a] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.06]"><h2 className="font-semibold font-sora text-[15px] text-white">{t('auto.mesAutomatisations')}</h2></div>
              <div className="divide-y divide-white/[0.04]">
                {workflows.map((wf) => {
                  const actif = wf.status === 'active';
                  return (
                    <div key={wf.id} className="flex flex-wrap sm:flex-nowrap items-center gap-3 px-5 py-3.5 hover:bg-white/[0.02]" data-testid={`auto-ligne-${wf.id}`}>
                      <Link to={`/dashboard/automatisations/${wf.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                        <span className="w-9 h-9 rounded-lg grid place-items-center bg-white/[0.04] shrink-0"><SocialIcon network={wf.platform} className="w-4 h-4 text-slate-200" /></span>
                        <div className="min-w-0">
                          <p className="text-[13.5px] text-white font-semibold truncate">{wf.name}</p>
                          <p className="text-[11.5px] text-slate-500">
                            {t('auto.stats', { lances: wf.totalStarted || 0, termines: wf.totalCompleted || 0 })}
                            {wf.createdAt ? ` · ${new Date(wf.createdAt).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })}` : ''}
                          </p>
                        </div>
                      </Link>
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border shrink-0 ${actif ? 'text-[#3AFFA3] border-[#3AFFA3]/30 bg-[#3AFFA3]/10' : 'text-slate-400 border-white/10'}`}>{t(`auto.statut.${wf.status}`)}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button type="button" onClick={() => basculer(wf)} disabled={action === wf.id} title={actif ? t('auto.pause') : t('auto.activer')}
                          className="w-9 h-9 grid place-items-center rounded-lg bg-white/[0.04] border border-white/[0.06] text-slate-300 hover:text-white disabled:opacity-50">
                          {action === wf.id ? <Loader2 className="w-4 h-4 animate-spin" /> : actif ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                        <button type="button" onClick={() => setASupprimer(wf)} title={t('auto.supprimer')}
                          className="w-9 h-9 grid place-items-center rounded-lg bg-white/[0.04] border border-white/[0.06] text-slate-400 hover:text-rose-400">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <p className="text-[12px] text-slate-500 font-inter">{t('auto.limiteReseaux')}</p>
        </>
      )}

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
