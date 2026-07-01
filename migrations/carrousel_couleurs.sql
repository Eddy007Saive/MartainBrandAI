-- Couleurs propres au carrousel (override des couleurs de marque). NULL = utiliser les couleurs de marque.
ALTER TABLE users ADD COLUMN IF NOT EXISTS carrousel_couleur_principale text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS carrousel_couleur_secondaire text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS carrousel_couleur_accent text;
