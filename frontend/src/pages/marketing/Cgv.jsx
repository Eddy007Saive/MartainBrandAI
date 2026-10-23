import { Link } from 'react-router-dom';
import { LegalPage, LEGAL } from './shared';

export default function Cgv() {
  return (
    <LegalPage title="Conditions Générales de Vente">
      <h3>Article 1 – Vendeur</h3>
      <p>
        Les présentes conditions générales de vente (« CGV ») sont proposées par{' '}
        {LEGAL.societe}, société unipersonnelle à responsabilité limitée de droit bulgare au
        capital de 1,02 € (2 BGN), dont le siège est situé 78 boulevard Vitosha, 1463 Sofia,
        Bulgarie, immatriculée au Registre du commerce de Bulgarie sous le numéro UIC/EIK
        207893855, TVA intracommunautaire BG207893855, représentée par {LEGAL.directeur}, gérant
        (« Kraemer Ventures » ou « le Prestataire »).
        <br />
        Contact : <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
      </p>

      <h3>Article 2 – Objet et champ d'application</h3>
      <p>
        Les CGV régissent la vente des offres Postorico (abonnement, Pack Fondations, offre
        Multicompte) par {LEGAL.societe} à ses clients. L'utilisation de la plateforme est
        également soumise aux <Link to="/cgu">Conditions générales d'utilisation</Link> (« CGU »),
        disponibles sur postorico.com/cgu. En cas de contradiction, les CGV prévalent pour tout
        ce qui concerne la commande, le prix, le paiement et la résiliation.
      </p>
      <p>
        Toute commande implique l'acceptation sans réserve des CGV en vigueur au jour de la
        commande, qui prévalent sur tout autre document du Client, notamment ses conditions
        générales d'achat.
      </p>

      <h3>Article 3 – Clientèle professionnelle</h3>
      <p>
        Les offres Postorico sont réservées aux professionnels (sociétés, entrepreneurs
        individuels, indépendants, associations) agissant pour les besoins de leur activité. En
        passant commande, le Client déclare agir en qualité de professionnel. Les dispositions du
        droit de la consommation, dont le droit de rétractation, ne s'appliquent pas.
      </p>

      <h3>Article 4 – Offres</h3>
      <p>
        4.1 <b>Abonnement Postorico</b> : accès à la plateforme comprenant la génération de
        posts, carrousels et visuels à la voix de l'entreprise du Client, la publication sur
        LinkedIn, Instagram, Facebook, TikTok, YouTube et X, le pilotage de la fiche Google
        Business Profile, le calendrier éditorial et la programmation. Aucun contenu n'est
        publié sans la validation du Client.
        <br />
        4.2 <b>Pack Fondations</b> (optionnel, en complément de l'abonnement) : audit de marque,
        définition du ton de voix et de la ligne éditoriale, hooks et CTA sur mesure, direction
        artistique, 9 templates de feed Instagram et 2 carrousels personnalisés.
        <br />
        4.3 <b>Offre Multicompte</b> : pour plusieurs marques ou établissements, sur devis. Le
        devis signé précise les comptes concernés, le prix et les prestations, et prévaut sur les
        présentes CGV en cas de contradiction.
      </p>
      <p>Le détail à jour des offres figure sur postorico.com/tarifs.</p>

      <h3>Article 5 – Prix</h3>
      <p>
        5.1 Les prix sont indiqués en euros hors taxes (HT) : abonnement 279 € HT par mois ; Pack
        Fondations 1 499 € HT, payable une seule fois ; Multicompte sur devis.
        <br />
        5.2 TVA : pour un Client établi dans un autre État membre de l'Union européenne et
        disposant d'un numéro de TVA intracommunautaire valide, la facture est émise hors TVA, la
        taxe étant due par le Client selon le mécanisme d'autoliquidation (article 196 de la
        directive 2006/112/CE). Le Client communique ce numéro lors de la commande. À défaut, la
        TVA bulgare au taux en vigueur est ajoutée au prix HT.
        <br />
        5.3 {LEGAL.societe} peut modifier ses prix. Toute hausse du prix de l'abonnement est
        notifiée au Client par e-mail au moins 30 jours avant son application et ne s'applique
        qu'à la période de facturation suivant ce délai. Le Client qui la refuse peut résilier
        avant son entrée en vigueur.
      </p>

      <h3>Article 6 – Commande et essai gratuit</h3>
      <p>
        6.1 L'abonnement est souscrit en ligne depuis postorico.com. Le Client crée son compte,
        enregistre un moyen de paiement et accepte les CGV et les CGU.
        <br />
        6.2 Tout nouvel abonnement débute par un essai gratuit de 14 jours, limité à un essai par
        entreprise. Le moyen de paiement est enregistré dès l'inscription, mais aucune somme
        n'est prélevée pendant l'essai.
        <br />
        6.3 Sauf résiliation par le Client avant la fin de l'essai, l'abonnement payant démarre
        automatiquement le 15e jour et le premier mois est prélevé à cette date.
        <br />
        6.4 Le Pack Fondations est commandé en ligne ou sur demande à {LEGAL.email}. La commande
        est ferme dès réception du paiement.
      </p>

      <h3>Article 7 – Paiement et facturation</h3>
      <p>
        7.1 Les paiements sont effectués par carte bancaire via le prestataire sécurisé Stripe.
        {' '}{LEGAL.societe} n'a jamais accès aux données complètes de la carte du Client.
        <br />
        7.2 L'abonnement est payable mensuellement et d'avance, par prélèvement automatique à
        chaque date anniversaire.
        <br />
        7.3 Le Pack Fondations est payable à 100 % à la commande.
        <br />
        7.4 Une facture électronique est émise pour chaque paiement et mise à disposition du
        Client.
        <br />
        7.5 En cas d'échec de paiement, {LEGAL.societe} en informe le Client par e-mail et peut
        renouveler la tentative. Si le paiement n'est pas régularisé dans les 7 jours suivant
        cette notification, l'accès au service peut être suspendu jusqu'au paiement complet, sans
        que cette suspension ne mette fin aux sommes dues.
        <br />
        7.6 Toute somme impayée à son échéance porte de plein droit intérêt de retard au taux de
        la Banque centrale européenne majoré de 8 points, ainsi qu'une indemnité forfaitaire pour
        frais de recouvrement de 40 €, conformément à la directive 2011/7/UE.
      </p>

      <h3>Article 8 – Durée, renouvellement et résiliation de l'abonnement</h3>
      <p>
        8.1 L'abonnement est sans engagement de durée. Il est conclu pour une période d'un mois,
        renouvelée automatiquement chaque mois jusqu'à résiliation.
        <br />
        8.2 Le Client peut résilier à tout moment depuis les paramètres de son compte ou par
        e-mail à {LEGAL.email}. La résiliation prend effet à la fin de la période mensuelle en
        cours, déjà payée. Le Client conserve l'accès au service jusqu'à cette date.
        <br />
        8.3 Toute période commencée est due. Aucun remboursement au prorata n'est effectué pour
        un mois entamé.
        <br />
        8.4 {LEGAL.societe} peut résilier l'abonnement de plein droit, après mise en demeure
        restée sans effet pendant 15 jours, en cas de manquement grave du Client aux CGV ou aux
        CGU, notamment en cas d'impayé ou d'usage illicite du service. En cas d'usage
        manifestement illicite, la suspension peut être immédiate.
        <br />
        8.5 Après la fin de l'abonnement, le Client dispose de 30 jours pour récupérer ses
        contenus. Passé ce délai, ils peuvent être supprimés.
      </p>

      <h3>Article 9 – Pack Fondations : exécution et remboursement</h3>
      <p>
        9.1 Les travaux démarrent à réception du paiement et des informations demandées au Client
        (questionnaire d'onboarding, accès, éléments de marque). Les livrables sont remis dans un
        délai de 15 jours ouvrés à compter de la réception de l'ensemble de ces éléments.
        <br />
        9.2 Deux séries de retouches sont incluses. Toute retouche supplémentaire ou demande hors
        périmètre fait l'objet d'un devis.
        <br />
        9.3 Le Pack Fondations peut être annulé et remboursé intégralement tant que les travaux
        n'ont pas commencé. Une fois les travaux lancés, aucun remboursement n'est dû, y compris
        si le Client résilie ensuite son abonnement.
        <br />
        9.4 Les livrables du Pack Fondations restent acquis au Client après la fin de son
        abonnement.
      </p>

      <h3>Article 10 – Obligations du Client</h3>
      <p>
        Le Client s'engage à fournir des informations exactes et à jour, à relire et valider les
        contenus avant leur publication, à disposer des droits sur les éléments qu'il transmet
        (logos, photos, textes) et à respecter les règles des réseaux sociaux et de Google sur
        lesquels il publie. Le Client reste seul responsable des contenus qu'il valide et publie.
      </p>

      <h3>Article 11 – Obligations et responsabilité de {LEGAL.societe}</h3>
      <p>
        11.1 {LEGAL.societe} est tenue d'une obligation de moyens. Elle met en œuvre les moyens
        raisonnables pour assurer l'accès et le bon fonctionnement du service, sans garantir une
        disponibilité ininterrompue.
        <br />
        11.2 Les contenus sont générés avec l'aide de l'intelligence artificielle à partir des
        consignes et informations du Client. {LEGAL.societe} ne garantit pas de résultat en
        termes d'audience, d'abonnés, d'avis, de chiffre d'affaires ou de référencement.
        <br />
        11.3 {LEGAL.societe} n'est pas responsable des changements, restrictions, suspensions ou
        pannes imposés par les plateformes tierces (Meta, TikTok, LinkedIn, YouTube, X, Google),
        ni de leurs conséquences sur la publication des contenus.
        <br />
        11.4 La responsabilité de {LEGAL.societe} est limitée aux dommages directs et prouvés.
        Elle ne couvre pas les dommages indirects (perte de chiffre d'affaires, de clientèle,
        d'image ou de données). En tout état de cause, elle est plafonnée au montant total payé
        par le Client au cours des 12 mois précédant le fait générateur.
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
