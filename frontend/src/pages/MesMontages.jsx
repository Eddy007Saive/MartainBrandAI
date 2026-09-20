import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Clapperboard, Plus, Trash2, Loader2, Film } from 'lucide-react';
import { editeurService } from '../services/editeurService';

// Liste des montages du compte : reprendre un brouillon, ouvrir un montage exporté, en supprimer.
const STATUTS = {
  brouillon: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  rendu_en_cours: 'bg-[#f59e0b]/15 text-[#fcd34d] border-[#f59e0b]/30',
  rendu: 'bg-[#3AFFA3]/15 text-[#3AFFA3] border-[#3AFFA3]/30',
  echec: 'bg-red-500/15 text-red-300 border-red-500/30',
};

export default function MesMontages() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [montages, setMontages] = useState(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    editeurService.lister().then(setMontages).catch(() => { setErreur(true); setMontages([]); });
  }, []);

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

  const fmtDuree = (s) => { const m = Math.floor(s / 60); return m ? `${m} min ${Math.round(s - m * 60)} s` : `${s.toFixed(1)} s`; };
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

  return (
    <div className="max-w-6xl mx-auto space-y-6" data-testid="mes-montages">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] flex items-center justify-center">
          <Clapperboard className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold font-sora text-white">{t('editeur.liste.titre')}</h1>
          <p className="text-sm text-slate-500 font-inter">{t('editeur.liste.sous')}</p>
        </div>
        <button type="button" onClick={() => navigate('/dashboard/editeur/nouveau')} data-testid="montage-nouveau"
          className="ml-auto inline-flex items-center gap-2 text-[13px] font-sora font-semibold text-white px-4 py-2.5 rounded-[10px] bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] hover:opacity-90">
          <Plus className="w-4 h-4" />{t('editeur.liste.nouveau')}
        </button>
      </div>

      {montages === null ? (
        <div className="py-20 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
      ) : erreur ? (
        <p className="text-slate-400 font-inter">{t('editeur.echecChargement')}</p>
      ) : montages.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-[#0f172a]/50 p-10 text-center" data-testid="montages-vide">
          <Film className="w-9 h-9 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-300 font-sora font-semibold">{t('editeur.liste.vide')}</p>
          <p className="text-[13px] text-slate-500 font-inter mt-1 max-w-md mx-auto">{t('editeur.liste.videAide')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {montages.map((m) => (
            <div key={m.id} data-testid={`montage-carte-${m.id}`}
              className="group rounded-xl border border-white/[0.08] bg-[#0f172a] overflow-hidden hover:border-[#5B6CFF]/50 transition-colors">
              <button type="button" onClick={() => navigate(`/dashboard/editeur/${m.id}`)} className="block w-full text-left">
                <div className="aspect-[9/16] bg-[#05091a] relative">
                  {m.apercu ? <img src={m.apercu} alt="" className="w-full h-full object-cover" loading="lazy" />
                    : <div className="w-full h-full grid place-items-center"><Film className="w-8 h-8 text-slate-700" /></div>}
                  <span className={`absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUTS[m.statut] || STATUTS.brouillon}`}>{t(`editeur.liste.statut.${m.statut}`, m.statut)}</span>
                </div>
                <div className="p-3">
                  <div className="text-[13px] font-sora font-semibold text-white truncate">{m.titre}</div>
                  <div className="text-[11px] text-slate-500 font-inter mt-0.5">{fmtDuree(m.duree_s || 0)} · {fmtDate(m.updated_at)}</div>
                </div>
              </button>
              <div className="px-3 pb-3 -mt-1 flex justify-end">
                <button type="button" onClick={() => supprimer(m)} data-testid={`montage-suppr-${m.id}`} title={t('editeur.supprimer')}
                  className="w-7 h-7 grid place-items-center rounded-md text-slate-600 hover:text-red-400 hover:bg-red-500/10"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
