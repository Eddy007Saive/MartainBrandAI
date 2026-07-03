-- Studio Vidéo : id Cloudinary de la vidéo BRUTE (supprimée une fois le montage terminé).
alter table contenu add column if not exists video_raw_id text;
