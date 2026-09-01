-- =====================================================================
-- Ajoute le type d'action "story" au système de quotas (quota_system.sql).
-- Jusqu'ici « Décliner en story » appelait Claude sans jamais consommer de
-- quota (seul un mur d'abonnement générique le gardait) — incohérent avec
-- post/carousel/image qui sont tous mètrés. Coût interne aligné sur
-- l'ordre de grandeur de "subject" : un seul appel claude-haiku-4-5, pas de
-- rendu Playwright compté à part (le rendu/aperçu reste gratuit).
-- =====================================================================

INSERT INTO plan_quotas (plan_id, action_type, included_quantity, internal_unit_cost_cents)
SELECT p.id, q.action_type, q.inc, q.cost
FROM plans p, (VALUES
    ('story', 30, 2)
) AS q(action_type, inc, cost)
WHERE p.name = 'Pro'
ON CONFLICT (plan_id, action_type)
DO UPDATE SET included_quantity = EXCLUDED.included_quantity,
              internal_unit_cost_cents = EXCLUDED.internal_unit_cost_cents;

INSERT INTO plan_quotas (plan_id, action_type, included_quantity, internal_unit_cost_cents)
SELECT p.id, q.action_type, q.inc, q.cost
FROM plans p, (VALUES
    ('story', 5, 2)
) AS q(action_type, inc, cost)
WHERE p.name = 'Essai'
ON CONFLICT (plan_id, action_type)
DO UPDATE SET included_quantity = EXCLUDED.included_quantity,
              internal_unit_cost_cents = EXCLUDED.internal_unit_cost_cents;

INSERT INTO plan_quotas (plan_id, action_type, included_quantity, internal_unit_cost_cents)
SELECT p.id, q.action_type, q.inc, q.cost
FROM plans p, (VALUES
    ('story', 1000000, 0)
) AS q(action_type, inc, cost)
WHERE p.name = 'Boss'
ON CONFLICT (plan_id, action_type)
DO UPDATE SET included_quantity = EXCLUDED.included_quantity,
              internal_unit_cost_cents = EXCLUDED.internal_unit_cost_cents;
