-- Texte tel que généré par l'IA, jamais retouché ensuite : sert à calculer le
-- taux de modification du client avant validation (mémoire d'évaluation, H2).
-- Rempli une seule fois à la génération (post, carrousel) ou à une
-- régénération complète ; update_contenu() ne le touche jamais, puisqu'il
-- n'est pas dans ContenuUpdate. NULL pour tout contenu créé avant cette
-- migration, et pour les formats hors périmètre (vidéo, reel, story).
ALTER TABLE contenu ADD COLUMN IF NOT EXISTS contenu_original text;
