-- Journal d'événements du cycle de vie d'un contenu (mémoire d'évaluation) : une
-- ligne à chaque étape (généré, modifié, validé, refusé, publié). Permet de
-- reconstituer a posteriori des mesures que les colonnes seules ne capturent pas
-- (délai génération -> validation, nombre de modifications avant validation...).
CREATE TABLE IF NOT EXISTS contenu_evenement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contenu_id uuid NOT NULL REFERENCES contenu(id) ON DELETE CASCADE,
  type text NOT NULL,               -- 'genere' | 'modifie' | 'valide' | 'refuse' | 'publie'
  acteur uuid REFERENCES users(telegram_id),  -- NULL pour les événements système (webhook)
  texte text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contenu_evenement_contenu ON contenu_evenement(contenu_id);
