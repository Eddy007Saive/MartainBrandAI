-- Google Business Profile : nouveau réseau (Zernio/Late slug = "googlebusiness").
-- 1) Colonne du compte connecté (comme late_account_instagram, etc.)
alter table public.users add column if not exists late_account_googlebusiness text;

-- 2) Valeur d'enum pour le ciblage de contenu (reseau_cible). "GoogleBusiness".lower() == "googlebusiness".
--    ADD VALUE ne peut pas tourner dans une transaction/DO -> à exécuter tel quel.
alter type public.reseau_social add value if not exists 'GoogleBusiness';
