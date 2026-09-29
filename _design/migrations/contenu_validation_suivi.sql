-- Traçabilité de la validation (mémoire d'évaluation, H2) : note de ressemblance
-- directe donnée par le client à la validation, motif quand il refuse, et qui/quand
-- a validé. Réutilise contenu_original (déjà là) plutôt qu'un doublon
-- texte_ia_initial — voir _design/correction-hypotheses-evaluation.html.
ALTER TABLE contenu ADD COLUMN IF NOT EXISTS note_ressemblance smallint
  CHECK (note_ressemblance BETWEEN 1 AND 5);
ALTER TABLE contenu ADD COLUMN IF NOT EXISTS motif_refus text;
ALTER TABLE contenu ADD COLUMN IF NOT EXISTS valide_at timestamptz;
ALTER TABLE contenu ADD COLUMN IF NOT EXISTS valide_par uuid
  REFERENCES users(telegram_id);
