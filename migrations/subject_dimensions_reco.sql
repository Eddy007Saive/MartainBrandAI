-- Reco d'origine de l'IA pour un sujet (fige l'étoile ⭐ dans la fiche).
-- `dimensions` = valeur EFFECTIVE (modifiable par l'utilisateur, persistée via PATCH /agent/sujets/{id}).
-- `dimensions_reco` = ce que l'IA avait recommandé (jamais modifié après création).
-- Appliqué manuellement (pas de migration runner).

ALTER TABLE brouillons ADD COLUMN IF NOT EXISTS dimensions_reco jsonb;

-- Backfill : pour l'existant, la reco = la valeur actuelle.
UPDATE brouillons SET dimensions_reco = dimensions
WHERE dimensions_reco IS NULL AND dimensions IS NOT NULL;
