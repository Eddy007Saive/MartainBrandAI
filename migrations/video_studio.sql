-- Studio Vidéo / Reels (Submagic) — colonnes vidéo sur contenu + quota 'video'
-- Additif : aucune modification des colonnes existantes.

alter table contenu add column if not exists submagic_project_id text;
alter table contenu add column if not exists video_status       text;  -- en_traitement | pret | echec
alter table contenu add column if not exists video_url          text;  -- MP4 final monté (Cloudinary)
alter table contenu add column if not exists video_preview_url  text;  -- previewUrl Submagic (viewer)

-- Quota 'video' : réservé au Pro, conservateur (cap Submagic 100 min/mois pour tout le compte).
-- Ajustable ensuite dans l'admin (Offres & quotas).
insert into plan_quotas (plan_id, action_type, included_quantity, internal_unit_cost_cents, rollover)
select id, 'video', 8, 0, false from plans where name = 'Pro'
on conflict (plan_id, action_type) do update set included_quantity = excluded.included_quantity;

-- Essai : verrouillé (0 -> affiché "réservé au Pro")
insert into plan_quotas (plan_id, action_type, included_quantity, internal_unit_cost_cents, rollover)
select id, 'video', 0, 0, false from plans where name = 'Essai'
on conflict (plan_id, action_type) do nothing;
