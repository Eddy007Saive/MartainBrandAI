import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PlugZap, ArrowRight, X } from 'lucide-react';
import { userService } from '../services/userService';
import { useUser } from '../context/UserContext';

/**
 * Reconnexion guidée après une suspension pour impayé, une fois le paiement
 * régularisé : la liste exacte des réseaux que le client avait, chacun avec un
 * bouton. L'objectif : qu'il n'ait jamais à se demander « j'avais quoi, déjà ».
 *
 * La liste vient de `reseaux_sauvegardes` (écrite AVANT la déconnexion) et se
 * vide au fil des reconnexions (social_service.enregistrer_compte). « Ignorer »
 * retire une ligne sans reconnecter. Masqué pour la session avec la croix.
 */
const NOMS = {
  instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn', tiktok: 'TikTok',
  youtube: 'YouTube', googlebusiness: 'Google Business', twitter: 'X (Twitter)',
};

export default function EcranReconnexion() {
  const { t } = useTranslation();
  const { user } = useUser();
  const navigate = useNavigate();
  const [etat, setEtat] = useState(null);
  const [masque, setMasque] = useState(false);
  const tid = user?.telegram_id || 'anon';
  const cle = `postorico_reconnexion_masquee_${tid}`;

  const charger = useCallback(() => {
    userService.reconnexion().then(setEtat).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user?.telegram_id) return undefined;
    try { setMasque(sessionStorage.getItem(cle) === '1'); } catch (e) { /* ignore */ }
    charger();
    // Après une connexion de réseau, l'intercepteur émet cet événement : la liste se met à jour.
    window.addEventListener('postorico:demarrage', charger);
    window.addEventListener('focus', charger);
    return () => {
      window.removeEventListener('postorico:demarrage', charger);
      window.removeEventListener('focus', charger);
    };
  }, [user?.telegram_id, charger, cle]);

  if (!etat?.a_afficher || masque) return null;

  const fermer = () => {
    try { sessionStorage.setItem(cle, '1'); } catch (e) { /* ignore */ }
    setMasque(true);
  };
  const ignorer = async (plateforme) => {
    try { setEtat(await userService.ignorerReconnexion(plateforme)); } catch (e) { /* ignore */ }
  };
  const reconnecter = () => {
    fermer();
    navigate('/dashboard/parametres?s=connections');
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="reconnexion-titre" data-testid="ecran-reconnexion" data-visite-libre
      className="fixed inset-0 z-[80] grid place-items-center p-4 bg-[#020617]/75 backdrop-blur-sm animate-fondu motion-reduce:animate-none">
      <div className="relative w-[min(560px,100%)] overflow-hidden rounded-[20px] border border-white/[0.09] bg-[#0f172a]
                      shadow-[inset_0_1px_0_rgba(255,255,255,.055),0_20px_50px_-18px_rgba(0,0,0,.85)]
                      animate-monter [animation-duration:260ms] motion-reduce:animate-none">
        <span aria-hidden="true" className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(ellipse at 92% 112%, rgba(58,255,163,.13), transparent 55%), radial-gradient(ellipse at 74% 122%, rgba(91,108,255,.2), transparent 62%)' }} />
        <button type="button" onClick={fermer} aria-label={t('reconnexion.fermer')} data-testid="reconnexion-fermer"
          className="absolute top-3.5 right-3.5 z-10 w-[30px] h-[30px] grid place-items-center rounded-[9px] bg-white/[0.04] text-slate-500 hover:text-white hover:bg-white/[0.1]">
          <X className="w-3.5 h-3.5" />
        </button>

        <div className="relative p-7 sm:p-8">
          <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.11em] text-[#3AFFA3] font-inter">
            <span className="w-[5px] h-[5px] rounded-full bg-[#3AFFA3]" />
            {t('reconnexion.surTitre')}
          </span>
          <h2 id="reconnexion-titre" className="mt-3 font-sora text-[23px] sm:text-[26px] font-bold leading-[1.16] tracking-[-0.5px] text-white">
            {t('reconnexion.titre')}
          </h2>
          <p className="mt-2.5 text-[14px] leading-[1.62] text-slate-400 font-inter">{t('reconnexion.texte')}</p>

          <ul className="mt-5 space-y-2">
            {etat.reseaux.map((r) => (
              <li key={r.plateforme} data-testid={`reconnexion-${r.plateforme}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-[#5B6CFF]/15 grid place-items-center shrink-0">
                    <PlugZap className="w-4 h-4 text-[#8A6CFF]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-semibold font-inter truncate">{NOMS[r.plateforme] || r.plateforme}</p>
                    <p className="text-slate-500 text-xs font-inter">
                      {t('reconnexion.deconnecteLe', { date: new Date(r.deconnecte_le).toLocaleDateString('fr-FR') })}
                    </p>
                  </div>
                </div>
                <button type="button" onClick={() => ignorer(r.plateforme)} data-testid={`reconnexion-ignorer-${r.plateforme}`}
                  className="text-[12px] text-slate-500 hover:text-white font-inter shrink-0">
                  {t('reconnexion.ignorer')}
                </button>
              </li>
            ))}
          </ul>

          <button type="button" onClick={reconnecter} data-testid="reconnexion-aller"
            className="mt-6 inline-flex items-center gap-2.5 h-12 px-6 rounded-[13px] font-inter font-semibold text-[15px] text-white
                       bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] active:scale-[0.97] hover:brightness-110
                       shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_2px_5px_rgba(0,0,0,0.3),0_14px_30px_-9px_rgba(91,108,255,0.65)]">
            {t('reconnexion.cta')} <ArrowRight className="w-[18px] h-[18px]" />
          </button>
          <p className="mt-3 text-[12.5px] text-slate-600 font-inter">{t('reconnexion.note')}</p>
        </div>
      </div>
    </div>
  );
}
