-- Police d'affichage propre au carrousel (override). NULL/vide = police signature du template.
ALTER TABLE users ADD COLUMN IF NOT EXISTS carrousel_font text;
