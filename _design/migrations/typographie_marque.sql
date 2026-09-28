-- Typographie de MARQUE (titre / sous-titre / corps), réglable dans Paramètres. Sert de
-- défaut aux carrousels (sous carrousel_font/_corps, qui restent l'override propre au
-- carrousel) et est donnée à l'IA image en complément du gabarit de référence.
ALTER TABLE marques ADD COLUMN IF NOT EXISTS typo_primaire text;
ALTER TABLE marques ADD COLUMN IF NOT EXISTS typo_secondaire text;
ALTER TABLE marques ADD COLUMN IF NOT EXISTS typo_tertiaire text;
