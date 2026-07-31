import React from 'react';
import { Composition } from 'remotion';
import { ReelBrand } from './ReelBrand';
import { ReelLong } from './ReelLong';

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
