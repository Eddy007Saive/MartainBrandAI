-- Thème vidéo de marque (userThemeId Submagic) assigné à un compte par l'admin.
-- Vide = le compte utilise les 45 templates par défaut (ou le thème global SUBMAGIC_DEFAULT_THEME_ID).
alter table users add column if not exists submagic_theme_id text;
alter table users add column if not exists submagic_theme_label text;
