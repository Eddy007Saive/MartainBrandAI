import { Link } from 'react-router-dom';
import { LegalPage, LEGAL } from './shared';

// Mentions légales du 20/10/2026 (texte fourni et validé par Martin).
export default function MentionsLegales() {
  const mail = <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>;
  return (
    <LegalPage title="Mentions légales">
      <h3>1. Éditeur du site</h3>
      <p>Le site postorico.com et le service <b>Postorico</b> sont édités par :</p>
      <p>
        <b>{LEGAL.societe}</b>, {LEGAL.statut}<br />
        Capital social : {LEGAL.capital}<br />
        Siège social : {LEGAL.adresse}<br />
        Immatriculée au Registre du commerce de Bulgarie (Agence d'enregistrement) sous le numéro UIC/EIK {LEGAL.eik}<br />
        N° de TVA intracommunautaire : {LEGAL.tva}<br />
        E-mail : {mail}
      </p>

      <h3>2. Directeur de la publication</h3>
      <p>{LEGAL.directeur}, en sa qualité de gérant (управител) de {LEGAL.societe}.<br />Contact : {mail}</p>

      <h3>3. Hébergement</h3>
      <p>
        <b>Site, application et serveurs :</b><br />
        Railway Corp., 548 Market St PMB 68956, San Francisco, CA 94104, États-Unis<br />
        Téléphone : +1 (415) 707-7675 – <a href="https://railway.com" target="_blank" rel="noopener noreferrer">railway.com</a>
      </p>
      <p>
        <b>Bases de données :</b><br />
        Supabase Pte. Ltd., 65 Chulia Street #38-02/03, OCBC Centre, Singapour 049513<br />
        <a href="https://supabase.com" target="_blank" rel="noopener noreferrer">supabase.com</a>
      </p>

      <h3>4. Clientèle</h3>
      <p>
        Postorico est un service destiné exclusivement aux professionnels (entreprises, indépendants,
        associations) agissant dans le cadre de leur activité. Il n'est pas proposé aux consommateurs.
      </p>

      <h3>5. Propriété intellectuelle</h3>
      <p>
        La marque Postorico, son logo, la mascotte Rico, ainsi que l'ensemble des éléments du site (textes,
        visuels, vidéos, interface, logiciels et code) sont la propriété exclusive de {LEGAL.societe} ou de ses
        partenaires. Toute reproduction, représentation, modification ou exploitation, totale ou partielle,
        sans autorisation écrite préalable de {LEGAL.societe} est interdite.
      </p>
      <p>
        Les contenus générés par l'utilisateur via le service restent sa propriété, dans les conditions prévues
        par les <Link to="/cgu">Conditions générales d'utilisation</Link>.
      </p>

      <h3>6. Responsabilité</h3>
      <p>
        {LEGAL.societe} s'efforce de fournir des informations exactes et à jour sur le site. Elle ne saurait être
        tenue responsable des erreurs ou omissions, d'une indisponibilité temporaire du site ou du service, ni de
        l'usage fait par l'utilisateur des contenus générés et publiés depuis son compte.
      </p>
      <p>
        Les liens vers des sites tiers sont fournis à titre informatif ; {LEGAL.societe} n'exerce aucun contrôle
        sur ces sites et décline toute responsabilité quant à leur contenu.
      </p>

      <h3>7. Données personnelles</h3>
      <p>
        Le responsable du traitement des données personnelles collectées sur postorico.com est {LEGAL.societe},
        {' '}{LEGAL.adresse}.
      </p>
      <p>
        Le détail des traitements, de leurs finalités et des droits des personnes concernées (accès,
        rectification, effacement, limitation, opposition, portabilité) figure dans la{' '}
        <Link to="/confidentialite">Politique de confidentialité</Link>.
      </p>
      <p>Toute demande peut être adressée à : {mail}</p>
      <p>
        Autorité de contrôle compétente : Commission bulgare pour la protection des données personnelles
        (Комисия за защита на личните данни), 2 boulevard Prof. Tsvetan Lazarov, 1592 Sofia, Bulgarie –{' '}
        <a href="https://cpdp.bg" target="_blank" rel="noopener noreferrer">cpdp.bg</a>. Les utilisateurs résidant
        en France peuvent également saisir la CNIL (<a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">cnil.fr</a>).
      </p>

      <h3>8. Contact</h3>
      <p>Pour toute question relative au site ou au service : {mail}</p>
    </LegalPage>
  );
}
