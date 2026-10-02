-- 2026-10-02 : les posts/stories rédigés dans le Studio IA sont enregistrés tout de suite
-- dans contenu au statut « Brouillon » (promus en « A valider » à la validation).
ALTER TYPE statut_contenu ADD VALUE IF NOT EXISTS 'Brouillon';
