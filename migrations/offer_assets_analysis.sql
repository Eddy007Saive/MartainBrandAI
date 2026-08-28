-- Product Vision Agent (Phase 1) : photos d'une offre + leur analyse vision.
-- Rattachées à public.offers. Analyse faite UNE fois à l'upload (Gemini 2.5 Flash),
-- stockée en JSON et réutilisée pour ancrer la génération / placer les textes.

create table if not exists public.offer_assets (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  telegram_id uuid not null,
  url text not null,
  public_id text,                          -- id Cloudinary (pour suppression)
  role text not null default 'other',      -- face | back | worn | detail | lifestyle | other
  width int,
  height int,
  created_at timestamptz not null default now()
);
create index if not exists idx_offer_assets_offer on public.offer_assets(offer_id);
create index if not exists idx_offer_assets_tg on public.offer_assets(telegram_id);

create table if not exists public.offer_analysis (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  asset_id uuid not null references public.offer_assets(id) on delete cascade,
  telegram_id uuid not null,
  analysis jsonb not null,                 -- {product, photo, composition}
  model text,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_offer_analysis_asset on public.offer_analysis(asset_id);
create index if not exists idx_offer_analysis_offer on public.offer_analysis(offer_id);
create index if not exists idx_offer_analysis_tg on public.offer_analysis(telegram_id);
