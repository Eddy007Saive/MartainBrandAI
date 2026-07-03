-- Studio Vidéo : le script devient un contenu (statut « À tourner ») consultable dans Contenus.
-- Additif.
alter table contenu add column if not exists script text;

-- Nouveau statut pour un script en attente de tournage/montage (ASCII comme les autres ; accent à l'affichage).
alter type statut_contenu add value if not exists 'A tourner';
