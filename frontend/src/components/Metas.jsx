import { useEffect } from 'react';

/**
 * Les balises de tête d'une page : titre, description, aperçu social, données
 * structurées.
 *
 * Tout le site partageait jusqu'ici le même titre — « Postorico » — et la même
 * description. C'est sans conséquence sur une application où l'on entre par
 * l'accueil ; c'en est une sur un blog, où chaque article est une porte
 * d'entrée depuis un moteur de recherche. Un article sans titre propre ne peut
 * pas être distingué d'un autre dans une page de résultats.
 *
 * Le prérendu enregistre le HTML APRÈS le rendu de React : ce que ce composant
 * écrit dans `<head>` se retrouve donc dans le fichier statique servi aux
 * robots, qui n'exécutent pas JavaScript.
 *
 * Les balises portent `data-metas` et sont retirées au démontage : sans cela,
 * le titre d'un article suivrait le visiteur sur la page suivante.
 */
const SITE = 'https://postorico.com';

const meta = (attr, valeur, contenu) => {
  const el = document.createElement('meta');
  el.setAttribute(attr, valeur);
  el.setAttribute('content', contenu);
  el.setAttribute('data-metas', '');
  return el;
};

const lien = (rel, href, hreflang) => {
  const el = document.createElement('link');
  el.setAttribute('rel', rel);
  el.setAttribute('href', href);
  if (hreflang) el.setAttribute('hreflang', hreflang);
  el.setAttribute('data-metas', '');
  return el;
};

export default function Metas({
  titre, description, image, type = 'website',
  canonique, alternatives, schema, langue = 'fr',
}) {
  useEffect(() => {
    const titreAvant = document.title;
    document.title = titre;

    const poses = [];
    const ajouter = (el) => { document.head.appendChild(el); poses.push(el); };

    if (description) {
      // La description d'origine vit dans index.html : on la met de côté le
      // temps de la page plutôt que d'en ajouter une seconde, que les moteurs
      // ignoreraient de toute façon.
      const dOrigine = document.head.querySelector('meta[name="description"]:not([data-metas])');
      if (dOrigine) dOrigine.setAttribute('data-remplacee', dOrigine.getAttribute('content'));
      dOrigine?.setAttribute('content', description);
      if (!dOrigine) ajouter(meta('name', 'description', description));
    }

    ajouter(meta('property', 'og:title', titre));
    ajouter(meta('property', 'og:type', type));
    ajouter(meta('property', 'og:site_name', 'Postorico'));
    ajouter(meta('property', 'og:locale', { fr: 'fr_FR', en: 'en_US', es: 'es_ES' }[langue] || 'fr_FR'));
    if (description) ajouter(meta('property', 'og:description', description));
    if (canonique) ajouter(meta('property', 'og:url', SITE + canonique));
    if (image) {
      ajouter(meta('property', 'og:image', image));
      ajouter(meta('property', 'og:image:width', '1200'));
      ajouter(meta('property', 'og:image:height', '630'));
    }
    // Sans « summary_large_image », X et LinkedIn affichent une vignette
    // carrée minuscule au lieu de l'image d'ouverture.
    ajouter(meta('name', 'twitter:card', image ? 'summary_large_image' : 'summary'));
    ajouter(meta('name', 'twitter:title', titre));
    if (description) ajouter(meta('name', 'twitter:description', description));
    if (image) ajouter(meta('name', 'twitter:image', image));

    if (canonique) ajouter(lien('canonical', SITE + canonique));
    (alternatives || []).forEach(({ langue: l, chemin }) => {
      ajouter(lien('alternate', SITE + chemin, l));
    });
    if (alternatives?.length) {
      const defaut = alternatives.find((a) => a.langue === 'fr') || alternatives[0];
      ajouter(lien('alternate', SITE + defaut.chemin, 'x-default'));
    }

    if (schema) {
      const el = document.createElement('script');
      el.setAttribute('type', 'application/ld+json');
      el.setAttribute('data-metas', '');
      el.textContent = JSON.stringify(schema);
      ajouter(el);
    }

    return () => {
      document.title = titreAvant;
      const dOrigine = document.head.querySelector('meta[name="description"][data-remplacee]');
      if (dOrigine) {
        dOrigine.setAttribute('content', dOrigine.getAttribute('data-remplacee'));
        dOrigine.removeAttribute('data-remplacee');
      }
      poses.forEach((el) => el.remove());
    };
  }, [titre, description, image, type, canonique, alternatives, schema, langue]);

  return null;
}
