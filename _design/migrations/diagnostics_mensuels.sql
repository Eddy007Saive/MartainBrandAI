-- Rico Coach, brique 2 : le diagnostic mensuel de chaque client.
-- Une ligne par (client, mois analysé). `constats` est calculé par le code (aucune IA) à
-- partir de stats_mensuelles et analytics_performance : évolution vs mois précédent,
-- format qui marche le mieux, volume et régularité, meilleurs créneaux, meilleurs posts,
-- fiche Google. Un constat sans assez de données est absent plutôt qu'approximatif.
-- Le plan d'action (brique 3) et Rico s'appuient sur ce diagnostic figé.
--
-- Table neuve : aucune donnée existante n'est modifiée. RLS activée sans politique (seul le
-- backend y accède).
-- Appliquée sur Supabase le 2026-10-08.

CREATE TABLE IF NOT EXISTS diagnostics_mensuels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id uuid NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  mois        date NOT NULL,                         -- mois analysé (1er du mois)
  constats    jsonb NOT NULL DEFAULT '{}'::jsonb,
  version     integer NOT NULL DEFAULT 1,            -- version des règles de calcul
  calcule_le  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT diagnostics_mensuels_mois_premier_jour CHECK (extract(day FROM mois) = 1),
  CONSTRAINT diagnostics_mensuels_unique UNIQUE (telegram_id, mois)
);

ALTER TABLE diagnostics_mensuels ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE diagnostics_mensuels IS 'Rico Coach : diagnostic mensuel calculé (constats chiffrés), base du plan d''action.';
