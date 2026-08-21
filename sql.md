-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.
*-- 

CREATE TABLE public.analytics_performance (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL,
  contenu_id uuid,
  vues numeric DEFAULT 0,
  likes numeric DEFAULT 0,
  commentaires integer DEFAULT 0,
  partages numeric DEFAULT 0,
  post_performant boolean DEFAULT false,
  date_publication text,
  semaine text,
  taux_engagement numeric DEFAULT 
CASE
    WHEN (vues > (0)::numeric) THEN round(((((likes + (commentaires)::numeric) + partages) / vues) * (100)::numeric), 2)
    ELSE (0)::numeric
END,
  performance_score numeric DEFAULT 
CASE
    WHEN (vues > (0)::numeric) THEN round((((((((likes + (commentaires)::numeric) + partages) / vues) * (100)::numeric) * 0.4) + ((((commentaires)::numeric / vues) * (100)::numeric) * 0.3)) + (((partages / vues) * (100)::numeric) * 0.2)), 1)
    ELSE (0)::numeric
END,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT analytics_performance_pkey PRIMARY KEY (id),
  CONSTRAINT analytics_performance_telegram_id_fkey FOREIGN KEY (telegram_id) REFERENCES public.users(telegram_id),
  CONSTRAINT analytics_performance_contenu_id_fkey FOREIGN KEY (contenu_id) REFERENCES public.contenu(id)
);
CREATE TABLE public.anecdotes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL,
  titre text,
  type text,
  annee text,
  entreprise text,
  contexte text,
  deroulement text,
  resultat_concret text,
  lecon_cle text,
  usage_recommande text,
  niveau_emotion text,
  resume_280 text,
  mots_cles text,
  ton_recommande text,
  public_cible text,
  angle_narration text,
  format_pitch text,
  format_storytelling text,
  format_long_post text,
  date date,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT anecdotes_pkey PRIMARY KEY (id),
  CONSTRAINT anecdotes_telegram_id_fkey FOREIGN KEY (telegram_id) REFERENCES public.users(telegram_id)
);
CREATE TABLE public.brouillons (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL,
  auto_num integer NOT NULL DEFAULT nextval('brouillons_auto_num_seq'::regclass),
  id_sujet text,
  titre text,
  hook text,
  brief_instructions text,
  pilier text,
  reseau_cible ARRAY,
  type_contenu USER-DEFINED,
  agent_responsable text,
  categorie_visuel USER-DEFINED,
  image_martin boolean DEFAULT false,
  cta text,
  preuve text,
  statut USER-DEFINED DEFAULT 'Brouillon'::statut_brouillon,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT brouillons_pkey PRIMARY KEY (id),
  CONSTRAINT brouillons_telegram_id_fkey FOREIGN KEY (telegram_id) REFERENCES public.users(telegram_id)
);
CREATE TABLE public.callback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  contenu_id uuid,
  thematique text,
  key_page text,
  page_id text,
  block_id text,
  modification_id text,
  regenerate_id text,
  message_id bigint,
  statut text,
  titre_original text,
  lien_notion text,
  image_id text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT callback_pkey PRIMARY KEY (id),
  CONSTRAINT callback_contenu_id_fkey FOREIGN KEY (contenu_id) REFERENCES public.contenu(id)
);
CREATE TABLE public.commentaires (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL,
  contenu_id uuid,
  nom_auteur text,
  contenu_commentaire text,
  date_heure timestamp with time zone,
  reponse_ia text,
  statut USER-DEFINED DEFAULT 'Nouveau'::statut_commentaire,
  post_id text,
  video_id text,
  id_message numeric,
  created_at timestamp with time zone DEFAULT now(),
  comment_id text UNIQUE,
  account_id text,
  CONSTRAINT commentaires_pkey PRIMARY KEY (id),
  CONSTRAINT commentaires_telegram_id_fkey FOREIGN KEY (telegram_id) REFERENCES public.users(telegram_id),
  CONSTRAINT commentaires_contenu_id_fkey FOREIGN KEY (contenu_id) REFERENCES public.contenu(id)
);
CREATE TABLE public.contenu (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL,
  titre text,
  contenu text,
  reseau_cible USER-DEFINED,
  type USER-DEFINED,
  statut USER-DEFINED DEFAULT 'A valider'::statut_contenu,
  lien_visuel text,
  lien_publication text,
  lien_video_dropbox text,
  prompt_image text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  date_publication timestamp with time zone,
  CONSTRAINT contenu_pkey PRIMARY KEY (id),
  CONSTRAINT contenu_telegram_id_fkey FOREIGN KEY (telegram_id) REFERENCES public.users(telegram_id)
);
-- Normalisation phase 3 (14/08/2026) — la fiche de marque sort de `users`.
-- 22 colonnes décrivant la MARQUE (voix, piliers, exemples par réseau, palette,
-- réglages carrousel) cohabitaient avec le compte (mot de passe, facturation).
-- UNIQUE(telegram_id) fige le 1-1 actuel ; la retirer ouvrira le multi-marques.
-- Comme en phase 2, les colonnes d'origine sont conservées et tenues à jour en
-- miroir, et le frontend continue de lire user.voix_marque, user.couleur_accent…
-- (recomposé par marque_service.fiche() dans get_user() et _charger_marque()).
CREATE TABLE public.marques (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  telegram_id uuid NOT NULL,
  secteur text, voix_marque text, audience text, piliers text, a_eviter text,
  hooks text, ctas text, regles text,
  exemples_linkedin text, exemples_instagram text, exemples_facebook text, exemples_tiktok text,
  exemples_googlebusiness text, exemples_twitter text,
  couleur_principale text DEFAULT '#003D2E',
  couleur_secondaire text DEFAULT '#0077FF',
  couleur_accent text DEFAULT '#3AFFA3',
  logo_url text,
  carrousel_couleur_principale text, carrousel_couleur_secondaire text, carrousel_couleur_accent text,
  carrousel_font text, carrousel_font_corps text, carrousel_templates_exclusifs text,
  use_inspirations boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT marques_pkey PRIMARY KEY (id),
  CONSTRAINT marques_telegram_id_fkey FOREIGN KEY (telegram_id) REFERENCES public.users(telegram_id) ON DELETE CASCADE,
  CONSTRAINT marques_telegram_id_key UNIQUE (telegram_id)
);

-- Normalisation phase 2 (14/08/2026) — les comptes sociaux sortent de `users`.
-- Avant : 7 colonnes late_account_<réseau> en dur (ajouter un réseau = migration de
-- schéma, et une colonne NULL pour la majorité des comptes). Après : une ligne par
-- compte connecté. Les colonnes d'origine sont conservées le temps de valider la
-- bascule en production, tenues à jour en miroir, mais ne sont plus lues.
-- Le frontend continue de recevoir user.late_account_<réseau> : ces clés sont
-- recomposées par social_service.champs_late() dans user_service.get_user().
CREATE TABLE public.comptes_sociaux (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  telegram_id uuid NOT NULL,
  plateforme text NOT NULL,
  late_account_id text NOT NULL,
  connecte_le timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT comptes_sociaux_pkey PRIMARY KEY (id),
  CONSTRAINT comptes_sociaux_telegram_id_fkey FOREIGN KEY (telegram_id) REFERENCES public.users(telegram_id) ON DELETE CASCADE,
  CONSTRAINT comptes_sociaux_unique UNIQUE (telegram_id, plateforme),
  CONSTRAINT comptes_sociaux_plateforme_check CHECK (plateforme IN
    ('linkedin','instagram','facebook','tiktok','youtube','googlebusiness','twitter'))
);

-- Normalisation phase 1 (14/08/2026) — colonnes supprimées de `contenu` :
--   lien_notion, post_id, image_martin, studio_id : aucune référence dans le code
--   callback_url : webhook de validation de l'ère n8n, fonctionnalité retirée avec son code
-- Valeurs résiduelles conservées dans archive.contenu_colonnes_mortes.
-- La contrainte contenu_studio_id_fkey est tombée avec studio_id.
CREATE TABLE public.documents (
  id bigint NOT NULL DEFAULT nextval('documents_id_seq'::regclass),
  content text,
  metadata jsonb,
  embedding USER-DEFINED,
  CONSTRAINT documents_pkey PRIMARY KEY (id)
);
CREATE TABLE public.erreur_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  telegram_id bigint,
  timestamp timestamp with time zone DEFAULT now(),
  workflow text,
  url text,
  node text,
  message text,
  CONSTRAINT erreur_log_pkey PRIMARY KEY (id),
  CONSTRAINT erreur_log_telegram_id_fkey FOREIGN KEY (telegram_id) REFERENCES public.users(telegram_id)
);
CREATE TABLE public.future_tendance_airbnb (
  id bigint NOT NULL DEFAULT nextval('future_tendance_airbnb_id_seq'::regclass),
  content text,
  metadata jsonb,
  embedding USER-DEFINED,
  CONSTRAINT future_tendance_airbnb_pkey PRIMARY KEY (id)
);
CREATE TABLE public.interviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL,
  nom text,
  profil_url text,
  statut USER-DEFINED DEFAULT 'Prospecte'::statut_interview,
  theme text,
  lien_notion text,
  bio text,
  date_proposee text,
  format_souhaite text,
  calendly_link text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT interviews_pkey PRIMARY KEY (id),
  CONSTRAINT interviews_telegram_id_fkey FOREIGN KEY (telegram_id) REFERENCES public.users(telegram_id)
);
CREATE TABLE public.leon (
  id integer NOT NULL DEFAULT nextval('leon_id_seq'::regclass),
  session_id character varying NOT NULL,
  message jsonb NOT NULL,
  CONSTRAINT leon_pkey PRIMARY KEY (id)
);
CREATE TABLE public.martin (
  id integer NOT NULL DEFAULT nextval('martin_id_seq'::regclass),
  session_id character varying NOT NULL,
  message jsonb NOT NULL,
  CONSTRAINT martin_pkey PRIMARY KEY (id)
);
CREATE TABLE public.musique (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nom text,
  drive_url text,
  categorie USER-DEFINED,
  CONSTRAINT musique_pkey PRIMARY KEY (id)
);
CREATE TABLE public.n8n_chat_histories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  message jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT n8n_chat_histories_pkey PRIMARY KEY (id)
);
CREATE TABLE public.plan_editorial (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL,
  titre text,
  reseau_cible ARRAY,
  type_contenu USER-DEFINED,
  pilier text,
  agent_responsable text,
  brief text,
  status USER-DEFINED DEFAULT 'A rediger'::statut_plan,
  categorie_visuel USER-DEFINED,
  image_martin boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  conteneu_id uuid,
  CONSTRAINT plan_editorial_pkey PRIMARY KEY (id),
  CONSTRAINT plan_editorial_telegram_id_fkey FOREIGN KEY (telegram_id) REFERENCES public.users(telegram_id),
  CONSTRAINT plan_editorial_conteneu_id_fkey FOREIGN KEY (conteneu_id) REFERENCES public.contenu(id)
);
CREATE TABLE public.planning_editorial (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL,
  contenu_id uuid,
  date_publication timestamp with time zone,
  heure text,
  date_choisie text,
  notes text,
  creneau text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT planning_editorial_pkey PRIMARY KEY (id),
  CONSTRAINT planning_editorial_telegram_id_fkey FOREIGN KEY (telegram_id) REFERENCES public.users(telegram_id),
  CONSTRAINT planning_editorial_contenu_id_fkey FOREIGN KEY (contenu_id) REFERENCES public.contenu(id)
);
CREATE TABLE public.publication_schedules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL,
  platform text NOT NULL CHECK (platform = ANY (ARRAY['linkedin'::text, 'instagram'::text, 'facebook'::text, 'tiktok'::text, 'youtube'::text, 'googlebusiness'::text, 'twitter'::text])),
  frequency text NOT NULL DEFAULT 'weekly'::text CHECK (frequency = ANY (ARRAY['daily'::text, '3_per_week'::text, 'weekly'::text, 'biweekly'::text, 'custom'::text])),
  days_of_week ARRAY DEFAULT '{}'::integer[],
  preferred_time time without time zone DEFAULT '09:00:00'::time without time zone,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT publication_schedules_pkey PRIMARY KEY (id),
  CONSTRAINT publication_schedules_telegram_id_fkey FOREIGN KEY (telegram_id) REFERENCES public.users(telegram_id)
);
CREATE TABLE public.settings (
  telegram_id bigint NOT NULL,
  openai_api_key text,
  openrouter_api_key text,
  openrouter_model text DEFAULT 'anthropic/claude-3.5-sonnet'::text,
  notion_api_key text,
  notion_database_id text,
  langue text DEFAULT 'fr'::text,
  ton text DEFAULT 'professionnel'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT settings_pkey PRIMARY KEY (telegram_id),
  CONSTRAINT settings_telegram_id_fkey FOREIGN KEY (telegram_id) REFERENCES public.users(telegram_id)
);
CREATE TABLE public.studio (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL,
  contenu_id uuid,
  titre text,
  script text,
  duree text,
  type_video USER-DEFINED,
  fichier_original text,
  fichier_monte text,
  statut USER-DEFINED DEFAULT 'A monter'::statut_studio,
  date_tournage date,
  ia_liee text,
  tags text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT studio_pkey PRIMARY KEY (id),
  CONSTRAINT studio_telegram_id_fkey FOREIGN KEY (telegram_id) REFERENCES public.users(telegram_id),
  CONSTRAINT studio_contenu_id_fkey FOREIGN KEY (contenu_id) REFERENCES public.contenu(id)
);
CREATE TABLE public.test_2 (
  id integer NOT NULL DEFAULT nextval('test_2_id_seq'::regclass),
  session_id character varying NOT NULL,
  message jsonb NOT NULL,
  CONSTRAINT test_2_pkey PRIMARY KEY (id)
);
-- Normalisation phase 1 (14/08/2026) — colonnes supprimées de `users` :
--   gpt_url_linkedin/instagram/sujets/default : ère des GPTs, jamais lues
--   api_key_openrouter/gemini/openai : l'IA tourne sur la clé serveur ; l'UI qui
--     les éditait était injoignable. Le trigger encrypt_api_keys et la fonction
--     get_user_keys (SECURITY DEFINER exécutable par anon) sont tombés avec.
--   heygen_avatar_name/id/status : doublons de la table heygen_avatars
-- Valeurs résiduelles conservées dans archive.users_colonnes_mortes.
-- Suppression des colonnes miroir (14/08/2026) : users ne decrit plus que le COMPTE
-- (identite, authentification, facturation, preferences). Les comptes sociaux sont
-- dans comptes_sociaux, la fiche de marque dans marques. 56 -> 26 colonnes.
-- Facturation (14/08/2026) : plan, credits, stripe_subscription_id, plan_renews_at
-- et plan_cancel_at sont supprimees. `subscriptions` + `plans` font autorite (elles
-- gouvernent les quotas) ; elles avaient diverge sur 4 comptes sur 10, faussant le
-- chiffre d'affaires affiche. subscriptions gagne `cancel_at`. On garde
-- stripe_customer_id : le client Stripe appartient au COMPTE, pas a l'abonnement.
-- Les credits sont morts (remplaces par les quotas) : RPC deduct/refund_credits supprimees.
CREATE TABLE public.users (
  telegram_id bigint NOT NULL,
  nom text,
  username text,
  email text,
  actif boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  photo_url text,
  use_photo boolean DEFAULT false,
  user_name text,
  style_vestimentaire text,
  sexe USER-DEFINED DEFAULT 'homme'::"Sexe",
  password_hash text,
  late_profile_id text,
  CONSTRAINT users_pkey PRIMARY KEY (telegram_id)
);