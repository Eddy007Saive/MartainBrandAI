/**
 * Les trois classes partagées par la connexion et l'inscription.
 *
 * Elles vivent ici et non dupliquées dans chaque page : deux formulaires qui se
 * ressemblent à 95 % finissent toujours par diverger d'un rayon ou d'une teinte
 * si on les recopie.
 */

// La carte : posée sur le fond, pas de flou d'arrière-plan — il coûte cher au
// GPU sur mobile pour un effet qu'on ne voit pas sur un aplat sombre.
export const CARTE_AUTH =
  'w-full max-w-[420px] rounded-[20px] border border-white/[0.09] bg-[#0f172a] p-7 sm:p-[30px] '
  + 'shadow-[inset_0_1px_0_rgba(255,255,255,.055),0_2px_4px_rgba(0,0,0,.4),0_18px_40px_-12px_rgba(0,0,0,.66)]';

export const CHAMP_AUTH =
  'h-11 bg-slate-950/60 border-white/10 rounded-xl text-slate-200 placeholder:text-slate-600 '
  + 'font-inter focus:border-[#5B6CFF] focus:ring-1 focus:ring-[#5B6CFF]';

// Le logo au-dessus du titre, uniquement quand l'affiche est masquée.
export const LOGO_CARTE =
  'lg:hidden block w-[46px] mx-auto mb-3.5 active:scale-[0.98] '
  + 'transition-transform duration-150 ease-out-strong';
