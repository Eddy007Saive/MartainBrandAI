-- Taux de réécriture du client entre le texte généré par l'IA (contenu_original)
-- et le texte final au moment de la validation (mémoire d'évaluation, H2).
-- 0 = validé tel quel, proche de 1 = quasi totalement réécrit.
-- Calculé une seule fois, à l'instant où le statut passe à "Valider"
-- (update_contenu() dans contenu_service.py) ; NULL si contenu_original est
-- lui-même NULL (contenu créé avant la migration contenu_original, ou format
-- hors périmètre : vidéo, reel, story) ou si le contenu n'a jamais été validé.
ALTER TABLE contenu ADD COLUMN IF NOT EXISTS taux_reecriture numeric;
