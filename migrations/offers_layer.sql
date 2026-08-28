-- Couche « offres » : ce que le client vend (produit / service / offre).
-- Ancre la génération de contenu sur des faits réels (prix, bénéfices) pour que
-- Claude ne les invente jamais. Générique multi-secteurs.
-- Injectée dans le contexte de marque (offers_service.contexte_offres).

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  telegram_id uuid not null,
  name text not null,
  type text not null default 'service',   -- product | service | offer
  description text,
  price text,                              -- libre : "150 €/mois", "40 000 Ar"
  benefits text,                           -- bénéfices, un par ligne
  url text,
  facts jsonb,                             -- faits fiables additionnels (matière, dimensions, stock...)
  actif boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_offers_telegram_id on public.offers(telegram_id);
