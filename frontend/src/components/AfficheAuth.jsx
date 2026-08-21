import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles, BarChart3, MessageSquare, Calendar } from 'lucide-react';

/**
 * L'affiche des pages de connexion et d'inscription.
 *
 * Rico occupe la droite du panneau, debout sur le bas de page, et déborde de
 * 72 px sur la colonne du formulaire. C'est ce débord qui donne la profondeur —
 * pas une ombre portée. Le halo et l'ombre de contact se calent sur sa position
 * grâce aux deux variables ci-dessous : une seule source de vérité, on déplace
 * le coq sans rien recalculer.
 *
 * Masquée sous 1024 px : sur téléphone, la page ne montre que le formulaire.
 */
const AFFICHE = { '--rico': 'min(64%, 412px)', '--debord': '72px' };
// rico-v4 : chemin neuf a chaque planche (cache d'un an chez Cloudinary).
// « presente-cote » : il presente le formulaire, ce qui donne une raison a la
// mise en page — la mascotte regarde ou l'on veut que le visiteur aille.
const RICO = 'https://res.cloudinary.com/dy9gp5pim/image/upload/w_760,q_auto,f_auto/'
           + 'brand/rico-v4/presente-cote.png';

// Les hexagones sont tracés en SVG et non découpés au clip-path : découper la
// BORDURE d'un rectangle en hexagone n'en laisse que deux traits au centre.
const HEXAGONES = [
  { cls: 'w-[230px] h-[256px] right-[14%] bottom-[26%] text-[#8A6CFF]/70', delai: '0s' },
  { cls: 'w-[132px] h-[148px] right-[1%] bottom-[50%] text-[#3AFFA3]/70', delai: '-2s' },
  { cls: 'w-[176px] h-[196px] right-[36%] bottom-[4%] text-[#3AFFA3]/40', delai: '-4s' },
];

function Hexagone({ cls, delai }) {
  return (
    <svg viewBox="0 0 100 112" preserveAspectRatio="none" aria-hidden="true"
      style={{ animationDelay: delai }}
      className={`absolute opacity-60 animate-flotter pointer-events-none ${cls}`}>
      <polygon points="25,2 75,2 99,56 75,110 25,110 1,56" fill="none"
        stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function AfficheAuth() {
  const { t } = useTranslation();

  const atouts = [
    { Icone: Sparkles, texte: t('auth.feat1') },
    { Icone: Calendar, texte: t('auth.feat2') },
    { Icone: BarChart3, texte: t('auth.feat3') },
    { Icone: MessageSquare, texte: t('auth.feat4') },
  ];

  return (
    <section
      className="hidden lg:flex relative z-[2] flex-col gap-[22px] px-10 pt-9 overflow-visible"
      style={{
        ...AFFICHE,
        backgroundImage:
          'radial-gradient(ellipse at 46% 104%, rgba(58,255,163,.16), transparent 52%),'
        + 'radial-gradient(ellipse at 46% 112%, rgba(91,108,255,.34), transparent 64%),'
        + 'linear-gradient(160deg, #111731 0%, #0a0f22 55%, #070b18 100%)',
      }}>

      {HEXAGONES.map((h, i) => <Hexagone key={i} {...h} />)}

      <Link to="/" data-testid="auth-retour-site"
        className="relative z-[3] flex items-center gap-[11px] w-fit
                   active:scale-[0.99] transition-transform duration-150 ease-out-strong">
        <img src="/logo.png" alt="Postorico"
          className="w-[54px] h-[54px] object-contain drop-shadow-[0_6px_16px_rgba(91,108,255,.4)]" />
        <span>
          <b className="block font-sora text-[30px] font-bold leading-9 text-white">Postorico</b>
          <span className="block text-sm text-slate-400 font-inter">{t('auth.tagline')}</span>
        </span>
      </Link>

      <div className="relative z-[3]">
        <h1 className="font-sora text-[48px] font-bold leading-[48px] tracking-[-0.021em] text-white">
          {t('auth.heroTitle1')}
          {/* Le dégradé atteint le vert dès le milieu de la ligne : la marque
              n'est pas qu'indigo, l'accent doit exister dans le titre. */}
          <em className="not-italic block bg-clip-text text-transparent
            bg-[linear-gradient(96deg,#8A6CFF_0%,#7fd7d0_34%,#3AFFA3_72%)]">
            {t('auth.heroTitle2')}
          </em>
        </h1>
        <p className="mt-[18px] max-w-[42ch] text-[15px] leading-[1.62] text-slate-400 font-inter">
          {t('auth.heroSub')}
        </p>
      </div>

      {/* Les atouts tiennent dans la bande laissée libre à gauche du coq.
          Deux colonnes seulement au-delà de 1850 px : en dessous, 520 px de
          cartes lui rentreraient dedans (vérifié à 1560/1700/1850/1920). */}
      <div className="relative z-[3] grid gap-[9px] grid-cols-1 max-w-[248px] mt-1
                      min-[1850px]:grid-cols-2 min-[1850px]:max-w-[520px] min-[1850px]:gap-[10px]
                      animate-monter [animation-delay:260ms]">
        {atouts.map(({ Icone, texte }) => (
          <div key={texte}
            className="flex items-center gap-[11px] px-3 py-[9px] rounded-[13px]
                       bg-slate-900/70 border border-white/[0.09]
                       shadow-[inset_0_1px_0_rgba(255,255,255,.055)]
                       transition-colors duration-200 hover:border-[#8A6CFF]/40 hover:bg-slate-900/90">
            <span className="grid place-items-center shrink-0 w-[30px] h-[30px] rounded-[9px]
                             bg-[#5B6CFF]/[0.16] text-[#a5b0ff]">
              <Icone className="w-4 h-4" />
            </span>
            <span className="text-[12.5px] leading-tight text-slate-400 font-inter
                             min-[1850px]:text-[13px]">{texte}</span>
          </div>
        ))}
      </div>

      {/* Halo et ombre de contact : calés sur la position du coq, et ramenés
          DANS le cadre — le panneau ne rogne plus (le coq déborde), donc tout ce
          qui passait sous le bas de page créait un scroll vertical. */}
      <div aria-hidden="true" className="absolute rounded-full blur-[34px] w-[520px] h-[470px] bottom-0
          bg-[radial-gradient(circle,rgba(58,255,163,.3),transparent_66%)]"
        style={{ right: 'calc(var(--rico) / 2 - var(--debord) - 260px)' }} />
      <div aria-hidden="true" className="absolute rounded-[50%] blur-[11px] w-[280px] h-[26px] bottom-0
          bg-[radial-gradient(ellipse,rgba(0,0,0,.6),transparent_70%)]"
        style={{ right: 'calc(var(--rico) / 2 - var(--debord) - 155px)' }} />
      <img src={RICO} alt="" aria-hidden="true"
        className="absolute bottom-0 z-[3] h-auto pointer-events-none animate-monter
                   [animation-duration:620ms] drop-shadow-[0_18px_26px_rgba(0,0,0,.55)]"
        style={{ width: 'var(--rico)', right: 'calc(-1 * var(--debord))' }} />
    </section>
  );
}
