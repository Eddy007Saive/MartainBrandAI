-- =====================================================================
-- REPORT DES QUOTAS (rollover) : les quotas non consommés d'une période
-- sont reportés sur la suivante (cumul). Le client ne perd rien.
-- Mécanique : au premier accès d'une NOUVELLE période, le compteur est créé
-- avec extra_quantity = reste de la période précédente (inclus + extra - utilisé).
-- Le reste inclut lui-même les reports antérieurs -> le cumul s'enchaîne.
-- =====================================================================

-- Matérialise les compteurs de la période courante (avec report) pour tous les
-- types d'action du plan. Idempotent, sans effet si les compteurs existent déjà.
CREATE OR REPLACE FUNCTION ensure_period_counters(p_user uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_sub      subscriptions%ROWTYPE;
    q          RECORD;
    v_prev     usage_counters%ROWTYPE;
    v_leftover int;
BEGIN
    SELECT * INTO v_sub FROM subscriptions
        WHERE user_id = p_user AND status IN ('trialing', 'active')
        ORDER BY created_at DESC LIMIT 1;
    IF v_sub.id IS NULL THEN RETURN; END IF;

    FOR q IN SELECT action_type, included_quantity FROM plan_quotas WHERE plan_id = v_sub.plan_id LOOP
        -- Compteur déjà présent pour la période courante -> rien à faire
        PERFORM 1 FROM usage_counters
            WHERE subscription_id = v_sub.id AND action_type = q.action_type
              AND period_start = v_sub.current_period_start;
        IF FOUND THEN CONTINUE; END IF;

        -- Reste de la DERNIÈRE période précédente (0 si première période)
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

-- consume_quota : identique, mais matérialise les compteurs (AVEC report)
-- au lieu de créer un compteur vierge.
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
        WHERE user_id = p_user AND status IN ('trialing', 'active')
        ORDER BY created_at DESC LIMIT 1;
    IF v_sub.id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'no_subscription');
    END IF;
    IF now() > v_sub.current_period_end THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'expired');
    END IF;

    SELECT included_quantity, internal_unit_cost_cents INTO v_included, v_cost
        FROM plan_quotas WHERE plan_id = v_sub.plan_id AND action_type = p_action;
    IF v_included IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_in_plan');
    END IF;

    -- Crée les compteurs de la période avec le REPORT de la période précédente
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
