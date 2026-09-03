-- Cache de la recommandation IA de template reel, par contenu : {template, raison, h}
-- (h = sha1 du texte du post ; recalculé seulement si le texte change).
-- Évite un appel Claude à chaque ouverture du dialog reel.
ALTER TABLE contenu ADD COLUMN IF NOT EXISTS reel_reco jsonb;
