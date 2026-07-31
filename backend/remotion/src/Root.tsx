import React from 'react';
import { Composition } from 'remotion';
import { ReelBrand } from './ReelBrand';

// Reel vertical 1080×1920 · 30 fps · 8 s.
// Les props sont injectées par le backend (reel_service.py) via --props :
// { brand: {nom, principale, accent, fond, logo}, hook, points[], cta }
export const Root: React.FC = () => (
  <Composition
    id="ReelBrand"
    component={ReelBrand}
    durationInFrames={240}
    fps={30}
    width={1080}
    height={1920}
    defaultProps={{
      brand: {
        nom: 'Postorico',
        principale: '#5B6CFF',
        accent: '#3AFFA3',
        fond: '#020617',
        logo: null as string | null,
      },
      hook: 'Tu diriges une boîte, pas une rédaction.',
      points: ['2 h par mois, pas plus', '< 30 s pour générer un post', '6 réseaux connectés'],
      cta: 'postorico.com',
    }}
  />
);
