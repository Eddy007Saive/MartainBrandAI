import { Link } from 'react-router-dom';
import { LegalPage, LEGAL, Ph } from './shared';

export default function Cgu() {
  return (
    <LegalPage title="Conditions Générales d'Utilisation">
      <h3>1. Objet</h3>
      <p>
        Les présentes conditions régissent l'utilisation de <b>Presence OS</b>, une plateforme de
        création, planification et publication de contenus pour les réseaux sociaux, assistée par
        intelligence artificielle, éditée par <Ph>{LEGAL.societe}</Ph>. En créant un compte, tu acceptes
        ces conditions.
      </p>

      <h3>2. Compte</h3>
      <p>
        Tu dois fournir des informations exactes et garder ton mot de passe confidentiel. Tu es
        responsable de l'activité réalisée depuis ton compte. Un compte peut nécessiter une validation
        avant activation.
      </p>

      <h3>3. Offres, crédits &amp; paiement</h3>
      <ul>
        <li>L'offre Gratuite permet de tester le service avec un nombre limité de crédits, sans carte bancaire.</li>
        <li>Les offres payantes (Pro, Business) sont des abonnements mensuels créditant un quota de crédits chaque mois.</li>
        <li>Chaque génération (post, carrousel, image, script) consomme des crédits selon la qualité choisie.</li>
        <li>Les paiements sont traités par Stripe. L'abonnement se renouvelle automatiquement jusqu'à résiliation.</li>
      </ul>

      <h3>4. Résiliation</h3>
      <p>
        Tu peux résilier ton abonnement à tout moment depuis tes paramètres ; il reste actif jusqu'à la
        fin de la période en cours. Les crédits non utilisés ne sont ni reportés ni remboursés, sauf
        disposition légale impérative.
      </p>

      <h3>5. Contenus &amp; intelligence artificielle</h3>
      <ul>
        <li>Tu conserves la propriété des contenus que tu génères et publies.</li>
        <li>Les contenus sont produits par une IA à partir de tes consignes : tu es seul responsable de leur relecture, de leur exactitude et de leur publication.</li>
        <li>Tu t'engages à ne pas générer ou publier de contenus illégaux, trompeurs, diffamatoires ou contraires aux règles des réseaux sociaux.</li>
      </ul>

      <h3>6. Connexion aux réseaux sociaux</h3>
      <p>
        La publication s'effectue via les API officielles des réseaux, par connexion OAuth. Tu dois
        respecter les conditions d'utilisation de chaque plateforme. Nous ne sommes pas responsables d'un
        changement, d'une limitation ou d'une suspension imposés par ces plateformes.
      </p>

      <h3>7. Disponibilité &amp; responsabilité</h3>
      <p>
        Le service est fourni « en l'état ». Nous nous efforçons d'assurer sa continuité mais ne
        garantissons pas une disponibilité ininterrompue. Notre responsabilité ne saurait être engagée
        pour les dommages indirects liés à l'usage du service.
      </p>

      <h3>8. Données personnelles</h3>
      <p>
        Le traitement de tes données est décrit dans la{' '}
        <Link to="/confidentialite">Politique de confidentialité</Link>.
      </p>

      <h3>9. Modification</h3>
      <p>
        Ces conditions peuvent évoluer. En cas de modification importante, tu en seras informé. La
        poursuite de l'utilisation vaut acceptation des nouvelles conditions.
      </p>

      <h3>10. Droit applicable</h3>
      <p>
        Les présentes conditions sont soumises au droit français. En cas de litige, et à défaut de
        solution amiable, les tribunaux compétents seront ceux du ressort du siège de l'éditeur.
      </p>

      <p>Contact : <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a></p>
    </LegalPage>
  );
}
