import { useTranslation } from 'react-i18next';
import { Video, Film, Wand2, Clapperboard } from 'lucide-react';

/**
 * Les quatre façons de faire une vidéo. Partagé par le Studio Vidéo (on arrive avec un
 * script de reel) et la page Éditeur vidéo (on part de rien) : `libre` adapte les
 * descriptions qui parlent du script quand il n'y en a pas.
 */
export default function ChoixMontage({ libre = false, onFaceCam, onClips, onMotion, onMain }) {
  const { t } = useTranslation();
  const CARTES = [
    { id: 'facecam', onClick: onFaceCam, titre: t('video.choix.faceCam'), desc: t(libre ? 'video.choix.faceCamLibre' : 'video.choix.faceCamDesc'),
      icone: <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] grid place-items-center mb-3"><Video className="w-5 h-5 text-white" /></div>,
      survol: 'hover:border-[#5B6CFF]/60 hover:bg-[#5B6CFF]/10' },
    { id: 'clips', onClick: onClips, titre: t('video.choix.clips'), desc: t('video.choix.clipsDesc'),
      icone: <div className="w-10 h-10 rounded-lg bg-[#3AFFA3]/15 border border-[#3AFFA3]/30 grid place-items-center mb-3"><Film className="w-5 h-5 text-[#3AFFA3]" /></div>,
      survol: 'hover:border-[#3AFFA3]/60 hover:bg-[#3AFFA3]/[0.06]' },
    { id: 'motion', onClick: onMotion, titre: t('video.choix.motion'), desc: t(libre ? 'video.choix.motionLibre' : 'video.choix.motionDesc'),
      icone: <div className="w-10 h-10 rounded-lg bg-[#F2A65A]/15 border border-[#F2A65A]/30 grid place-items-center mb-3"><Wand2 className="w-5 h-5 text-[#F2A65A]" /></div>,
      survol: 'hover:border-[#F2A65A]/60 hover:bg-[#F2A65A]/[0.06]' },
    { id: 'editeur', onClick: onMain, titre: t('editeur.monterMain'), desc: t('editeur.monterMainDesc'),
      icone: <div className="w-10 h-10 rounded-lg bg-[#8A6CFF]/15 border border-[#8A6CFF]/30 grid place-items-center mb-3"><Clapperboard className="w-5 h-5 text-[#c4b5fd]" /></div>,
      survol: 'hover:border-[#8A6CFF]/60 hover:bg-[#8A6CFF]/10' },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
      {CARTES.map((c) => (
        <button key={c.id} type="button" onClick={c.onClick} data-testid={`choix-${c.id}`}
          className={`text-left rounded-xl border border-white/10 bg-[#0c111f] p-4 transition-colors ${c.survol}`}>
          {c.icone}
          <div className="font-sora font-semibold text-white text-[15px]">{c.titre}</div>
          <p className="text-[12.5px] text-slate-400 font-inter mt-1 leading-relaxed">{c.desc}</p>
        </button>
      ))}
    </div>
  );
}
