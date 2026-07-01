-- Slides structurées du carrousel (pour re-render/retouche sans re-générer le texte).
ALTER TABLE contenu ADD COLUMN IF NOT EXISTS carrousel_data jsonb;
