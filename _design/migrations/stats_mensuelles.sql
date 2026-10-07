-- Rico Coach, brique 1 : historique mensuel des statistiques de chaque client.
-- Jusqu'ici, analytics_cache ne garde qu'une ligne par compte, réécrite à chaque
-- rafraîchissement : aucune comparaison d'un mois sur l'autre n'était possible.
--
-- Une ligne par (client, mois, réseau, format). Les totaux sont agrégés par Postorico à
-- partir des posts renvoyés par Zernio (/v1/analytics), au mois de leur publication.
--   reseau  : instagram, facebook, linkedin, tiktok, youtube, googlebusiness, twitter… ou 'tous'
--   format  : reel, carrousel, image, video, story, texte… ou 'tous' (toutes publications du réseau)
-- La ligne format = 'tous' porte aussi les abonnés (fin de mois) et les abonnés gagnés.
-- `details` garde ce qui est propre à un réseau : pour la fiche Google, appels, itinéraires,
-- clics vers le site, vues Maps / Recherche et mots-clés (Google ne donne plus de stats par post).
--
-- RLS activée sans politique : seul le backend (rôle postgres via Prisma) y accède ; la clé
-- publique de Supabase n'y lit rien.
-- Appliquée sur Supabase le 2026-10-07.

CREATE TABLE IF NOT EXISTS stats_mensuelles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id      uuid NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  mois             date NOT NULL,                 -- premier jour du mois
  reseau           text NOT NULL,
  format           text NOT NULL DEFAULT 'tous',
  posts            integer NOT NULL DEFAULT 0,
  impressions      integer NOT NULL DEFAULT 0,
  portee           integer NOT NULL DEFAULT 0,
  vues             integer NOT NULL DEFAULT 0,
  likes            integer NOT NULL DEFAULT 0,
  commentaires     integer NOT NULL DEFAULT 0,
  partages         integer NOT NULL DEFAULT 0,
  enregistrements  integer NOT NULL DEFAULT 0,
  clics            integer NOT NULL DEFAULT 0,
  taux_engagement  numeric(6,2),                  -- interactions / impressions, en %
  abonnes          integer,                       -- fin de mois (ligne format = 'tous')
  abonnes_gagnes   integer,
  details          jsonb NOT NULL DEFAULT '{}'::jsonb,
  source           text NOT NULL DEFAULT 'zernio',
  calcule_le       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stats_mensuelles_mois_premier_jour CHECK (extract(day FROM mois) = 1),
  CONSTRAINT stats_mensuelles_unique UNIQUE (telegram_id, mois, reseau, format)
);

CREATE INDEX IF NOT EXISTS stats_mensuelles_compte_mois ON stats_mensuelles (telegram_id, mois DESC);

ALTER TABLE stats_mensuelles ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE stats_mensuelles IS 'Rico Coach : statistiques agrégées par client, mois, réseau et format (historique conservé).';
COMMENT ON COLUMN stats_mensuelles.details IS 'Métriques propres au réseau (fiche Google : appels, itinéraires, clics site, vues, mots-clés).';
