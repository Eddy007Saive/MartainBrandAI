-- Fiche Google : options d'un post (2026-10-13). Ajout seul, aucune ligne existante modifiée.
-- google_options = { type: STANDARD|EVENT|OFFER, bouton: {type, url?}, evenement: {titre, debut, fin},
--                    offre: {code?, lien?, conditions?} } ; null = post « nouveauté » sans bouton.
ALTER TABLE public.contenu ADD COLUMN IF NOT EXISTS google_options jsonb;
