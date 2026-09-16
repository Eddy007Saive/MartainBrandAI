-- Style visuel des images IA (2026-09-16) : défaut de la marque et dernier style utilisé sur chaque post.
-- Valeurs : photo, cinema, 3d, illustration, neon, pop, auto (l'IA choisit selon le post). Appliquée le 16/09.
alter table public.marques add column if not exists style_image text default 'photo';
alter table public.contenu add column if not exists style_image text;
