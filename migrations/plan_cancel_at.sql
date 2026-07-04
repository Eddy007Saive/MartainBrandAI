-- Résiliation programmée : date de fin d'abonnement quand le client résilie
-- (Stripe API récente -> `cancel_at`). Vide = renouvellement normal.
-- Sert à l'affichage client (« Résilié — actif jusqu'au X ») et à la détection
-- de transition pour la notif admin (None -> date = nouvelle résiliation).
alter table users add column if not exists plan_cancel_at timestamptz;
