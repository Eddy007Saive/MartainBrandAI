-- Exemples de posts pour la fiche Google et Twitter/X.  (applique le 21/08/2026)
--
-- Ces exemples calibrent le style de generation (few-shot) : agent_service lit
-- exemples_<reseau> dynamiquement, il n'y a donc rien a changer cote generation.
-- Seules les colonnes manquaient.
--
-- Uniquement sur `marques` : contrairement a ce que laisse entendre le commentaire
-- de marque_service.py, `users` ne porte plus aucune colonne exemples_* — le
-- miroir a ete supprime lors de la normalisation.
ALTER TABLE public.marques
  ADD COLUMN IF NOT EXISTS exemples_googlebusiness text,
  ADD COLUMN IF NOT EXISTS exemples_twitter text;
