import { Link } from 'react-router-dom';
import { LegalPage, LEGAL, Ph } from './shared';

export default function Confidentialite() {
  return (
    <LegalPage title="Politique de confidentialité">
      <p>
        Cette politique explique quelles données personnelles <b>Presence OS</b> collecte, pourquoi, et
        quels sont tes droits. Le responsable de traitement est <Ph>{LEGAL.societe}</Ph>
        {' '}(contact : <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>).
      </p>

      <h3>Données que nous collectons</h3>
      <ul>
        <li><b>Compte</b> : nom, identifiant, adresse e-mail, mot de passe (chiffré).</li>
        <li><b>Profil de marque</b> : secteur, voix de marque, audience, piliers, exemples, couleurs, logo.</li>
        <li><b>Contenus</b> : posts, carrousels, scripts, images générés et planifiés.</li>
        <li><b>Comptes sociaux</b> : jetons d'accès obtenus via OAuth officiel pour publier en ton nom. Nous ne stockons jamais tes mots de passe de réseaux sociaux.</li>
        <li><b>Paiement</b> : géré par notre prestataire Stripe ; nous ne stockons aucune donnée de carte bancaire.</li>
        <li><b>Appareil</b> : jeton de notification push (si tu installes l'application mobile).</li>
        <li><b>Usage</b> : journaux techniques et consommation de crédits.</li>
      </ul>

      <h3>Finalités &amp; base légale</h3>
      <ul>
        <li>Fournir le service (exécution du contrat) : génération, planification, publication, analytics.</li>
        <li>Gérer ton abonnement et la facturation (exécution du contrat / obligation légale).</li>
        <li>T'envoyer des notifications liées au service (intérêt légitime / consentement pour le push).</li>
        <li>Améliorer et sécuriser la plateforme (intérêt légitime).</li>
      </ul>

      <h3>Sous-traitants &amp; partage</h3>
      <p>Pour faire fonctionner le service, nous faisons appel à des prestataires qui traitent des données pour notre compte :</p>
      <ul>
        <li><b>Supabase</b> — hébergement de la base de données.</li>
        <li><b>Railway</b> — hébergement de l'application.</li>
        <li><b>Stripe</b> — paiements et abonnements.</li>
        <li><b>Cloudinary</b> — stockage des médias (images, carrousels).</li>
        <li><b>Late / Zernio</b> — connexion et publication sur les réseaux sociaux, analytics et commentaires.</li>
        <li><b>Google Firebase</b> — envoi des notifications push.</li>
        <li>Un <b>prestataire d'intelligence artificielle générative</b> — pour produire les contenus à partir de tes consignes.</li>
      </ul>
      <p>Nous ne vendons pas tes données personnelles.</p>

      <h3>Durée de conservation</h3>
      <p>
        Tes données sont conservées tant que ton compte est actif. À la suppression de ton compte, elles
        sont effacées sous 30 jours, sauf obligation légale de conservation (ex. facturation).
      </p>

      <h3>Tes droits (RGPD)</h3>
      <p>
        Tu disposes d'un droit d'accès, de rectification, d'effacement, de limitation, d'opposition et de
        portabilité. Pour les exercer, écris à <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>. Tu peux
        aussi introduire une réclamation auprès de la CNIL (cnil.fr).
      </p>

      <h3>Cookies</h3>
      <p>
        Nous utilisons uniquement les cookies et stockages techniques nécessaires au fonctionnement
        (authentification). Aucun cookie publicitaire de suivi tiers.
      </p>

      <h3>Sécurité</h3>
      <p>
        Mots de passe chiffrés (bcrypt), connexions par jeton, accès aux réseaux via OAuth officiel. Tu
        peux déconnecter un réseau social à tout moment depuis tes paramètres.
      </p>

      <p>Voir aussi les <Link to="/cgu">Conditions Générales d'Utilisation</Link>.</p>
    </LegalPage>
  );
}
