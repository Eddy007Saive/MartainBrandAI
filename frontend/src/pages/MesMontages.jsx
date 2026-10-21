import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Clapperboard, Trash2, Loader2, Film, FileText, RotateCw, AlertTriangle } from 'lucide-react';
import ChoixMontage from '../components/ChoixMontage';
import { PageHeader } from '../components/PageHeader';
import { editeurService } from '../services/editeurService';
import { contenuService } from '../services/contenuService';
import { SocialIcon } from '../components/SocialIcon';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';

// Liste des montages du compte : reprendre un brouillon, ouvrir un montage exporté, en supprimer.
// Pastille opaque (lisible sur n'importe quelle miniature) : point de couleur + libellé.
const STATUTS = {
  brouillon: 'bg-slate-400',
  rendu_en_cours: 'bg-amber-400',
  rendu: 'bg-[#3AFFA3]',
  echec: 'bg-rose-400',
};

const BOUTON_ICONE = 'w-9 h-9 grid place-items-center rounded-lg bg-[#020617]/85 text-slate-200 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8A6CFF]';

export default function MesMontages() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [montages, setMontages] = useState(null);
  const [erreur, setErreur] = useState(false);
  // Popup « voir la source » : le post/reel d'origine dont ce montage a été ouvert (source_contenu_id).
  const [sourceOuvert, setSourceOuvert] = useState(false);
  const [source, setSource] = useState(null);
  const [sourceChargement, setSourceChargement] = useState(false);

  const voirSource = async (id) => {
    setSourceOuvert(true); setSourceChargement(true); setSource(null);
    try {
      setSource(await contenuService.getById(id));
    } catch {
      toast.error(t('editeur.liste.sourceEchec'));
      setSourceOuvert(false);
    } finally {
      setSourceChargement(false);
    }
  };

  const charger = useCallback(() => {
    setErreur(false);
    setMontages(null);
    editeurService.lister().then(setMontages).catch(() => { setErreur(true); setMontages([]); });
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const supprimer = (m) => {
    toast(t('editeur.liste.supprimerTitre'), {
      id: `suppr-montage-${m.id}`, duration: 8000,
      description: t('editeur.liste.supprimerDesc', { titre: m.titre }),
      action: {
        label: t('editeur.liste.supprimerConfirm'),
        onClick: async () => {
          try {
            await editeurService.supprimer(m.id);
            setMontages((prev) => (prev || []).filter((x) => x.id !== m.id));
            toast.success(t('editeur.liste.supprime'));
          } catch { toast.error(t('editeur.liste.supprimerEchec')); }
        },
      },
    });
  };

  const nf = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  const fmtDuree = (s) => {
    if (!s) return t('editeur.liste.dureeVide');
    const m = Math.floor(s / 60);
    return m ? `${m} min ${Math.round(s - m * 60)} s` : `${nf.format(s)} s`;
  };
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' }) : '');

  return (
    <div className="max-w-6xl mx-auto" data-testid="mes-montages">
      <PageHeader icon={Clapperboard} title={t('nav.editeur')} subtitle={t('editeur.liste.sousTitrePage')} />

      <div className="space-y-10">
        {/* Nouvelle vidéo : les quatre façons, sans passer par un sujet de reel. */}
        <section aria-labelledby="choix-montage-titre" data-testid="choix-montage-libre">
          <h2 id="choix-montage-titre" className="text-[16px] font-bold font-sora text-white">{t('video.choix.titreLibre')}</h2>
          <p className="text-[13px] text-slate-400 font-inter mt-1">{t('video.choix.aideLibre')}</p>
          <ChoixMontage libre
            onFaceCam={() => navigate('/dashboard/video')}
            onClips={() => navigate('/dashboard/reel')}
            onMotion={() => navigate('/dashboard/video?mode=motion')}
            onMain={() => navigate('/dashboard/editeur/nouveau')}
          />
        </section>

        <section aria-labelledby="mes-montages-titre">
          <div className="mb-4">
            <h2 id="mes-montages-titre" className="text-[16px] font-bold font-sora text-white">{t('editeur.liste.mesMontages')}</h2>
            <p className="text-[13px] text-slate-400 font-inter mt-1">{t('editeur.liste.sous')}</p>
          </div>

          {montages === null ? (
            // Squelette : des affiches au format 9:16, comme la grille qui va arriver.
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4" aria-busy="true" aria-label={t('editeur.liste.chargement')}>
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="rounded-xl overflow-hidden bg-white/[0.03]">
                  <div className="aspect-[9/16] bg-white/[0.04] animate-pulse motion-reduce:animate-none" />
                  <div className="p-3 space-y-2"><div className="h-3 w-3/4 rounded bg-white/[0.06]" /><div className="h-2.5 w-1/2 rounded bg-white/[0.04]" /></div>
                </div>
              ))}
            </div>
          ) : erreur ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-500/25 bg-rose-500/[0.07] px-4 py-3.5" role="alert" data-testid="montages-erreur">
              <AlertTriangle className="w-4 h-4 text-rose-300 shrink-0" aria-hidden="true" />
              <p className="flex-1 min-w-[200px] text-[13px] text-rose-100 font-inter">{t('editeur.liste.echecListe')}</p>
              <button type="button" onClick={charger}
                className="inline-flex items-center gap-1.5 h-10 sm:h-9 px-3 rounded-lg border border-rose-300/30 text-[13px] font-medium text-rose-100 hover:bg-rose-500/10 transition-colors duration-150">
                <RotateCw className="w-4 h-4" />{t('editeur.liste.reessayer')}
              </button>
            </div>
          ) : montages.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 px-6 py-10 text-center" data-testid="montages-vide">
              <Film className="w-8 h-8 text-slate-500 mx-auto mb-3" aria-hidden="true" />
              <p className="text-slate-200 font-sora font-semibold">{t('editeur.liste.vide')}</p>
              <p className="text-[13px] text-slate-400 font-inter mt-1 max-w-md mx-auto">{t('editeur.liste.videAide')}</p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {montages.map((m) => (
                <li key={m.id} data-testid={`montage-carte-${m.id}`}
                  className="group relative flex flex-col rounded-xl border border-white/[0.08] bg-[#0f172a] overflow-hidden transition-colors duration-150 hover:border-[#5B6CFF]/50 focus-within:border-[#5B6CFF]/50">
                  <button type="button" onClick={() => navigate(`/dashboard/editeur/${m.id}`)}
                    className="block w-full text-left focus-visible:outline-none" aria-label={t('editeur.liste.ouvrir', { titre: m.titre })}>
                    <div className="aspect-[9/16] bg-[#05091a] relative">
                      {m.apercu ? <img src={m.apercu} alt="" className="w-full h-full object-cover" loading="lazy" />
                        : <div className="w-full h-full grid place-items-center"><Film className="w-8 h-8 text-slate-600" aria-hidden="true" /></div>}
                      <span className="absolute top-2 left-2 inline-flex items-center gap-1.5 text-[11px] font-semibold font-inter text-white px-2 py-1 rounded-md bg-[#020617]/85">
                        {m.statut === 'rendu_en_cours'
                          ? <Loader2 className="w-3 h-3 animate-spin text-amber-300" aria-hidden="true" />
                          : <span className={`w-1.5 h-1.5 rounded-full ${STATUTS[m.statut] || STATUTS.brouillon}`} aria-hidden="true" />}
                        {t(`editeur.liste.statut.${m.statut}`, m.statut)}
                      </span>
                    </div>
                  </button>
                  <div className="flex-1 flex flex-col p-3">
                    <p className="text-[13px] font-sora font-semibold text-white leading-snug line-clamp-2" title={m.titre}>{m.titre}</p>
                    {m.statut === 'echec' && <p className="text-[11.5px] text-rose-300 font-inter mt-1 leading-snug">{t('editeur.liste.echecAide')}</p>}
                    <p className="mt-auto pt-1.5 text-[11.5px] text-slate-400 font-inter tabular-nums">{fmtDuree(m.duree_s || 0)} · {fmtDate(m.updated_at)}</p>
                  </div>
                  {/* Actions posées sur l'affiche (hors du bouton d'ouverture) : la ligne d'infos garde toute la largeur. */}
                  <div className="absolute top-1.5 right-1.5 flex gap-1">
                      {m.source_contenu_id && (
                        <button type="button" onClick={() => voirSource(m.source_contenu_id)} data-testid={`montage-source-${m.id}`}
                          title={t('editeur.liste.voirSource')} aria-label={t('editeur.liste.voirSource')}
                          className={`${BOUTON_ICONE} hover:text-white hover:bg-[#020617]`}><FileText className="w-4 h-4" /></button>
                      )}
                      <button type="button" onClick={() => supprimer(m)} data-testid={`montage-suppr-${m.id}`}
                        title={t('editeur.supprimer')} aria-label={t('editeur.supprimer')}
                        className={`${BOUTON_ICONE} hover:text-rose-300 hover:bg-[#020617]`}><Trash2 className="w-4 h-4" /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Dialog open={sourceOuvert} onOpenChange={setSourceOuvert}>
        <DialogContent className="bg-[#0f172a] border-slate-800 max-w-lg" data-testid="montage-source-dialog">
          <DialogHeader>
            <DialogTitle className="font-sora text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#5B6CFF]" />{t('editeur.liste.sourceTitre')}
            </DialogTitle>
          </DialogHeader>
          {sourceChargement ? (
            <div className="py-10 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
          ) : source ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[12px] text-slate-400 font-inter">
                {source.reseau_cible && <SocialIcon network={source.reseau_cible} className="w-4 h-4" />}
                <span>{source.type || t('editeur.liste.sourceType')}</span>
                {source.sujet && <span className="truncate">· {source.sujet}</span>}
              </div>
              <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-white/10 bg-[#05091a] p-4 text-[13.5px] leading-relaxed text-slate-200 font-inter whitespace-pre-wrap">
                {source.contenu || source.script
                  || (Array.isArray(source.reel_data?.segments) && source.reel_data.segments.length
                    ? source.reel_data.segments.map((s) => s.texte).filter(Boolean).join('\n\n')
                    : '') || t('editeur.liste.sourceVide')}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
