-- File de rendu Remotion en arrière-plan (stories animées ; reels ensuite).
-- Une ligne contenu EST le job (même choix que Submagic avec video_status) :
--   render_job        : {composition, props, prefix, tentatives, erreur} — NULL hors file.
--   render_started_at : posé au claim par le worker ; remis à NULL si périmé (> 15 min),
--                       pour reprendre un rendu interrompu par un redémarrage Railway.
ALTER TABLE contenu ADD COLUMN IF NOT EXISTS render_job jsonb;
ALTER TABLE contenu ADD COLUMN IF NOT EXISTS render_started_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_contenu_render_queue ON contenu(created_at)
  WHERE video_status = 'en_traitement' AND render_job IS NOT NULL;
