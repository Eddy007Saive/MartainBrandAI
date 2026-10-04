-- Modèles de carrousel créés par les clients dans l'éditeur (« Enregistrer comme modèle »).
-- Même table que les templates importés par l'admin : owner_id NULL = template admin,
-- owner_id renseigné = modèle réservé à ce client. `design` garde les trois pages d'origine.
alter table public.carrousel_templates_custom
  add column if not exists owner_id text,
  add column if not exists design jsonb;
create index if not exists carrousel_templates_custom_owner_idx
  on public.carrousel_templates_custom (owner_id);
