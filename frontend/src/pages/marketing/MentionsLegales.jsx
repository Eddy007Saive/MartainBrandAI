import { Link } from 'react-router-dom';
import { LegalPage, LEGAL, Ph } from './shared';

export default function MentionsLegales() {
  return (
    <LegalPage title="Mentions légales">
      <h3>Éditeur du site</h3>
      <p>
        Le site et l'application <b>Presence OS</b> sont édités par <Ph>{LEGAL.societe}</Ph>,
        {' '}<Ph>{LEGAL.statut}</Ph>, immatriculée sous le numéro <Ph>{LEGAL.siret}</Ph>,
        dont le siège est situé <Ph>{LEGAL.adresse}</Ph>.
      </p>
      <p>Directeur de la publication : <Ph>{LEGAL.directeur}</Ph>.</p>
      <p>Contact : <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a></p>

      <h3>Hébergement</h3>
      <p>{LEGAL.hebergeur}.</p>

      <h3>Propriété intellectuelle</h3>
      <p>
        L'ensemble des éléments du site (marque, logo, textes, interface, code) est protégé par le droit
        de la propriété intellectuelle et reste la propriété exclusive de l'éditeur. Toute reproduction
        non autorisée est interdite. Les contenus que tu génères via le service restent ta propriété
        (voir les <Link to="/cgu">Conditions Générales d'Utilisation</Link>).
      </p>

      <h3>Responsabilité</h3>
      <p>
        L'éditeur s'efforce d'assurer l'exactitude des informations diffusées mais ne saurait être tenu
        responsable des erreurs, d'une indisponibilité temporaire du service, ou de l'usage fait des
        contenus générés.
      </p>

      <h3>Données personnelles</h3>
      <p>
        Le traitement de tes données est décrit dans notre{' '}
        <Link to="/confidentialite">Politique de confidentialité</Link>.
      </p>
    </LegalPage>
  );
}
