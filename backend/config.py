import os
import logging
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')
load_dotenv(ROOT_DIR.parent / '.env')  # .env à la racine du projet (contient api_claude)

# Supabase
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_ANON_KEY')
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Secrets
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'admin123')
N8N_WEBHOOK_BASE = os.environ.get('N8N_WEBHOOK_BASE', 'https://n8n.srv903010.hstgr.cloud/webhook')
CORS_ORIGINS = os.environ.get('CORS_ORIGINS', '*').split(',')

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
CLOUDINARY_CLOUD_NAME = os.environ.get('CLOUDINARY_CLOUD_NAME', '')
CLOUDINARY_API_KEY = os.environ.get('CLOUDINARY_API_KEY', '')
CLOUDINARY_API_SECRET = os.environ.get('CLOUDINARY_API_SECRET', '')

# Resend (envoi d'emails — mot de passe oublié)
RESEND_API_KEY = os.environ.get('RESEND_API_KEY') or os.environ.get('api_resend', '')
RESEND_FROM = os.environ.get('RESEND_FROM', 'PresenceOS <onboarding@resend.dev>')
# URL du frontend (pour construire le lien de réinitialisation)
FRONTEND_URL = (os.environ.get('FRONTEND_URL', 'http://localhost:3000')).rstrip('/')

# Late / Zernio (publication sociale programmée)
LATE_API_KEY = os.environ.get('LATE_API_KEY') or os.environ.get('api_late', '')
LATE_API_BASE = (os.environ.get('LATE_API_BASE', 'https://getlate.dev/api/v1')).rstrip('/')
LATE_WEBHOOK_SECRET = os.environ.get('LATE_WEBHOOK_SECRET', '')  # vérif signature HMAC des webhooks

# Stripe (abonnements payants)
STRIPE_SECRET_KEY = os.environ.get('STRIPE_SECRET_KEY', '')
STRIPE_WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET', '')
STRIPE_PRICE_PRO = os.environ.get('STRIPE_PRICE_PRO', '')          # price_xxx (abonnement Pro)
STRIPE_PRICE_BUSINESS = os.environ.get('STRIPE_PRICE_BUSINESS', '')  # price_xxx (abonnement Business)

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('server')
