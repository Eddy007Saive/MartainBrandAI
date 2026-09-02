-- Ajoute un quota mesuré pour les reels (Remotion) : jusqu'ici seul le mur
-- d'abonnement générique gardait /reels/generer, /reels/creer et /reels/regenerer,
-- sans jamais compter dans le quota du compte — contrairement à post/story/
-- carousel/image, chacun régénérable à l'infini une fois abonné. Chaque
-- génération coûte un appel Claude (scénario) + un rendu Remotion.
-- Quantités alignées sur l'ordre de grandeur de l'action "video" existante
-- (0 en essai, 8 en Pro, illimité en Boss). Appliqué directement via le
-- client Supabase (données, pas de DDL) comme migrations/quota_story.sql.

insert into plan_quotas (plan_id, action_type, included_quantity, internal_unit_cost_cents)
select p.id, 'reel',
       case p.name when 'Essai' then 0 when 'Pro' then 8 when 'Boss' then 1000000 end,
       0
from plans p
where p.name in ('Essai', 'Pro', 'Boss')
  and not exists (
    select 1 from plan_quotas pq where pq.plan_id = p.id and pq.action_type = 'reel'
  );
