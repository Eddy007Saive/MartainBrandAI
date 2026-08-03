import React from 'react';
import { Composition } from 'remotion';
import { ReelBrand } from './ReelBrand';
import { ReelLong } from './ReelLong';
import { ReelStat } from './ReelStat';
import { ReelAffiche } from './ReelAffiche';

// Les props sont injectées par le backend (reel_service.py) via --props.
export const Root: React.FC = () => (
  <>
    {/* Format court 8 s : hook → 3 preuves → CTA */}
    <Composition
      id="ReelBrand"
      component={ReelBrand}
      durationInFrames={240}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        brand: {
          nom: 'Postorico', principale: '#5B6CFF', accent: '#3AFFA3',
          fond: '#020617', logo: null as string | null,
        },
        hook: 'Tu diriges une boîte, pas une rédaction.',
        points: ['2 h par mois, pas plus', '< 30 s pour générer un post', '6 réseaux connectés'],
        cta: 'postorico.com',
      }}
    />
    {/* Style « Affiche » 11 s : la pub premium — titre accentué, carte 3 arguments, image client, CTA */}
    <Composition
      id="ReelAffiche"
      component={ReelAffiche}
      durationInFrames={330}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        brand: {
          nom: 'postorico', principale: '#8A6CFF', accent: '#3AFFA3',
          fond: '#070510', logo: null as string | null,
        },
        headline: 'Ton business\nmérite mieux\nque le [silence.]',
        sub: "On s'occupe de ta [présence.]\nTu t'occupes de ton [business.]",
        features: [
          { icon: 'bolt' as const, texte: "La [vitesse] d'un logiciel", sous: 'Contenu prêt à publier.' },
          { icon: 'star' as const, texte: "La [qualité] d'une agence", sous: 'Ton calibré. Marque respectée.' },
          { icon: 'shield' as const, texte: "Le [contrôle] d'un patron", sous: 'Tu valides, tu pilotes.' },
        ],
        stat: "10x moins cher qu'une agence. [2h par mois.] Maximum.",
        cta: 'Réserver ma démo',
        image: 'demo-affiche.png' as string | null,
      }}
    />
    {/* Style « Gros chiffres » 10 s : hook surligné → un écran par point avec chiffre géant qui compte → CTA */}
    <Composition
      id="ReelStat"
      component={ReelStat}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        brand: {
          nom: 'Postorico', principale: '#5B6CFF', accent: '#3AFFA3',
          fond: '#020617', logo: null as string | null,
        },
        hook: 'Tu diriges une boîte, pas une rédaction.',
        points: ['2 h par mois, pas plus', '< 30 s pour générer un post', '6 réseaux connectés'],
        cta: 'postorico.com',
      }}
    />
    {/* Format long 22 s : hook → contexte → preuves plein écran → leçon → CTA */}
    <Composition
      id="ReelLong"
      component={ReelLong}
      durationInFrames={660}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        brand: {
          nom: 'Postorico', principale: '#5B6CFF', accent: '#3AFFA3',
          fond: '#020617', logo: null as string | null,
        },
        hook: 'Tu diriges une boîte, pas une rédaction.',
        contexte: "Publier chaque semaine quand on gère une entreprise, c'est le premier truc qu'on abandonne.",
        points: ['2 h par mois, pas plus', '< 30 s pour générer un post', '6 réseaux connectés'],
        lecon: 'La régularité bat le talent quand le talent ne publie pas.',
        cta: 'postorico.com',
      }}
    />
  </>
);
