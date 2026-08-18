-- ============================================================================
-- Programme d'affiliation Postorico
--   25 % une fois sur le Pack Fondations, 10 % chaque mois tant que le client
--   reste abonne. Les taux sont stockes, jamais les montants : la commission se
--   calcule sur ce que Stripe a reellement encaisse, dans la devise de la
--   facture. Un marche en dollars ne demande donc aucune ligne de code.
-- ============================================================================

create table if not exists affiliates (
  id              uuid primary key default gen_random_uuid(),
  -- null = affilie externe (influenceur, blogueur) sans compte client
  telegram_id     uuid references users(telegram_id) on delete set null,
  code            text unique not null,
  nom             text not null,
  email           text not null,
  statut          text not null default 'en_attente',   -- en_attente | actif | suspendu | refuse
  taux_setup      numeric(5,2) not null default 25,
  taux_recurrent  numeric(5,2) not null default 10,
  iban_chiffre    text,                                  -- Fernet, prefixe enc:v1:
  audience        text,                                  -- ce que l'affilie a annonce (demande externe)
  motif           text,                                  -- motif de refus / note admin
  created_at      timestamptz not null default now(),
  approuve_le     timestamptz,
  approuve_par    uuid
);
create index if not exists affiliates_statut_idx on affiliates(statut);
create index if not exists affiliates_telegram_idx on affiliates(telegram_id);

-- Un clic sur un lien d'affiliation. Sert au taux de conversion et a
-- l'anti-fraude (meme IP au clic et au paiement = auto-parrainage probable).
create table if not exists affiliate_clicks (
  id            uuid primary key default gen_random_uuid(),
  affiliate_id  uuid not null references affiliates(id) on delete cascade,
  ip            text,
  user_agent    text,
  referer       text,
  created_at    timestamptz not null default now()
);
create index if not exists affiliate_clicks_aff_idx on affiliate_clicks(affiliate_id, created_at desc);

-- Le filleul. Un client n'a qu'un parrain : la premiere attribution gagne.
create table if not exists affiliate_referrals (
  id            uuid primary key default gen_random_uuid(),
  affiliate_id  uuid not null references affiliates(id) on delete cascade,
  telegram_id   uuid unique references users(telegram_id) on delete cascade,
  email         text,                                    -- lead pack, avant creation du compte
  statut        text not null default 'active',          -- active | expiree | verrouillee
  expire_le     timestamptz,                             -- fenetre d'attribution
  verrouille_le timestamptz,                             -- fige au premier paiement
  ip            text,
  created_at    timestamptz not null default now()
);
create index if not exists affiliate_referrals_aff_idx on affiliate_referrals(affiliate_id);
create index if not exists affiliate_referrals_email_idx on affiliate_referrals(lower(email));

-- Une commission par facture Stripe. stripe_invoice_id est unique : le webhook
-- peut rejouer un event sans creer de doublon.
create table if not exists affiliate_commissions (
  id                uuid primary key default gen_random_uuid(),
  affiliate_id      uuid not null references affiliates(id) on delete cascade,
  telegram_id       uuid,                              -- le filleul
  filleul_email     text,
  type              text not null,                       -- setup | recurrent
  stripe_invoice_id text unique not null,                -- id facture, session ou reference manuelle
  libelle           text,
  base_cents        integer not null,                    -- montant encaisse
  devise            text not null default 'EUR',
  taux              numeric(5,2) not null,
  montant_cents     integer not null,                    -- base x taux, arrondi
  statut            text not null default 'en_attente',  -- en_attente | validee | a_facturer | payee | annulee
  fraude            boolean not null default false,
  periode           date not null,                       -- 1er du mois de rattachement
  releve_id         uuid,
  created_at        timestamptz not null default now(),
  validee_le        timestamptz,
  payee_le          timestamptz
);
create index if not exists affiliate_commissions_aff_idx on affiliate_commissions(affiliate_id, periode desc);
create index if not exists affiliate_commissions_statut_idx on affiliate_commissions(statut);
create index if not exists affiliate_commissions_periode_idx on affiliate_commissions(periode desc);

-- Releve mensuel : un par affilie, par mois ET par devise. Un affilie qui vend
-- sur deux marches recoit deux releves, chacun paye dans sa devise.
create table if not exists affiliate_statements (
  id            uuid primary key default gen_random_uuid(),
  affiliate_id  uuid not null references affiliates(id) on delete cascade,
  periode       date not null,
  devise        text not null default 'EUR',
  montant_cents integer not null default 0,
  nb            integer not null default 0,
  statut        text not null default 'a_facturer',      -- a_facturer | payee
  created_at    timestamptz not null default now(),
  payee_le      timestamptz,
  unique (affiliate_id, periode, devise)
);
