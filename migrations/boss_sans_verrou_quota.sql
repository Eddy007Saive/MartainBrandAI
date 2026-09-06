-- 2026-09-05 : le plan « Boss » (comptes internes : équipe, démonstrations) est
-- hors de tout verrou : ni impayé, ni suspension, ni période échue. Seul le
-- plafond (illimité) s'applique. Appliqué via MCP le 2026-09-05.
-- Le pendant Python : quota_service.est_boss, impaye_service (échec ignoré,
-- cron passe), billing_service._upsert_subscription (garde le plan Boss, reste actif).
CREATE OR REPLACE FUNCTION consume_quota(p_user uuid, p_action text, p_qty int DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
    v_sub      subscriptions%ROWTYPE;
    v_plan     text;
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
    SELECT name INTO v_plan FROM plans WHERE id = v_sub.plan_id;
    IF COALESCE(v_plan, '') <> 'Boss' THEN
        IF v_sub.status = 'past_due' THEN
            RETURN jsonb_build_object('ok', false, 'reason', 'impaye');
        END IF;
        IF v_sub.status = 'suspended' THEN
            RETURN jsonb_build_object('ok', false, 'reason', 'suspendu');
        END IF;
        IF now() > v_sub.current_period_end THEN
            RETURN jsonb_build_object('ok', false, 'reason', 'expired');
        END IF;
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
