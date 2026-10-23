import { Link } from 'react-router-dom';
import { LegalPage, LEGAL } from './shared';

export default function Cgu() {
  return (
    <LegalPage title="Conditions Générales d'Utilisation">
      <h3>Article 1 – Éditeur</h3>
      <p>
        La plateforme Postorico, accessible sur postorico.com et via l'application mobile
        Postorico, est éditée par {LEGAL.societe}, société unipersonnelle à responsabilité
        limitée de droit bulgare au capital de 1,02 € (2 BGN), siège 78 boulevard Vitosha, 1463
        Sofia, Bulgarie, UIC/EIK 207893855, TVA BG207893855 (« Kraemer Ventures »).
        <br />
        Contact : <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
      </p>

      <h3>Article 2 – Définitions</h3>
      <p>
        <b>Plateforme</b> : le site postorico.com, l'application mobile et l'ensemble des
        fonctionnalités Postorico.
        <br />
        <b>Utilisateur</b> : tout professionnel qui crée un compte sur la Plateforme, ainsi que
        les personnes qu'il autorise à utiliser son compte.
        <br />
        <b>Contenus</b> : les textes, posts, carrousels, visuels, vidéos et autres éléments
        générés, importés, programmés ou publiés via la Plateforme.
        <br />
        <b>Réseaux connectés</b> : les comptes de réseaux sociaux et la fiche Google Business
        Profile que l'Utilisateur relie à la Plateforme.
      </p>

      <h3>Article 3 – Objet et acceptation</h3>
      <p>
        Les CGU définissent les règles d'accès et d'utilisation de la Plateforme. Les conditions
        commerciales (prix, essai gratuit, paiement, résiliation) sont fixées par les Conditions
        générales de vente (« CGV »), disponibles sur postorico.com/cgv.
      </p>
      <p>
        La création d'un compte vaut acceptation des CGU. L'Utilisateur qui ne les accepte pas ne
        doit pas utiliser la Plateforme.
      </p>

      <h3>Article 4 – Accès réservé aux professionnels</h3>
      <p>
        La Plateforme est réservée aux professionnels agissant pour les besoins de leur activité.
        L'Utilisateur déclare être majeur et avoir le pouvoir d'engager l'entreprise pour
        laquelle il crée le compte.
      </p>

      <h3>Article 5 – Compte</h3>
      <p>
        5.1 L'Utilisateur fournit des informations exactes et les tient à jour.
        <br />
        5.2 Il garde ses identifiants confidentiels et répond de toute activité réalisée depuis
        son compte. Il informe sans délai {LEGAL.societe} de toute utilisation non autorisée à{' '}
        {LEGAL.email}.
        <br />
        5.3 {LEGAL.societe} peut vérifier les informations fournies et refuser ou suspendre
        l'ouverture d'un compte en cas d'informations inexactes ou d'usage contraire aux CGU.
      </p>

      <h3>Article 6 – Description du service</h3>
      <p>La Plateforme permet de :</p>
      <ul>
        <li>paramétrer la voix, la ligne éditoriale et l'identité visuelle de l'entreprise ;</li>
        <li>générer des posts, carrousels et visuels avec l'aide de l'intelligence artificielle ;</li>
        <li>planifier et publier ces Contenus sur LinkedIn, Instagram, Facebook, TikTok, YouTube et X ;</li>
        <li>gérer la fiche Google Business Profile ;</li>
        <li>organiser un calendrier éditorial.</li>
      </ul>
      <p>
        Aucun Contenu n'est publié sans la validation de l'Utilisateur. {LEGAL.societe} peut
        faire évoluer les fonctionnalités pour améliorer le service, sans supprimer les
        fonctionnalités essentielles de l'abonnement souscrit.
      </p>

      <h3>Article 7 – Réseaux connectés</h3>
      <p>
        7.1 Pour publier, l'Utilisateur autorise la Plateforme à accéder à ses Réseaux connectés
        via les connexions officielles proposées par chaque plateforme. Il peut retirer cette
        autorisation à tout moment depuis la Plateforme ou depuis les paramètres du réseau
        concerné.
        <br />
        7.2 L'Utilisateur doit être titulaire des comptes connectés ou dûment autorisé à les
        gérer.
        <br />
        7.3 L'Utilisateur respecte les conditions d'utilisation de chaque réseau. L'utilisation
        des fonctionnalités YouTube implique l'acceptation des Conditions d'utilisation de
        YouTube (youtube.com/t/terms) et de la Règle de confidentialité de Google
        (policies.google.com/privacy).
        <br />
        7.4 Les réseaux sociaux et Google peuvent modifier, limiter ou suspendre à tout moment
        leurs services ou leurs connexions. {LEGAL.societe} ne maîtrise pas ces décisions et n'en
        est pas responsable.
      </p>

      <h3>Article 8 – Contenus générés par intelligence artificielle</h3>
      <p>
        8.1 Les Contenus sont générés automatiquement à partir des consignes et informations
        fournies par l'Utilisateur. Ils peuvent comporter des erreurs, des imprécisions ou des
        ressemblances avec des contenus existants.
        <br />
        8.2 L'Utilisateur relit chaque Contenu avant de le valider. Il est seul responsable de son
        exactitude, de sa conformité à la loi et de sa publication.
        <br />
        8.3 Lorsque la loi ou les règles d'un réseau l'exigent, l'Utilisateur signale que le
        Contenu a été généré ou modifié par intelligence artificielle, notamment pour les images
        ou vidéos réalistes.
      </p>

      <h3>Article 9 – Utilisations interdites</h3>
      <p>
        Il est interdit d'utiliser la Plateforme pour générer ou publier des Contenus illégaux,
        trompeurs, diffamatoires, discriminatoires, haineux, violents ou à caractère sexuel ; de
        faux avis ou de faux témoignages ; des Contenus portant atteinte aux droits d'un tiers
        (droit d'auteur, marque, image, vie privée) ; des messages non sollicités en masse.
      </p>
      <p>
        Il est également interdit de tenter d'accéder sans autorisation aux systèmes de la
        Plateforme, de la copier, de l'extraire, de la décompiler, de la revendre ou de la
        mettre à disposition d'un tiers sans accord écrit de {LEGAL.societe}.
      </p>

      <h3>Article 10 – Propriété des Contenus</h3>
      <p>
        10.1 L'Utilisateur conserve la propriété des éléments qu'il importe (logos, photos,
        textes) et des Contenus générés pour lui. Il garantit disposer des droits nécessaires sur
        les éléments qu'il importe.
        <br />
        10.2 L'Utilisateur accorde à {LEGAL.societe}, pour la seule durée de son abonnement, le
        droit d'héberger, reproduire, adapter et publier ces éléments et Contenus, uniquement
        pour fournir le service.
        <br />
        10.3 {LEGAL.societe} n'utilise pas les Contenus de l'Utilisateur à des fins publicitaires
        sans son accord écrit.
      </p>

      <h3>Article 11 – Propriété de la Plateforme</h3>
      <p>
        La Plateforme, son logiciel, ses modèles, ses bases de données, la marque Postorico, son
        logo et la mascotte Rico sont la propriété exclusive de {LEGAL.societe}. L'Utilisateur
        bénéficie d'un droit d'utilisation personnel, non exclusif et non transférable pendant la
        durée de son abonnement.
      </p>

      <h3>Article 12 – Disponibilité et sécurité</h3>
      <p>
        {LEGAL.societe} s'efforce de rendre la Plateforme accessible en permanence, sans le
        garantir. L'accès peut être interrompu pour maintenance, mise à jour ou en cas de panne
        d'un hébergeur ou d'une plateforme tierce. {LEGAL.societe} met en œuvre des mesures de
        sécurité raisonnables pour protéger les données et les accès.
      </p>
      <p>L'Utilisateur conserve une copie de ses Contenus importants.</p>

      <h3>Article 13 – Données personnelles</h3>
      <p>
        Les données personnelles sont traitées conformément au Règlement (UE) 2016/679 (RGPD) et
        à la{' '}
        <Link to="/confidentialite">Politique de confidentialité</Link>, disponible sur
        postorico.com/confidentialite.
      </p>

      <h3>Article 14 – Suspension et fermeture du compte</h3>
      <p>
        14.1 En cas de manquement aux CGU, {LEGAL.societe} peut suspendre ou fermer le compte
        après mise en demeure restée sans effet pendant 15 jours. En cas de manquement grave ou
        d'usage manifestement illicite, la suspension peut être immédiate.
        <br />
        14.2 L'Utilisateur peut fermer son compte à tout moment depuis ses paramètres ou par
        e-mail à {LEGAL.email}. Les conditions de résiliation de l'abonnement sont prévues par
        les CGV.
        <br />
        14.3 Après la fermeture, l'Utilisateur dispose de 30 jours pour récupérer ses Contenus.
        Passé ce délai, ils peuvent être supprimés.
      </p>

      <h3>Article 15 – Responsabilité</h3>
      <p>
        15.1 {LEGAL.societe} est tenue d'une obligation de moyens. Elle ne garantit aucun
        résultat en termes d'audience, d'abonnés, d'avis, de chiffre d'affaires ou de
        référencement.
        <br />
        15.2 {LEGAL.societe} n'est pas responsable des Contenus validés et publiés par
        l'Utilisateur, ni des décisions des réseaux sociaux et de Google.
        <br />
        15.3 La responsabilité de {LEGAL.societe} est limitée dans les conditions prévues à
        l'article 11 des CGV.
      </p>

      <h3>Article 16 – Liens et services tiers</h3>
      <p>
        La Plateforme peut renvoyer vers des sites ou services tiers. {LEGAL.societe} ne contrôle
        pas ces services et n'est pas responsable de leur contenu ni de leur fonctionnement.
      </p>

      <h3>Article 17 – Modification des CGU</h3>
      <p>
        {LEGAL.societe} peut modifier les CGU. Toute modification substantielle est notifiée par
        e-mail au moins 30 jours avant son entrée en vigueur. L'Utilisateur qui la refuse peut
        fermer son compte avant cette date ; la poursuite de l'utilisation après cette date vaut
        acceptation.
      </p>

      <h3>Article 18 – Langue, droit applicable et litiges</h3>
      <p>
        18.1 Les CGU sont rédigées en français. En cas de traduction, la version française fait
        foi.
        <br />
        18.2 Les CGU sont soumises au droit bulgare.
        <br />
        18.3 En cas de différend, les parties recherchent d'abord une solution amiable, sur
        demande écrite adressée à {LEGAL.email}. À défaut d'accord dans un délai de 30 jours, le
        litige est porté devant les tribunaux compétents de Sofia, Bulgarie.
      </p>

      <p>Dernière mise à jour : 23 octobre 2026</p>
    </LegalPage>
  );
}
