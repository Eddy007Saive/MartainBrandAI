-- Brouillons du Studio, persistés par compte (suivent l'utilisateur sur tous ses appareils).
create table if not exists public.studio_drafts (
  telegram_id uuid primary key references public.users(telegram_id) on delete cascade,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
