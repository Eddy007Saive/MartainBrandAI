-- Regroupement visuel de la story en série (2-4 contenus liés). NULL pour tout
-- contenu hors-série. Réutilise l'id du post source comme serie_id (pas de FK :
-- le post source peut être supprimé sans casser la série).
ALTER TABLE contenu ADD COLUMN IF NOT EXISTS serie_id uuid;
CREATE INDEX IF NOT EXISTS idx_contenu_serie_id ON contenu(serie_id) WHERE serie_id IS NOT NULL;
