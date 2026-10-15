-- Newsletter multilingue (2026-10-15) : langue de chaque abonné (fr par défaut).
-- Ajout seul : compatible avec le Nest déjà déployé.
ALTER TABLE newsletter_abonnes ADD COLUMN IF NOT EXISTS langue text NOT NULL DEFAULT 'fr';
