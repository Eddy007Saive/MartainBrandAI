from pydantic import BaseModel
from typing import Optional


class UserUpdate(BaseModel):
    nom: Optional[str] = None
    username: Optional[str] = None
    # Voix de marque (nourrit les agents du Studio IA)
    secteur: Optional[str] = None
    voix_marque: Optional[str] = None
    audience: Optional[str] = None
    piliers: Optional[str] = None
    a_eviter: Optional[str] = None
    hooks: Optional[str] = None
    ctas: Optional[str] = None
    regles: Optional[str] = None
    # Exemples de posts par réseau (few-shot : calibre le style)
    exemples_linkedin: Optional[str] = None
    exemples_instagram: Optional[str] = None
    exemples_facebook: Optional[str] = None
    exemples_tiktok: Optional[str] = None
    photo_url: Optional[str] = None
    use_photo: Optional[bool] = None
    use_inspirations: Optional[bool] = None
    user_name: Optional[str] = None
    style_vestimentaire: Optional[str] = None
    sexe: Optional[str] = None
    couleur_principale: Optional[str] = None
    couleur_secondaire: Optional[str] = None
    couleur_accent: Optional[str] = None
    api_key_gemini: Optional[str] = None
    late_profile_id: Optional[str] = None
    late_account_linkedin: Optional[str] = None
    late_account_instagram: Optional[str] = None
    late_account_facebook: Optional[str] = None
    late_account_tiktok: Optional[str] = None
    gpt_url_linkedin: Optional[str] = None
    gpt_url_instagram: Optional[str] = None
    gpt_url_sujets: Optional[str] = None
    gpt_url_default: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    telegram_bot_username: Optional[str] = None


class UserResponse(BaseModel):
    telegram_id: Optional[int] = None
    nom: str
    username: Optional[str] = None
    email: str
    actif: bool = False
    photo_url: Optional[str] = None
    use_photo: Optional[bool] = None
    use_inspirations: Optional[bool] = None
    user_name: Optional[str] = None
    style_vestimentaire: Optional[str] = None
    sexe: Optional[str] = None
    couleur_principale: Optional[str] = None
    couleur_secondaire: Optional[str] = None
    couleur_accent: Optional[str] = None
    api_key_gemini: Optional[str] = None
    late_profile_id: Optional[str] = None
    late_account_linkedin: Optional[str] = None
    late_account_instagram: Optional[str] = None
    late_account_facebook: Optional[str] = None
    late_account_tiktok: Optional[str] = None
    gpt_url_linkedin: Optional[str] = None
    gpt_url_instagram: Optional[str] = None
    gpt_url_sujets: Optional[str] = None
    gpt_url_default: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    telegram_bot_username: Optional[str] = None
    created_at: Optional[str] = None


class SocialConnectRequest(BaseModel):
    platform: str
