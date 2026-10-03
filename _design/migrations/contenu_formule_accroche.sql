-- 2026-10-03 : formule d'accroche utilisee par l'IA (accroche_service.FORMULES), pour mesurer
-- plus tard quelles formules marchent pour chaque client.
ALTER TABLE contenu ADD COLUMN IF NOT EXISTS formule_accroche smallint;
