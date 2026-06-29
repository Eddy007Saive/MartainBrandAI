-- Accès admin par compte (email + mot de passe) au lieu du mot de passe partagé.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- Désigner le(s) compte(s) administrateur :
UPDATE users SET is_admin = true WHERE email = 'martindumoulin88@gmail.com';
