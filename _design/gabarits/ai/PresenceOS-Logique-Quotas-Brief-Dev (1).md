                                             # PresenceOS — Logique de comptage & quotas
### Brief technique pour le développeur

---

## 0. Le principe directeur (à lire en premier)

On vend **un résultat**, pas une monnaie. Donc :

- En interne, on **mètre la consommation par type d'action** (sujets, posts, images, carrousels). C'est la source de vérité pour les quotas.
- Côté client, on **n'affiche jamais des "crédits" ni des euros**. On affiche une **jauge de résultats** : « 12 posts utilisés sur 50 ce mois-ci ».
- Le quota inclus est **large** (le client ne doit normalement jamais le toucher). Quand il approche du plafond **sur un type**, on lui propose un **pack de rachat de ce type**.
- **Tout est paramétrable** depuis l'admin (prix, quotas, coûts, packs). Aucune valeur en dur dans le code. Objectif : ajouter l'offre vidéo plus tard = ajouter des lignes de config, **zéro refonte**.

> Pourquoi pas un compteur de crédits brut style « il te reste 1 247 crédits » ? Parce que ça pousse le client à rationner et à stresser. Une jauge de résultats, même donnée, donne l'effet inverse : il voit qu'il est large et il utilise l'outil sans frein. La rétention dépend d'un usage fluide.

---

## 1. L'offre à implémenter maintenant

Une **offre unique** (le moteur doit quand même être multi-offres dès le départ — voir §7) :

| Champ | Valeur |
|---|---|
| Nom | Pro |
| Prix | **259 € / mois** |
| Période | mensuelle (reset des compteurs à chaque renouvellement) |
| Réseaux | LinkedIn, Instagram, Facebook, TikTok, YouTube |

**Quotas inclus / mois :**

| Type d'action (interne) | Affiché au client | Quota inclus | Coût interne unitaire (réf. marge, jamais affiché) |
|---|---|---|---|
| `subject` | Sujets | 100 | 0,01 € |
| `post` | Posts | 50 | 0,07 € |
| `image_standard` | Image standard | 50 | 0,04 € |
| `image_pro` | Image HD | 20 | 0,13 € |
| `carousel` | Carrousels | 10 | 0,50 € |

> **Deux moteurs d'image = deux compteurs.** nano banana normal (`image_standard`, 0,04 €) et nano banana pro (`image_pro`, 0,13 €) ont des coûts très différents : ils ne doivent **jamais** partager le même quota, sinon la marge n'est plus maîtrisée. Côté client on n'affiche pas les noms de moteurs mais la **qualité perçue** : « Image standard » / « Image HD ».

Coût interne max si un client consomme **tout** : **≈ 14,10 € / mois** (1,00 sujets + 3,50 posts + 2,00 images standard + 2,60 images HD + 5,00 carrousels) → marge ≈ 94,5 % à 259 €. On peut donc être généreux sans risque ; les seuls postes qui pèsent, c'est l'**image HD** et le **carrousel**.

---

## 2. Modèle de données (proposition)

Adapter aux conventions du projet, mais l'idée est là.

**`plans`** — les offres (paramétrables)
```
id, name, price_cents, billing_period ('monthly'),
is_active, created_at
```

**`plan_quotas`** — quotas inclus par type, par offre
```
id, plan_id (FK plans),
action_type ('subject' | 'post' | 'image_standard' | 'image_pro' | 'carousel' | ... 'video' plus tard),
included_quantity (int),
internal_unit_cost_cents (int),   -- pour le suivi de marge
rollover (bool, défaut false)     -- le surplus se reporte-t-il ?
```

**`subscriptions`** — l'abonnement actif d'un user
```
id, user_id, plan_id,
status ('active' | 'past_due' | 'canceled'),
current_period_start, current_period_end
```

**`usage_counters`** — compteur courant par user / période / type (la jauge)
```
id, subscription_id, action_type,
period_start, period_end,
used_quantity (int),            -- ce qui a été consommé
extra_quantity (int)            -- packs rachetés pour cette période
-- quota effectif = plan_quotas.included_quantity + extra_quantity
```

**`usage_events`** — journal append-only (audit + analytics + sécurité)
```
id, subscription_id, action_type,
quantity (int, défaut 1),
internal_cost_cents,
status ('success' | 'failed'),
created_at
```
> Ce journal sert à : tracer chaque génération, ne PAS débiter en cas d'échec, calculer ta marge réelle, repérer les power-users.

**`credit_packs`** (ou `addons`) — les packs de rachat (paramétrables)
```
id, action_type, quantity, price_cents, is_active
-- ex : +30 images = 12 €
```

> Remarque : on **mètre par type** plutôt que par une "monnaie crédit" unique, parce que ça mappe directement sur la jauge de résultats et sur les packs par type. Si tu tiens à afficher un seul chiffre côté client, on peut en dériver un, mais le stockage reste par type.

---

## 3. Logique de consommation (pseudo-code)

À exécuter **avant** chaque génération :

```
fonction consommer(user, action_type, quantity = 1):
    sub   = abonnement_actif(user)              # sinon -> bloquer
    quota = plan_quotas(sub.plan, action_type)
    ctr   = usage_counter(sub, action_type, période_courante)

    limite_effective = quota.included_quantity + ctr.extra_quantity
    restant          = limite_effective - ctr.used_quantity

    si restant < quantity:
        -> RETOURNER "quota_atteint" + proposer pack(action_type)   # voir §6
           (ne rien débiter, ne pas lancer la génération)

    # Réservation ATOMIQUE (voir cas limites §8)
    incrémenter ctr.used_quantity de quantity   # en transaction / lock de ligne

    résultat = lancer_génération(...)

    si résultat == échec:
        décrémenter ctr.used_quantity de quantity   # on rembourse
        log usage_events(status='failed')
        -> RETOURNER "echec_generation"

    log usage_events(status='success', internal_cost = quota.unit_cost * quantity)
    -> RETOURNER "ok"
```

**Reset de période :** au renouvellement de l'abonnement (`current_period_end` atteint), on crée une nouvelle ligne `usage_counters` avec `used_quantity = 0`. Les `extra_quantity` (packs rachetés) **ne se reportent pas** par défaut (`rollover = false`) — paramétrable.

---

## 4. Affichage côté client (la jauge)

Sur le dashboard, une jauge **par type, en résultats** :

```
Posts          ▓▓▓░░░░░░░   12 / 50
Image standard ▓▓▓▓▓░░░░░   24 / 50
Image HD       ▓▓▓▓░░░░░░    8 / 20
Carrousels     ▓▓░░░░░░░░    2 / 10
```

Règles d'affichage **strictes** :
- **Jamais** d'euros, **jamais** de "crédits", **jamais** le coût interne.
- Le bloc « racheter » n'apparaît **que** quand un type atteint ~80–100 % (pas avant — sinon ça stresse).
- Libellés en capacités : « il te reste 38 posts ce mois-ci », pas « 2 660 crédits ».

---

## 5. Rachat / dépassement (packs)

Quand un type est épuisé, on propose un **pack de ce type**, formulé en résultats (jamais au prix unitaire). On ne propose des packs **que sur les postes chers** : **Image HD** et **Carrousels**. Le reste (sujets, posts, image standard) est donné large, sans rachat — moins de compteurs, moins de friction.

Packs à paramétrer (marge ~70 %, ≈ 3–4× le coût) :

| Pack (affiché client) | `action_type` | Quantité | Prix | Coût interne | Marge |
|---|---|---|---|---|---|
| +25 images HD | `image_pro` | 25 | 9 € | 3,25 € | ~64 % |
| +50 images HD | `image_pro` | 50 | 15 € | 6,50 € | ~57 % |
| +5 carrousels | `carousel` | 5 | 7 € | 2,50 € | ~64 % |
| +10 carrousels | `carousel` | 10 | 12 € | 5,00 € | ~58 % |
| +50 images standard | `image_standard` | 50 | 6 € | 2,00 € | ~67 % |

Règles :
- Prix **ronds** (9, 12, 15, 19 €), jamais « 0,48 €/image » (effet taximètre → le client recalcule ta marge).
- Le pack ne doit jamais être un meilleur deal à l'unité que l'abonnement.
- Mécanique : à l'achat, on incrémente `usage_counters.extra_quantity` du type concerné pour la période courante. Valable jusqu'à la fin de la période (paramétrable, pas de report par défaut).
- Le bloc « racheter » n'apparaît **que** quand le type atteint ~80–100 %, avec un ton « coup de pouce » (« tu as fini tes images HD du mois — ajoute un pack pour continuer »), pas un ton paywall.

> **Signal à exploiter :** un client qui rachète des packs **tous les mois** n'est pas une bonne nouvelle de revenu, c'est un candidat à une **offre supérieure**. Le récurrent d'abonnement est plus prévisible et plus collant que le récurrent de packs. Sortir un palier au-dessus (et plus tard l'offre vidéo) quand plusieurs gros consommateurs apparaissent.

---

## 6. Tout doit être paramétrable (admin)

Aucune des valeurs ci-dessous ne doit être en dur :

- prix de l'offre,
- quota inclus **par type**,
- coût interne **par type** (pour la marge),
- taille et prix des **packs de rachat**,
- activation/désactivation du rachat,
- politique de report (`rollover`).

Idéalement : un écran admin qui édite `plans`, `plan_quotas` et `credit_packs`. Ajouter/modifier une offre = données, pas du code.

---

## 7. Prévu pour la suite : l'offre vidéo (objectif zéro refonte)

L'offre avatar vidéo arrivera plus tard, en **2ᵉ offre**, avec un coût unitaire **bien plus élevé** que le reste. Pour que ce soit trivial à brancher :

- `action_type` doit être une **liste extensible** (en base, pas un enum figé dans le code). Ajouter `'video'` ne doit demander aucune migration lourde.
- Le moteur de consommation (§3) est **générique sur le type** → il gérera la vidéo sans modification.
- Lancer l'offre vidéo = créer une ligne `plans` (ex. « Pro + Vidéo ») + ses `plan_quotas` (dont `action_type='video'` avec son quota serré et son coût) + un `credit_pack` vidéo. C'est tout.

Donc : construire le système **multi-offres et multi-types dès maintenant**, même si on ne lance qu'une seule offre / 4 types aujourd'hui.

---

## 8. Cas limites à gérer

- **Concurrence / race condition :** deux générations simultanées ne doivent pas dépasser le quota. Décrément **atomique** (transaction + `SELECT ... FOR UPDATE` ou `UPDATE ... WHERE used < limite`). Ne jamais lire-puis-écrire sans lock.
- **Échec de génération :** ne pas débiter (ou rembourser). Le client ne paie jamais pour un résultat qu'il n'a pas reçu.
- **Carrousel vs images :** définir clairement si un carrousel **inclut** ses visuels (alors on ne débite que le carrousel) ou si chaque image du carrousel débite aussi le compteur `image`. → Recommandé : le carrousel est **autonome** (un seul débit `carousel`), sinon le client est compté deux fois.
- **Fuseau horaire / reset :** le reset suit `current_period_end` de l'abonnement, pas le 1er du mois calendaire.
- **Changement d'offre en cours de période (plus tard) :** définir la proraisation et ce qu'on fait des compteurs.
- **Annulation / impayé :** `status` de l'abonnement → bloquer la consommation si `canceled`/`past_due`.

---

## 9. Récap en une phrase

Mètre **par type d'action** (dont **deux compteurs images** : standard 0,04 € / HD 0,13 €), afficher une **jauge de résultats** (jamais d'euros ni de crédits), quota inclus **large** calibré sur ~14 €/mois de coût, **rachat par packs** seulement sur les postes chers (image HD + carrousels) quand on approche du plafond, et **tout paramétrable** pour brancher l'offre vidéo plus tard sans toucher au code.
