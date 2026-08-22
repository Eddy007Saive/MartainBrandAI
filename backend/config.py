import os
import logging
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')
load_dotenv(ROOT_DIR.parent / '.env')  # .env à la racine du projet (contient api_claude)

# Supabase — le backend utilise la cle service_role (bypasse RLS, cote serveur UNIQUEMENT).
# La cle anon reste utilisee cote client (aucun ici) ; RLS doit rester actif/restrictif pour elle.
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_ROLE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
SUPABASE_ANON_KEY = os.environ.get('SUPABASE_ANON_KEY', '')
# TEMPORAIRE : la service_role fournie n'est pas valide (401 Invalid API key) -> on retombe sur
# anon (comportement identique a la prod actuelle) tant qu'une vraie cle sb_secret_... n'est pas
# fournie. A remettre en priorite une fois la bonne cle recuperee (voir echange du 2026-08-04).
SUPABASE_KEY = SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Secrets
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'admin123')
N8N_WEBHOOK_BASE = os.environ.get('N8N_WEBHOOK_BASE', 'https://n8n.srv903010.hstgr.cloud/webhook')
# Plusieurs origines se separent par une virgule :
#   CORS_ORIGINS=https://postorico.com,https://www.postorico.com
# Les espaces autour sont retires : « a.com, b.com » produisait sinon une
# seconde origine commencant par une espace, qui ne correspondait a rien — et
# le navigateur refusait la requete sans qu'aucun journal ne le dise.
CORS_ORIGINS = [o.strip() for o in os.environ.get('CORS_ORIGINS', '*').split(',') if o.strip()]

# Claude (Anthropic) — clé dans le .env racine sous le nom `api_claude`
CLAUDE_API_KEY = os.environ.get('api_claude') or os.environ.get('ANTHROPIC_API_KEY', '')
CLAUDE_MODEL = os.environ.get('CLAUDE_MODEL', 'claude-sonnet-4-6')  # équilibre qualité/prix · alt : claude-haiku-4-5 (moins cher) / claude-opus-4-8 (qualité max)

# OpenRouter — clé UNIQUE plateforme (pour la génération d'images nano-banana)
OPENROUTER_API_KEY = (os.environ.get('OPENROUTER_API_KEY')
                      or os.environ.get('api_openrouter')
                      or os.environ.get('API_OPENROUTER')
                      or '')
OPENROUTER_IMAGE_MODEL = os.environ.get('OPENROUTER_IMAGE_MODEL', 'google/gemini-2.5-flash-image')  # nano-banana · alt: google/gemini-3.1-flash-image-preview

# HeyGen
HEYGEN_API_KEY = os.environ.get('HEYGEN_API_KEY', '')

# Cloudinary
# Submagic (montage vidéo IA : sous-titres, b-roll, zooms, musique) — Studio Vidéo / Reels
SUBMAGIC_API_KEY = os.environ.get('SUBMAGIC_API_KEY', '')
SUBMAGIC_BASE = os.environ.get('SUBMAGIC_BASE', 'https://api.submagic.co/v1')
# Thème GLOBAL de marque (userThemeId créé dans l'éditeur Submagic) appliqué par défaut à TOUS
# les comptes qui n'ont pas de thème perso. Vide = tout le monde sur les 45 templates.
SUBMAGIC_DEFAULT_THEME_ID = os.environ.get('SUBMAGIC_DEFAULT_THEME_ID', '')
SUBMAGIC_DEFAULT_THEME_LABEL = os.environ.get('SUBMAGIC_DEFAULT_THEME_LABEL', 'Thème de marque')

# Cloudflare Turnstile (anti-bot sur le formulaire public d'audit)
# Clés de TEST par défaut (passent toujours) — à remplacer par les vraies en prod.
TURNSTILE_SECRET_KEY = os.environ.get('TURNSTILE_SECRET_KEY', '1x0000000000000000000000000000000AA')

CLOUDINARY_CLOUD_NAME = os.environ.get('CLOUDINARY_CLOUD_NAME', '')
CLOUDINARY_API_KEY = os.environ.get('CLOUDINARY_API_KEY', '')
CLOUDINARY_API_SECRET = os.environ.get('CLOUDINARY_API_SECRET', '')

# Resend (envoi d'emails — mot de passe oublié)
RESEND_API_KEY = os.environ.get('RESEND_API_KEY') or os.environ.get('api_resend', '')
RESEND_FROM = os.environ.get('RESEND_FROM', 'Postorico <onboarding@resend.dev>')
# Email qui reçoit les notifications internes (nouveaux audits de marque, etc.)
ADMIN_NOTIF_EMAIL = os.environ.get('ADMIN_NOTIF_EMAIL', 'martindumoulin88@gmail.com')
# URL du frontend (pour construire le lien de réinitialisation)
FRONTEND_URL = (os.environ.get('FRONTEND_URL', 'http://localhost:3000')).rstrip('/')
# URL publique du backend (pour le callback OAuth des réseaux) — en prod : l'URL Railway
BACKEND_URL = (os.environ.get('BACKEND_URL', 'http://localhost:8000')).rstrip('/')

# Late / Zernio (publication sociale programmée)
LATE_API_KEY = os.environ.get('LATE_API_KEY') or os.environ.get('api_late', '')
LATE_API_BASE = (os.environ.get('LATE_API_BASE', 'https://getlate.dev/api/v1')).rstrip('/')
LATE_WEBHOOK_SECRET = os.environ.get('LATE_WEBHOOK_SECRET', '')  # vérif signature HMAC des webhooks

# Cron analytics : rafraîchit le cache toutes les N heures (0 = désactivé)
ANALYTICS_CRON_HOURS = float(os.environ.get('ANALYTICS_CRON_HOURS', '1'))

# Stripe (abonnements payants)
STRIPE_SECRET_KEY = os.environ.get('STRIPE_SECRET_KEY', '')
STRIPE_WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET', '')
STRIPE_PRICE_PRO = os.environ.get('STRIPE_PRICE_PRO', '')          # price_xxx (abonnement Pro)
STRIPE_PRICE_BUSINESS = os.environ.get('STRIPE_PRICE_BUSINESS', '')  # price_xxx (abonnement Business)
# Pack Fondations (paiement unique, vendu apres un rendez-vous). Deux devises :
# l'euro pour le marche francophone, le dollar pour l'hispanophone (Colombie).
STRIPE_PRICE_PACK_EUR = os.environ.get('STRIPE_PRICE_PACK_EUR', '')
STRIPE_PRICE_PACK_USD = os.environ.get('STRIPE_PRICE_PACK_USD', '')

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('server')
