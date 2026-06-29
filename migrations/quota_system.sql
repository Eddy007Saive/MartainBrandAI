-- =====================================================================
-- PresenceOS — Système de quotas par TYPE d'action (remplace les crédits)
-- Mètre par type (subject/post/image_standard/image_pro/carousel/...),
-- jauge de résultats côté client, multi-offres + multi-types, tout paramétrable.
-- =====================================================================

-- 1. Offres (paramétrables)
CREATE TABLE IF NOT EXISTS plans (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text NOT NULL UNIQUE,
    price_cents   int  NOT NULL DEFAULT 0,
    billing_period text NOT NULL DEFAULT 'monthly',
    is_active     boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- 2. Quotas inclus par type, par offre
CREATE TABLE IF NOT EXISTS plan_quotas (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id                  uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    action_type              text NOT NULL,
    included_quantity        int  NOT NULL DEFAULT 0,
    internal_unit_cost_cents int  NOT NULL DEFAULT 0,
    rollover                 boolean NOT NULL DEFAULT false,
    UNIQUE (plan_id, action_type)
);

-- 3. Abonnement actif d'un compte (par compte : user_id = telegram_id uuid)
CREATE TABLE IF NOT EXISTS subscriptions (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              uuid NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    plan_id              uuid NOT NULL REFERENCES plans(id),
    status               text NOT NULL DEFAULT 'trialing',  -- trialing|active|past_due|canceled
    current_period_start timestamptz NOT NULL DEFAULT now(),
    current_period_end   timestamptz NOT NULL,
    stripe_subscription_id text,
    created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);

-- 4. Compteur courant par abonnement / période / type (la jauge)
CREATE TABLE IF NOT EXISTS usage_counters (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    action_type    text NOT NULL,
    period_start   timestamptz NOT NULL,
    period_end     timestamptz NOT NULL,
    used_quantity  int NOT NULL DEFAULT 0,
    extra_quantity int NOT NULL DEFAULT 0,   -- packs rachetés pour cette période
    UNIQUE (subscription_id, action_type, period_start)
);

-- 5. Journal append-only (audit + marge + power-users)
CREATE TABLE IF NOT EXISTS usage_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
    action_type     text NOT NULL,
    quantity        int NOT NULL DEFAULT 1,
    internal_cost_cents int NOT NULL DEFAULT 0,
    status          text NOT NULL DEFAULT 'success',  -- success|failed
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usage_events_sub ON usage_events(subscription_id, created_at);

-- 6. Packs de rachat (paramétrables)
CREATE TABLE IF NOT EXISTS credit_packs (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    action_type text NOT NULL,
    name        text NOT NULL UNIQUE,
    quantity    int  NOT NULL,
    price_cents int  NOT NULL,
    is_active   boolean NOT NULL DEFAULT true,
    stripe_price_id text
);

-- =====================================================================
-- SEED : offre Pro (259 €/mois) + quotas + packs (tout modifiable en admin)
-- =====================================================================
INSERT INTO plans (name, price_cents, billing_period, is_active)
VALUES ('Pro', 25900, 'monthly', true)
ON CONFLICT (name) DO UPDATE SET price_cents = EXCLUDED.price_cents, is_active = true;

INSERT INTO plan_quotas (plan_id, action_type, included_quantity, internal_unit_cost_cents)
SELECT p.id, q.action_type, q.inc, q.cost
FROM plans p, (VALUES
    ('subject', 100, 1),
    ('post', 50, 7),
    ('image_standard', 50, 4),
    ('image_pro', 20, 13),
    ('carousel', 10, 50)
) AS q(action_type, inc, cost)
WHERE p.name = 'Pro'
ON CONFLICT (plan_id, action_type)
DO UPDATE SET included_quantity = EXCLUDED.included_quantity,
              internal_unit_cost_cents = EXCLUDED.internal_unit_cost_cents;

INSERT INTO credit_packs (action_type, name, quantity, price_cents)
VALUES
    ('image_pro', '+25 images HD', 25, 900),
    ('image_pro', '+50 images HD', 50, 1500),
    ('carousel',  '+5 carrousels', 5, 700),
    ('carousel',  '+10 carrousels', 10, 1200),
    ('image_standard', '+50 images standard', 50, 600)
ON CONFLICT (name) DO NOTHING;

-- =====================================================================
-- FONCTIONS atomiques
-- =====================================================================

-- Réserve p_qty pour (compte, type) sur la période courante. Atomique (anti-race).
-- Retourne jsonb : {ok, reason, used, limit, unit_cost, subscription_id}
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

    INSERT INTO usage_counters (subscription_id, action_type, period_start, period_end)
        VALUES (v_sub.id, p_action, v_sub.current_period_start, v_sub.current_period_end)
        ON CONFLICT (subscription_id, action_type, period_start) DO NOTHING;

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

-- Rembourse (décrémente) en cas d'échec de génération.
CREATE OR REPLACE FUNCTION refund_quota(p_sub uuid, p_action text, p_qty int DEFAULT 1)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    UPDATE usage_counters uc
        SET used_quantity = GREATEST(0, used_quantity - p_qty)
        FROM subscriptions s
        WHERE uc.subscription_id = p_sub AND uc.action_type = p_action
          AND s.id = p_sub AND uc.period_start = s.current_period_start;
END;
$$;

-- Ajoute du quota racheté (pack) pour la période courante.
CREATE OR REPLACE FUNCTION add_extra_quota(p_sub uuid, p_action text, p_qty int)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_sub subscriptions%ROWTYPE;
BEGIN
    SELECT * INTO v_sub FROM subscriptions WHERE id = p_sub;
    IF v_sub.id IS NULL THEN RETURN; END IF;
    INSERT INTO usage_counters (subscription_id, action_type, period_start, period_end, extra_quantity)
        VALUES (p_sub, p_action, v_sub.current_period_start, v_sub.current_period_end, p_qty)
        ON CONFLICT (subscription_id, action_type, period_start)
        DO UPDATE SET extra_quantity = usage_counters.extra_quantity + p_qty;
END;
$$;
