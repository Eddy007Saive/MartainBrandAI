/**
 * Polices des reels : celles de la charte du client (Paramètres > Style, typo_primaire pour
 * les titres, typo_secondaire pour le texte), Sora / Inter par défaut.
 *
 * Avant ce module, les compositions écrivaient « Sora » en dur sans jamais la charger : le
 * serveur de rendu (Linux, polices Liberation seulement) sortait les reels dans une police de
 * repli. Les polices Google viennent de @remotion/google-fonts (même voie que l'éditeur de
 * montage) ; les trois polices maison sont des fichiers de public/fonts. Un échec de
 * chargement ne bloque jamais le rendu : la pile de repli prend le relais.
 *
 * La liste suit les sélecteurs de Paramètres (frontend/src/lib/carrouselPreview.js,
 * CAROUSEL_FONTS et CAROUSEL_BODY_FONTS).
 */
import { staticFile } from 'remotion';
import * as Anton from '@remotion/google-fonts/Anton';
import * as ArchivoBlack from '@remotion/google-fonts/ArchivoBlack';
import * as BarlowCondensed from '@remotion/google-fonts/BarlowCondensed';
import * as BebasNeue from '@remotion/google-fonts/BebasNeue';
import * as DMSans from '@remotion/google-fonts/DMSans';
import * as DMSerifDisplay from '@remotion/google-fonts/DMSerifDisplay';
import * as Fraunces from '@remotion/google-fonts/Fraunces';
import * as Gantari from '@remotion/google-fonts/Gantari';
import * as Geologica from '@remotion/google-fonts/Geologica';
import * as Inter from '@remotion/google-fonts/Inter';
import * as Lora from '@remotion/google-fonts/Lora';
import * as Manrope from '@remotion/google-fonts/Manrope';
import * as Montserrat from '@remotion/google-fonts/Montserrat';
import * as Nunito from '@remotion/google-fonts/Nunito';
import * as Oswald from '@remotion/google-fonts/Oswald';
import * as PlayfairDisplay from '@remotion/google-fonts/PlayfairDisplay';
import * as Poppins from '@remotion/google-fonts/Poppins';
import * as Raleway from '@remotion/google-fonts/Raleway';
import * as Sora from '@remotion/google-fonts/Sora';
import * as SourceSerif4 from '@remotion/google-fonts/SourceSerif4';
import * as SpaceGrotesk from '@remotion/google-fonts/SpaceGrotesk';
import * as WorkSans from '@remotion/google-fonts/WorkSans';

type ModuleGoogle = {
  getInfo: () => { fonts: Record<string, Record<string, unknown>> };
  loadFont: (style?: string, opts?: { weights?: string[]; subsets?: string[] }) => unknown;
};

const GOOGLE: Record<string, ModuleGoogle> = {
  Anton, 'Archivo Black': ArchivoBlack, 'Barlow Condensed': BarlowCondensed, 'Bebas Neue': BebasNeue,
  'DM Sans': DMSans, 'DM Serif Display': DMSerifDisplay, Fraunces, Gantari, Geologica, Inter, Lora, Manrope,
  Montserrat, Nunito, Oswald, 'Playfair Display': PlayfairDisplay, Poppins, Raleway, Sora,
  'Source Serif 4': SourceSerif4, 'Space Grotesk': SpaceGrotesk, 'Work Sans': WorkSans,
} as unknown as Record<string, ModuleGoogle>;

// Polices maison (fichiers copiés depuis frontend/public/fonts) : [fichier, graisse]
const MAISON: Record<string, Array<[string, string]>> = {
  'Circular Bold': [['fonts/CircularBold.ttf', '700']],
  'TT Norms Pro': [
    ['fonts/TTNormsPro-Regular.otf', '400'], ['fonts/TTNormsPro-Medium.otf', '500'],
    ['fonts/TTNormsPro-Bold.otf', '700'], ['fonts/TTNormsPro-ExtraBold.otf', '800'],
  ],
  Wotfard: [['fonts/Wotfard-Regular.woff2', '400']],
};

// Pile de repli selon la famille (serif ou non), pour un rendu proche si le chargement échoue
const SERIF = new Set(['Playfair Display', 'Fraunces', 'DM Serif Display', 'Lora', 'Source Serif 4']);
const SUBSETS = ['latin', 'latin-ext'];
const VOULUES = ['400', '500', '600', '700', '800', '900'];
const chargees = new Set<string>();

/** « Famille|bi » (format des sélecteurs de Paramètres) -> « Famille ». */
export const nomFamille = (spec?: string | null): string => (spec || '').split('|')[0].trim();

/** Charge une famille une seule fois (en tâche de fond, jamais bloquant). */
export function chargerPolice(spec?: string | null): void {
  const nom = nomFamille(spec);
  if (!nom || chargees.has(nom)) return;
  chargees.add(nom);
  try {
    const g = GOOGLE[nom];
    if (g) {
      // Seulement les graisses qui existent : en demander une absente fait échouer le chargement.
      const dispo = Object.keys(g.getInfo().fonts.normal || {});
      const graisses = VOULUES.filter((w) => dispo.includes(w));
      g.loadFont('normal', { weights: graisses.length ? graisses : dispo, subsets: SUBSETS });
      return;
    }
    if (MAISON[nom] && typeof document !== 'undefined') {
      MAISON[nom].forEach(([fichier, poids]) => {
        new FontFace(nom, `url(${staticFile(fichier)})`, { weight: poids })
          .load()
          .then((f) => { (document.fonts as FontFaceSet).add(f); })
          .catch(() => {});
      });
    }
  } catch {
    /* police indisponible : la pile de repli prend le relais */
  }
}

const pile = (nom: string, defaut: string) => {
  const repli = SERIF.has(nom) ? "Georgia, 'Times New Roman', serif" : 'Inter, sans-serif';
  return nom ? `'${nom}', ${defaut}, ${repli}` : `${defaut}, ${repli}`;
};

/** font-family des titres (texte animé, CTA) : police de titre de la charte, sinon Sora. */
export function policeTitre(spec?: string | null): string {
  const nom = nomFamille(spec);
  chargerPolice(nom || 'Sora');
  return pile(nom, 'Sora');
}

/** font-family du texte courant (bandeaux, étiquettes) : police de texte, sinon Inter. */
export function policeTexte(spec?: string | null): string {
  const nom = nomFamille(spec);
  chargerPolice(nom || 'Inter');
  return pile(nom, 'Inter');
}

// Sora et Inter servent dans toutes les compositions : chargées dès l'ouverture du bundle.
chargerPolice('Sora');
chargerPolice('Inter');
