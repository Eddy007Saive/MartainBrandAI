-- =====================================================================
-- GESTION DES IMPAYÉS : couper les coûts variables dans l'ordre inverse
-- de leur réversibilité quand un client ne paie plus.
--
--   actif (active/trialing) --(invoice.payment_failed)--> grace (past_due)
--   grace --(J+10, cron)--> suspendu (suspended : réseaux Zernio déconnectés)
--   suspendu --(J+30, cron)--> résilié (canceled)
--   grace | suspendu --(invoice.paid)--> actif
--
-- L'état vit dans subscriptions.status (déjà pilote des quotas) ; « suspended »
-- est une nouvelle valeur. impaye_depuis pilote les crans, pas la date Stripe.
-- =====================================================================

ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS impaye_depuis    timestamptz,   -- premier échec non résolu
    ADD COLUMN IF NOT EXISTS suspendu_le      timestamptz,   -- déconnexion des réseaux
    ADD COLUMN IF NOT EXISTS impaye_mail2_le  timestamptz,   -- avertissement J+9 envoyé
    ADD COLUMN IF NOT EXISTS impaye_mail4_le  timestamptz;   -- dernier avis J+29 envoyé

-- Ce que le client avait de connecté AVANT la déconnexion : sert à la
-- reconnexion guidée au retour. Écrit et committé avant tout appel Zernio.
CREATE TABLE IF NOT EXISTS reseaux_sauvegardes (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id      uuid NOT NULL,
    plateforme       text NOT NULL,
    late_account_id  text,
    nom_affiche      text,
    deconnecte_le    timestamptz NOT NULL DEFAULT now(),
    retabli_le       timestamptz,          -- reconnecté (ou ignoré) par le client
    abandonne        boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS reseaux_sauvegardes_en_attente
    ON reseaux_sauvegardes (telegram_id) WHERE retabli_le IS NULL;

-- Idempotence des webhooks Stripe : un même événement rejoué n'est traité
-- qu'une fois (sinon un doublon crédite ou notifie deux fois).
CREATE TABLE IF NOT EXISTS evenements_stripe (
    stripe_event_id  text PRIMARY KEY,
    type             text,
    recu_le          timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Verrou de génération : un compte en grâce ou suspendu ne consomme plus.
-- (Doublé côté Python dans quota_service.consume ; ici c'est le filet.)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ensure_period_counters(p_user uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_sub      subscriptions%ROWTYPE;
    q          RECORD;
    v_prev     usage_counters%ROWTYPE;
    v_leftover int;
BEGIN
    SELECT * INTO v_sub FROM subscriptions
        WHERE user_id = p_user AND status IN ('trialing', 'active', 'past_due', 'suspended')
        ORDER BY created_at DESC LIMIT 1;
    IF v_sub.id IS NULL THEN RETURN; END IF;

    FOR q IN SELECT action_type, included_quantity FROM plan_quotas WHERE plan_id = v_sub.plan_id LOOP
        PERFORM 1 FROM usage_counters
            WHERE subscription_id = v_sub.id AND action_type = q.action_type
              AND period_start = v_sub.current_period_start;
        IF FOUND THEN CONTINUE; END IF;

        v_leftover := 0;
        SELECT * INTO v_prev FROM usage_counters
            WHERE subscription_id = v_sub.id AND action_type = q.action_type
              AND period_start < v_sub.current_period_start
            ORDER BY period_start DESC LIMIT 1;
        IF v_prev.id IS NOT NULL THEN
            v_leftover := GREATEST(0, q.included_quantity + v_prev.extra_quantity - v_prev.used_quantity);
        END IF;

        INSERT INTO usage_counters (subscription_id, action_type, period_start, period_end, extra_quantity)
            VALUES (v_sub.id, q.action_type, v_sub.current_period_start, v_sub.current_period_end, v_leftover)
            ON CONFLICT (subscription_id, action_type, period_start) DO NOTHING;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION consume_quota(p_user uuid, p_action text, p_qty int DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
    v_sub      subscriptions%ROWTYPE;
    v_included int;
    v_cost     int;
    v_used     int;
    v_limit    int;
BEGIN
    SELECT * INTO v_sub FROM subscriptions
        WHERE user_id = p_user AND status IN ('trialing', 'active', 'past_due', 'suspended')
        ORDER BY created_at DESC LIMIT 1;
    IF v_sub.id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'no_subscription');
    END IF;
    -- Impayé : la carte est là mais le dernier prélèvement a échoué. On arrête
    -- de dépenser pour ce compte tant qu'un encaissement n'a pas eu lieu.
    IF v_sub.status = 'past_due' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'impaye');
    END IF;
    IF v_sub.status = 'suspended' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'suspendu');
    END IF;
    IF now() > v_sub.current_period_end THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'expired');
    END IF;

    SELECT included_quantity, internal_unit_cost_cents INTO v_included, v_cost
        FROM plan_quotas WHERE plan_id = v_sub.plan_id AND action_type = p_action;
    IF v_included IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_in_plan');
    END IF;

    PERFORM ensure_period_counters(p_user);

    UPDATE usage_counters
        SET used_quantity = used_quantity + p_qty
        WHERE subscription_id = v_sub.id AND action_type = p_action
          AND period_start = v_sub.current_period_start
          AND used_quantity + p_qty <= v_included + extra_quantity
        RETURNING used_quantity, v_included + extra_quantity INTO v_used, v_limit;

    IF v_used IS NULL THEN
        SELECT used_quantity, v_included + extra_quantity INTO v_used, v_limit
            FROM usage_counters WHERE subscription_id = v_sub.id AND action_type = p_action
              AND period_start = v_sub.current_period_start;
        RETURN jsonb_build_object('ok', false, 'reason', 'quota',
            'used', COALESCE(v_used, 0), 'limit', COALESCE(v_limit, v_included));
    END IF;

    RETURN jsonb_build_object('ok', true, 'reason', 'ok',
        'subscription_id', v_sub.id, 'used', v_used, 'limit', v_limit, 'unit_cost', v_cost);
END;
$$;
