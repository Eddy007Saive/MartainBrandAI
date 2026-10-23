import { useTranslation } from 'react-i18next';
import { Video, Film, Wand2, Clapperboard, ChevronRight, Lightbulb } from 'lucide-react';

/**
 * Les quatre façons de faire une vidéo. Partagé par le Studio Vidéo (on arrive avec un
 * script de reel) et la page Éditeur vidéo (on part de rien) : `libre` adapte les
 * descriptions qui parlent du script quand il n'y en a pas.
 * Sur téléphone : une ligne compacte par choix (icône, texte, chevron) ; à partir de sm,
 * des tuiles alignées en haut, pour que les icônes tombent toutes sur la même ligne.
 */
export default function ChoixMontage({ libre = false, onFaceCam, onClips, onMotion, onMain, onInspiration }) {
  const { t } = useTranslation();
  const CARTES = [
    { id: 'facecam', onClick: onFaceCam, titre: t('video.choix.faceCam'), desc: t(libre ? 'video.choix.faceCamLibre' : 'video.choix.faceCamDesc'),
      Icone: Video, tuile: 'bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] text-white',
      survol: 'hover:border-[#5B6CFF]/60 hover:bg-[#5B6CFF]/[0.08]' },
    { id: 'clips', onClick: onClips, titre: t('video.choix.clips'), desc: t('video.choix.clipsDesc'),
      Icone: Film, tuile: 'bg-[#3AFFA3]/15 border border-[#3AFFA3]/30 text-[#3AFFA3]',
      survol: 'hover:border-[#3AFFA3]/50 hover:bg-[#3AFFA3]/[0.05]' },
    { id: 'motion', onClick: onMotion, titre: t('video.choix.motion'), desc: t(libre ? 'video.choix.motionLibre' : 'video.choix.motionDesc'),
      Icone: Wand2, tuile: 'bg-[#F2A65A]/15 border border-[#F2A65A]/30 text-[#F2A65A]',
      survol: 'hover:border-[#F2A65A]/50 hover:bg-[#F2A65A]/[0.05]' },
    { id: 'editeur', onClick: onMain, titre: t('editeur.monterMain'), desc: t('editeur.monterMainDesc'),
      Icone: Clapperboard, tuile: 'bg-[#8A6CFF]/15 border border-[#8A6CFF]/30 text-[#c4b5fd]',
      survol: 'hover:border-[#8A6CFF]/60 hover:bg-[#8A6CFF]/[0.08]' },
    // 5e choix, seulement là où la page le propose (Éditeur vidéo) : partir d'un reel qui marche.
    ...(onInspiration ? [{ id: 'inspiration', onClick: onInspiration, titre: t('video.choix.inspiration'), desc: t('video.choix.inspirationDesc'),
      Icone: Lightbulb, tuile: 'bg-[#fbbf24]/15 border border-[#fbbf24]/30 text-[#fbbf24]',
      survol: 'hover:border-[#fbbf24]/50 hover:bg-[#fbbf24]/[0.05]' }] : []),
  ];
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${CARTES.length > 4 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-2.5 sm:gap-3 mt-4`}>
      {CARTES.map(({ id, onClick, titre, desc, Icone, tuile, survol }) => (
        <button key={id} type="button" onClick={onClick} data-testid={`choix-${id}`}
          className={`group flex sm:flex-col items-center sm:items-start gap-3 text-left rounded-xl border border-white/10 bg-[#0c111f] p-3.5 sm:p-4 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8A6CFF] ${survol}`}>
          <span className={`w-10 h-10 rounded-lg grid place-items-center shrink-0 ${tuile}`} aria-hidden="true"><Icone className="w-5 h-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-sora font-semibold text-white text-[15px] leading-snug">{titre}</span>
            <span className="block text-[12.5px] text-slate-400 font-inter mt-1 leading-relaxed">{desc}</span>
          </span>
          <ChevronRight className="sm:hidden w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
