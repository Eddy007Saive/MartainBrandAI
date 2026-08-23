-- Parcours de résiliation : la raison du départ, et la pause.
--
-- À passer à la main dans l'éditeur SQL de Supabase — il n'y a pas de
-- lanceur de migrations dans ce projet.

-- ---------------------------------------------------------------- Les départs
--
-- Une ligne par tentative de résiliation, y compris celles qui n'aboutissent
-- pas : quelqu'un qui entame le parcours puis reste nous apprend autant que
-- celui qui part — c'est même la seule façon de savoir si une offre de
-- rétention fonctionne.
create table if not exists resiliations (
  id            uuid primary key default gen_random_uuid(),
  telegram_id   uuid not null references users(telegram_id) on delete cascade,
  raison        text not null,          -- prix | temps | resultats | complexite | fonctionnalite | concurrent | test | autre
  commentaire   text,                   -- le champ libre, facultatif
  issue         text not null default 'partie',  -- partie | retenue | pause
  detail        text,                   -- ce qui l'a retenue : remise, appel, pause 2 mois…
  fin_acces_le  timestamptz,            -- jusqu'à quand l'accès reste ouvert
  created_at    timestamptz not null default now()
);

create index if not exists resiliations_compte_idx on resiliations (telegram_id, created_at desc);
create index if not exists resiliations_raison_idx on resiliations (raison, created_at desc);

-- ---------------------------------------------------------------- La pause
--
-- Stripe met la facturation en pause SANS changer le statut de l'abonnement :
-- il reste « active ». On ne peut donc pas lire l'état de pause dans `status`,
-- il faut sa propre colonne — sinon un compte en pause garderait l'accès.
alter table subscriptions add column if not exists pause_jusqu_au timestamptz;

comment on column subscriptions.pause_jusqu_au is
  'Fin de la pause. Non nul = facturation ET accès suspendus. Stripe laisse le statut à « active » pendant une pause_collection, cette colonne est la seule source.';
