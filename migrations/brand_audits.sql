-- Audit de marque / onboarding public (lead anonyme)
-- Table additive : aucune modification des tables existantes.
create table if not exists brand_audits (
  id          uuid primary key default gen_random_uuid(),
  marque      text,
  email       text,
  answers     jsonb not null default '{}'::jsonb,  -- réponses structurées {field_id: valeur}
  recap       text,                                -- récapitulatif texte lisible
  status      text default 'nouveau',              -- nouveau | en_cours | traite
  user_agent  text,
  created_at  timestamptz default now()
);

create index if not exists brand_audits_created_idx on brand_audits (created_at desc);
create index if not exists brand_audits_status_idx  on brand_audits (status);
