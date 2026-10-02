-- 2026-10-02 : reseau dont le compte a change (autre compte, profil Zernio recree, reconnexion
-- apres deconnexion) -> on PROPOSE au client de reprogrammer ses posts pas encore publies.
ALTER TABLE comptes_sociaux ADD COLUMN IF NOT EXISTS reprog_en_attente boolean NOT NULL DEFAULT false;
