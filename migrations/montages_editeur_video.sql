-- Éditeur vidéo manuel (façon CapCut) : un projet de montage par ligne, le JSON `projet`
-- est le même objet que la composition Remotion « Montage » reçoit au rendu.
-- Appliquée le 2026-09-18.
create table if not exists public.montages (
  id uuid primary key default gen_random_uuid(),
  telegram_id uuid not null references public.users(telegram_id) on delete cascade,
  titre text not null default 'Montage',
  projet jsonb not null default '{}'::jsonb,
  source_contenu_id uuid null,           -- reel ou vidéo d'origine (ouvert « dans l'éditeur »)
  contenu_id uuid null,                  -- la ligne Contenus produite par l'export
  statut text not null default 'brouillon',   -- brouillon | rendu_en_cours | rendu | echec
  video_url text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists montages_telegram_idx on public.montages (telegram_id, updated_at desc);
