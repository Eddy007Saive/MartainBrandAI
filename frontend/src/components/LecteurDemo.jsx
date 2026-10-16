import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PlayCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

/**
 * Vidéo de démonstration du produit, par langue d'interface (id YouTube).
 * Une langue absente = pas de bouton : on ne montre pas une démo française
 * à un compte en espagnol. Pour en ajouter une, il suffit de compléter ici.
 */
const VIDEOS_DEMO = {
  fr: 'D68Zh3sAjqs',
};

export const idVideoDemo = (langue) => VIDEOS_DEMO[(langue || '').slice(0, 2)] || null;

const STYLES = {
  // Carte « Premiers pas » de l'Accueil : même gabarit que « Reprendre la visite ».
  carte: 'inline-flex items-center gap-2 h-9 px-3.5 rounded-xl text-[13px] font-semibold text-[#020617] bg-[#3AFFA3] hover:bg-[#3AFFA3]/90',
  // Bas de la barre latérale : même gabarit que « Déconnexion ».
  menu: 'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.05] transition-all duration-150 text-sm font-medium font-inter',
};

/**
 * Bouton « Voir la démo » + lecteur en fenêtre. Ne rend rien si la langue
 * de l'interface n'a pas de vidéo.
 */
export default function BoutonDemo({ variante = 'menu' }) {
  const { t, i18n } = useTranslation();
  const [ouvert, setOuvert] = useState(false);
  const id = idVideoDemo(i18n.resolvedLanguage || i18n.language);
  if (!id) return null;

  return (
    <>
      {/* data-visite-libre : la visite guidée bloque les clics ailleurs, or c'est
          justement pendant la visite qu'un nouveau client a besoin de la démo. */}
      <button type="button" data-visite-libre data-testid={`demo-${variante}`} className={STYLES[variante]}
        onClick={() => setOuvert(true)}>
        <PlayCircle className={variante === 'menu' ? 'w-[18px] h-[18px]' : 'w-4 h-4'} />
        <span>{t('demo.voir')}</span>
      </button>
      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogContent data-visite-libre aria-describedby={undefined} className="z-[80] max-w-4xl w-[calc(100vw-2rem)] p-0 overflow-hidden border-white/10 bg-[#0f172a] text-white">
          <DialogTitle className="sr-only">{t('demo.titre')}</DialogTitle>
          {/* L'iframe n'existe que fenêtre ouverte : fermer coupe le son. */}
          {ouvert && (
            <div className="relative w-full aspect-video bg-black">
              <iframe
                className="absolute inset-0 w-full h-full"
                src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
                title={t('demo.titre')}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
