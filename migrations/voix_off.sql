-- =====================================================================
-- VOIX OFF des reels (ElevenLabs) : voix du catalogue ou clone de la voix du client.
--
-- Les phrases parlées et les MP3 générés vivent dans contenu.reel_data /
-- contenu.render_job (jsonb, déjà là). Ici : le clone du client sur sa fiche marque
-- et le type d'action « voix » dans les quotas (1 par reel avec voix).
-- Les lignes plan_quotas ont été insérées le 2026-09-04 (Pro 8, Essai 0, Boss illimité).
-- =====================================================================

ALTER TABLE marques
    ADD COLUMN IF NOT EXISTS voix_clone_id        text,          -- voice_id ElevenLabs du clone
    ADD COLUMN IF NOT EXISTS voix_clone_le        timestamptz,   -- date de création du clone
    ADD COLUMN IF NOT EXISTS voix_consentement_le timestamptz,   -- consentement explicite, horodaté
    ADD COLUMN IF NOT EXISTS voix_clone_apercu    text,          -- MP3 d'extrait (Cloudinary)
    ADD COLUMN IF NOT EXISTS voix_clone_duree_s   integer,       -- durée de l'audio fourni
    ADD COLUMN IF NOT EXISTS voix_defaut          text;          -- voix retenue par défaut (victor|yann|adina|moi)

-- Quotas (idempotent : déjà posés via l'API, gardé pour une base neuve)
INSERT INTO plan_quotas (plan_id, action_type, included_quantity, internal_unit_cost_cents)
SELECT p.id, 'voix', CASE p.name WHEN 'Pro' THEN 8 WHEN 'Boss' THEN 1000000 ELSE 0 END, 3
FROM plans p
WHERE NOT EXISTS (SELECT 1 FROM plan_quotas q WHERE q.plan_id = p.id AND q.action_type = 'voix');
