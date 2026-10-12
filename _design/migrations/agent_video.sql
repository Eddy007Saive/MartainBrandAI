-- Montage par l'agent IA (Claude Code sur le VPS) : file des travaux + quota dédié.
-- Le client donne ses rushes, Postorico crée un contenu « en_traitement » et un travail
-- `en_attente` ; le worker du VPS vient le chercher (connexion sortante, jeton partagé), lance
-- l'agent, envoie le MP4 sur Cloudinary et rend compte (terminer / echec).
--
-- Ajouts uniquement : aucune ligne existante n'est modifiée. RLS activée sans politique.
-- Appliquée sur Supabase le 2026-10-11.

CREATE TABLE IF NOT EXISTS travaux_agent_video (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contenu_id   uuid NOT NULL REFERENCES contenu(id) ON DELETE CASCADE,
  telegram_id  uuid NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  statut       text NOT NULL DEFAULT 'en_attente'
               CHECK (statut IN ('en_attente', 'en_cours', 'termine', 'echec')),
  brief        jsonb NOT NULL DEFAULT '{}'::jsonb,   -- consignes, rushes, charte, format…
  tentatives   integer NOT NULL DEFAULT 0,
  pris_le      timestamptz,                         -- réservé par un worker
  vu_le        timestamptz,                         -- dernier battement du worker
  progression  text,
  erreur       text,
  cout_usd     numeric(8,4),                        -- coût API déclaré par Claude Code
  duree_s      numeric(8,2),                        -- durée de la vidéo finale
  created_at   timestamptz NOT NULL DEFAULT now(),
  fini_le      timestamptz
);

CREATE INDEX IF NOT EXISTS travaux_agent_video_file ON travaux_agent_video (statut, created_at);
CREATE INDEX IF NOT EXISTS travaux_agent_video_contenu ON travaux_agent_video (contenu_id);

ALTER TABLE travaux_agent_video ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE travaux_agent_video IS 'Montages confiés à l''agent IA du VPS (Claude Code) : file, suivi, coût.';

-- Quota mensuel « montage par l'agent IA » : Essai 0, Pro 4, Boss illimité.
INSERT INTO plan_quotas (plan_id, action_type, included_quantity, internal_unit_cost_cents, rollover)
SELECT p.id, 'video_agent', q.inc, 0, false
FROM plans p
JOIN (VALUES ('Essai', 0), ('Pro', 4), ('Boss', 1000000)) AS q(nom, inc) ON q.nom = p.name
WHERE NOT EXISTS (SELECT 1 FROM plan_quotas x WHERE x.plan_id = p.id AND x.action_type = 'video_agent');
