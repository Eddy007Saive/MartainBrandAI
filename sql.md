-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

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
  lien_notion text,
  lien_visuel text,
  lien_publication text,
  post_id text,
  lien_video_dropbox text,
  prompt_image text,
  image_martin boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  date_publication timestamp with time zone,
  studio_id uuid,
  callback_url text,
  CONSTRAINT contenu_pkey PRIMARY KEY (id),
  CONSTRAINT contenu_telegram_id_fkey FOREIGN KEY (telegram_id) REFERENCES public.users(telegram_id),
  CONSTRAINT contenu_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studio(id)
);
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
  platform text NOT NULL CHECK (platform = ANY (ARRAY['linkedin'::text, 'instagram'::text, 'facebook'::text, 'tiktok'::text, 'youtube'::text])),
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
  api_key_openrouter text,
  api_key_gemini text,
  api_key_openai text,
  sexe USER-DEFINED DEFAULT 'homme'::"Sexe",
  couleur_principale text DEFAULT '#003D2E'::text,
  couleur_secondaire text DEFAULT '#0077FF'::text,
  couleur_accent text DEFAULT '#3AFFA3'::text,
  gpt_url_linkedin text,
  gpt_url_instagram text,
  gpt_url_sujets text,
  gpt_url_default text,
  password_hash text,
  late_profile_id text,
  late_account_linkedin text,
  late_account_instagram text,
  late_account_facebook text,
  late_account_tiktok text,
  late_account_youtube text,
  heygen_avatar_name text,
  CONSTRAINT users_pkey PRIMARY KEY (telegram_id)
);