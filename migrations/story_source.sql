-- Post source d'une story (simple/série/animée) — bloque un second déclin tant
-- que cette story existe encore. NULL pour tout contenu qui n'est pas une story.
-- Pas de FK : le post source peut être supprimé sans casser la story.
ALTER TABLE contenu ADD COLUMN IF NOT EXISTS story_source_id uuid;
CREATE INDEX IF NOT EXISTS idx_contenu_story_source_id ON contenu(story_source_id) WHERE story_source_id IS NOT NULL;
