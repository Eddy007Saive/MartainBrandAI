-- Rico Coach, brique 1 : analytics_performance redevient la table des stats PAR POST.
-- Elle n'était plus alimentée depuis l'époque n8n (1 seule ligne, du 2026-03-16) et aucune
-- page ne lisait /analytics/performance. Le module de collecte la remplit désormais à partir
-- de Zernio (/v1/analytics) : une ligne par post et par réseau. Les totaux du mois sont dans
-- stats_mensuelles.
--
-- Changements :
--   - taux_engagement et performance_score étaient des colonnes GÉNÉRÉES à partir de `vues`,
--     faux pour LinkedIn / Facebook (vues = 0, la base est les impressions). taux_engagement
--     devient une colonne simple calculée par le code ; performance_score est supprimé.
--   - date_publication (texte) et semaine (texte) remplacés par publie_le (timestamptz).
--   - nouvelles colonnes : identifiants Zernio, réseau, format, impressions, portée,
--     enregistrements, clics, url, externe (post publié hors Postorico), details (durée de
--     visionnage, taux de complétion… selon le réseau), maj_zernio.
--   - clé unique (late_post_id, reseau) pour ré-écrire la même ligne à chaque collecte.
--   - RLS activée (elle ne l'était pas).
-- En DEUX étapes, pour ne pas casser la prod : le Prisma Client en service lit encore les
-- anciennes colonnes. Étape 1 (ajouts seulement) appliquée sur Supabase le 2026-10-07.
-- Étape 2 (suppressions) à appliquer UNE FOIS le Nest redéployé avec le nouveau schéma.

-- ── Étape 1 ──────────────────────────────────────────────────────────────────────────

DELETE FROM analytics_performance;  -- la ligne de mars 2026, héritée de n8n

ALTER TABLE analytics_performance
  ADD COLUMN late_post_id       text,
  ADD COLUMN plateforme_post_id text,
  ADD COLUMN compte_id          text,                -- id du compte Zernio
  ADD COLUMN reseau             text,
  ADD COLUMN format             text,                -- reel, carrousel, image, video, story, texte
  ADD COLUMN publie_le          timestamptz,
  ADD COLUMN impressions        integer NOT NULL DEFAULT 0,
  ADD COLUMN portee             integer NOT NULL DEFAULT 0,
  ADD COLUMN enregistrements    integer NOT NULL DEFAULT 0,
  ADD COLUMN clics              integer NOT NULL DEFAULT 0,
  ADD COLUMN url                text,
  ADD COLUMN externe            boolean NOT NULL DEFAULT false,
  ADD COLUMN details            jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN maj_zernio         timestamptz;

ALTER TABLE analytics_performance
  ADD CONSTRAINT analytics_performance_post_reseau UNIQUE (late_post_id, reseau);

CREATE INDEX IF NOT EXISTS analytics_performance_compte_date
  ON analytics_performance (telegram_id, publie_le DESC);

-- RLS était désactivée : la clé publique Supabase pouvait lire la table. Seul le backend y accède.
ALTER TABLE analytics_performance ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE analytics_performance IS 'Rico Coach : stats par post et par réseau, collectées depuis Zernio (totaux du mois dans stats_mensuelles).';

-- ── Étape 2 (après déploiement de Nest) ──────────────────────────────────────────────
-- ALTER TABLE analytics_performance
--   DROP COLUMN performance_score,
--   DROP COLUMN date_publication,
--   DROP COLUMN semaine,
--   DROP COLUMN taux_engagement,
--   ADD COLUMN taux_engagement numeric(6,2);   -- interactions / impressions (ou vues), en %
