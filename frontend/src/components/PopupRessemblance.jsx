import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { useTranslation } from 'react-i18next';

// Question de ressemblance posée à chaque validation (mémoire d'évaluation, H2) :
// « Ce contenu sonne-t-il comme vous ? » — jamais bloquante, `onAnswer(null)` si
// l'utilisateur passe (fermeture, backdrop, Escape) ; la validation se fait dans
// tous les cas côté appelant.
export default function PopupRessemblance({ open, onAnswer }) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onAnswer(null); }}>
      <DialogContent className="max-w-sm bg-[#0f172a] border border-white/10 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-sora text-base text-white text-center">{t('contenus.ressemblance.question')}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center gap-2 py-3">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => onAnswer(n)}
              className="w-11 h-11 rounded-full border border-white/15 text-white font-sora font-semibold hover:border-[#8A6CFF] hover:bg-[#8A6CFF]/15 transition-colors">
              {n}
            </button>
          ))}
        </div>
        <p className="text-center text-[11px] text-slate-500 font-inter -mt-1">{t('contenus.ressemblance.echelle')}</p>
        <div className="flex justify-center mt-2">
          <button type="button" onClick={() => onAnswer(null)}
            className="text-xs text-slate-500 hover:text-slate-300 font-inter underline underline-offset-2">
            {t('contenus.ressemblance.passer')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
