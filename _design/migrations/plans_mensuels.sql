-- Rico Coach, brique 3 : le plan d'action mensuel de chaque client.
-- Une ligne par (client, mois du plan). Le plan d'octobre est tiré du diagnostic de septembre.
-- `recommandations` : 3 à 4 actions décidées par des règles sur le diagnostic (le code choisit
-- QUOI recommander et les chiffres) ; l'IA ne fait que formuler chaque action dans la voix de
-- la marque et proposer des sujets à produire. Chaque nombre d'une phrase IA est vérifié
-- contre le diagnostic ; sinon la phrase standard est gardée.
--
-- Table neuve : aucune donnée existante n'est modifiée. RLS activée sans politique.
-- Appliquée sur Supabase le 2026-10-08.

CREATE TABLE IF NOT EXISTS plans_mensuels (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id      uuid NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  mois             date NOT NULL,                       -- mois du plan (1er du mois)
  diagnostic_mois  date NOT NULL,                       -- mois analysé qui l'a produit
  intro            text,                                -- mot d'accueil de Rico
  recommandations  jsonb NOT NULL DEFAULT '[]'::jsonb,
  version          integer NOT NULL DEFAULT 1,          -- version des règles
  modele           text,                                -- modèle IA de formulation (null = phrases standard)
  calcule_le       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plans_mensuels_mois_premier_jour CHECK (extract(day FROM mois) = 1),
  CONSTRAINT plans_mensuels_unique UNIQUE (telegram_id, mois)
);

ALTER TABLE plans_mensuels ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE plans_mensuels IS 'Rico Coach : plan d''action mensuel (règles sur le diagnostic, formulation IA vérifiée).';
