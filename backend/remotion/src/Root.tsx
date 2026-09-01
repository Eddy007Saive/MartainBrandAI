import React from 'react';
import { Composition } from 'remotion';
import { ReelBrand } from './ReelBrand';
import { ReelLong } from './ReelLong';
import { ReelStat } from './ReelStat';
import { ReelAffiche } from './ReelAffiche';
import { ReelSequence, dureeScenario, SequenceSegment } from './ReelSequence';
import { StoryAnime } from './StoryAnime';

// Les props sont injectées par le backend (reel_service.py) via --props.
export const Root: React.FC = () => (
  <>
    {/* Moteur de séquences : durée VARIABLE, calculée depuis le scénario */}
    <Composition
      id="ReelSequence"
      component={ReelSequence}
      durationInFrames={540}
      fps={30}
      width={1080}
      height={1920}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.round(dureeScenario(props.segments as SequenceSegment[]) * 30),
      })}
      defaultProps={{
        brand: {
          nom: 'Postorico', principale: '#5B6CFF', accent: '#3AFFA3',
          fond: '#020617', logo: null as string | null,
        },
        segments: [
          { type: 'typo' as const, dur: 2.4, texte: 'ARRÊTE DE SCROLLER', accents: ['ARRÊTE'] },
          { type: 'image' as const, dur: 2.9, texte: 'TON DASHBOARD EN TEMPS RÉEL', accents: ['DASHBOARD'], image: null, effet: 'zoomIn' as const, tilt: -3 },
          { type: 'typo' as const, dur: 2.6, texte: "L'IA RÉDIGE TES POSTS", accents: ['RÉDIGE', 'POSTS'] },
          { type: 'cta' as const, dur: 3.6, texte: '14 JOURS GRATUITS', accents: ['14', 'JOURS'], bar: 'postorico.com' },
        ] as SequenceSegment[],
      }}
    />
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
    {/* Story animée 5 s : premier gabarit anime (aurore, accroche en dégradé mouvant, CTA en relief) */}
    <Composition
      id="StoryAnime"
      component={StoryAnime}
      durationInFrames={150}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        brand: {
          nom: 'Postorico', principale: '#8A6CFF', accent: '#3AFFA3',
          fond: '#0b1020', logo: null as string | null,
        },
        accroche: 'Tes chiffres sont bons, tu crèves quand même',
        motAccent: 'quand même',
        sous: 'À 60 biens, la marge ne suit plus si tu ne vois pas ce qui te coûte.',
        cta: 'Écris-moi DASHBOARD',
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
