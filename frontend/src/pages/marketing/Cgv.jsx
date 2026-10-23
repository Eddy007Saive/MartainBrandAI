import { Link } from 'react-router-dom';
import { LegalPage, LEGAL } from './shared';

export default function Cgv() {
  return (
    <LegalPage title="Conditions Générales de Vente">
      <h3>Article 1 – Objet</h3>
      <p>
        Les présentes conditions générales de vente (« CGV ») fixent les conditions commerciales
        de l'abonnement à la Plateforme Postorico, éditée par {LEGAL.societe} (voir les{' '}
        <Link to="/cgu">Conditions générales d'utilisation</Link> pour les définitions et les
        règles d'accès et d'usage de la Plateforme, applicables en complément des présentes).
      </p>

      <h3>Article 2 – Définitions</h3>
      <p>
        <b>Abonnement</b> : le droit d'accès à la Plateforme, souscrit pour une Période.
        <br />
        <b>Période</b> : l'intervalle mensuel sur lequel l'Abonnement est facturé et les Quotas
        décomptés.
        <br />
        <b>Essai gratuit</b> : la période initiale d'accès à la Plateforme, sans engagement ni
        paiement.
        <br />
        <b>Quota</b> : le nombre d'actions (sujets, posts, visuels, carrousels…) incluses dans
        l'Abonnement pour une Période, par type d'action.
      </p>

      <h3>Article 3 – Accès réservé aux professionnels</h3>
      <p>
        Conformément aux CGU, l'Abonnement est réservé aux professionnels agissant pour les
        besoins de leur activité.
      </p>

      <h3>Article 4 – Essai gratuit et abonnement</h3>
      <p>
        L'Utilisateur peut tester la Plateforme pendant un essai gratuit de 14 jours, sans carte
        bancaire. À l'issue de l'essai, ou dès la souscription directe, l'Abonnement donne accès
        à la Plateforme pour une Période mensuelle, renouvelée automatiquement jusqu'à
        résiliation. Il n'est soumis à aucune durée d'engagement minimale.
      </p>

      <h3>Article 5 – Pack Fondations</h3>
      <p>
        En complément de l'Abonnement, l'Utilisateur peut souscrire, en une seule fois, au Pack
        Fondations : les équipes de {LEGAL.societe} étudient sa marque, bâtissent sa ligne
        éditoriale et livrent ses gabarits de Contenus avant qu'il ne prenne la main. Le Pack
        Fondations est facturé au moment de la souscription et n'est pas renouvelé
        automatiquement.
      </p>

      <h3>Article 6 – Quotas d'utilisation</h3>
      <p>
        Chaque Abonnement donne droit à un Quota par type d'action, précisé pour l'offre
        souscrite sur postorico.com/tarifs. Le Quota non consommé sur une Période est reporté et
        s'accumule sur la Période suivante tant que l'Abonnement reste actif. L'Utilisateur peut,
        lorsque cette option est proposée sur la Plateforme, acheter un complément ponctuel de
        Quota.
      </p>

      <h3>Article 7 – Prix et paiement</h3>
      <p>
        Les prix en vigueur sont ceux affichés sur postorico.com/tarifs au moment de la
        souscription ou du renouvellement. Les paiements sont traités par Stripe. L'Abonnement
        est prélevé au début de chaque Période, par le moyen de paiement enregistré par
        l'Utilisateur.
      </p>

      <h3>Article 8 – Durée, résiliation et suspension pour impayé</h3>
      <p>
        8.1 L'Abonnement est conclu pour une durée indéterminée. L'Utilisateur peut résilier à
        tout moment depuis ses paramètres ; la résiliation prend effet à la fin de la Période en
        cours, déjà payée, sans remboursement de la Période entamée.
        <br />
        8.2 En cas d'échec de paiement, {LEGAL.societe} peut suspendre l'accès à la Plateforme
        jusqu'à régularisation, après en avoir informé l'Utilisateur.
      </p>

      <h3>Article 9 – Absence de droit de rétractation</h3>
      <p>
        L'Abonnement étant souscrit par un professionnel pour les besoins de son activité, il
        n'est pas soumis au droit de rétractation applicable aux consommateurs.
      </p>

      <h3>Article 10 – Réclamations</h3>
      <p>
        Toute réclamation relative à la facturation ou à l'Abonnement est adressée à{' '}
        {LEGAL.email}.
      </p>

      <h3>Article 11 – Obligations et responsabilité de {LEGAL.societe}</h3>
      <p>
        {LEGAL.societe} est tenue d'une obligation de moyens. Elle met en œuvre les moyens
        raisonnables pour assurer l'accès et le bon fonctionnement du service, sans garantir une
        disponibilité ininterrompue.
      </p>
      <p>
        Les contenus sont générés avec l'aide de l'intelligence artificielle à partir des
        consignes et informations du Client. {LEGAL.societe} ne garantit pas de résultat en
        termes d'audience, d'abonnés, d'avis, de chiffre d'affaires ou de référencement.
      </p>
      <p>
        {LEGAL.societe} n'est pas responsable des changements, restrictions, suspensions ou
        pannes imposés par les plateformes tierces (Meta, TikTok, LinkedIn, YouTube, X, Google),
        ni de leurs conséquences sur la publication des contenus.
      </p>
      <p>
        La responsabilité de {LEGAL.societe} est limitée aux dommages directs et prouvés. Elle
        ne couvre pas les dommages indirects (perte de chiffre d'affaires, de clientèle, d'image
        ou de données). En tout état de cause, elle est plafonnée au montant total payé par le
        Client au cours des 12 mois précédant le fait générateur.
      </p>

      <h3>Article 12 – Propriété intellectuelle</h3>
      <p>
        Les contenus générés pour le Client et les livrables du Pack Fondations appartiennent au
        Client dès leur paiement. La plateforme Postorico, son logiciel, ses modèles, la marque
        Postorico et la mascotte Rico restent la propriété exclusive de {LEGAL.societe}. Aucune
        cession de droits sur la plateforme n'est consentie au Client, qui bénéficie uniquement
        d'un droit d'utilisation personnel et non transférable pendant la durée de son
        abonnement.
      </p>

      <h3>Article 13 – Données personnelles</h3>
      <p>
        {LEGAL.societe} traite les données personnelles du Client conformément au Règlement (UE)
        2016/679 (RGPD) et à sa{' '}
        <Link to="/confidentialite">Politique de confidentialité</Link>, disponible sur
        postorico.com/confidentialite. Pour les données personnelles que le Client confie au
        service dans le cadre de ses publications, {LEGAL.societe} agit en qualité de
        sous-traitant, uniquement sur instruction du Client et pour l'exécution du service.
      </p>

      <h3>Article 14 – Force majeure</h3>
      <p>
        Aucune partie n'est responsable d'un manquement causé par un cas de force majeure au sens
        de la loi applicable, notamment une panne générale d'internet, une défaillance des
        hébergeurs ou des plateformes tierces, une cyberattaque ou une décision administrative.
        Si l'empêchement dure plus de 30 jours, chaque partie peut résilier sans indemnité.
      </p>

      <h3>Article 15 – Modification des CGV</h3>
      <p>
        {LEGAL.societe} peut modifier les CGV. Les CGV applicables sont celles en vigueur à la
        date de la commande. Pour les abonnements en cours, toute modification substantielle est
        notifiée par e-mail au moins 30 jours avant son entrée en vigueur ; le Client qui la
        refuse peut résilier avant cette date.
      </p>

      <h3>Article 16 – Langue, droit applicable et litiges</h3>
      <p>
        16.1 Les CGV sont rédigées en français. En cas de traduction, la version française fait
        foi.
        <br />
        16.2 Les CGV et les contrats conclus avec le Client sont soumis au droit bulgare.
        <br />
        16.3 En cas de différend, les parties recherchent d'abord une solution amiable, sur
        demande écrite adressée à {LEGAL.email}. À défaut d'accord dans un délai de 30 jours, le
        litige est porté devant les tribunaux compétents de Sofia, Bulgarie.
      </p>

      <p>Dernière mise à jour : 23 octobre 2026</p>
    </LegalPage>
  );
}
