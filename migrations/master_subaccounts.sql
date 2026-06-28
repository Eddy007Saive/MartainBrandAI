-- Comptes liés : un master gère plusieurs sous-comptes (marques), pool de crédits partagé.
alter table public.users
  add column if not exists master_id uuid references public.users(telegram_id) on delete set null;

create index if not exists idx_users_master on public.users(master_id);
