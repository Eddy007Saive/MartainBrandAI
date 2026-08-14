# Upload des résultats (vidéo + miniature) vers Cloudinary — même compte que
# le reste de MartainBrandAI (clés CLOUDINARY_*, cf. reel_service.py pour le
# même schéma d'upload). Nécessaire en déploiement séparé : le stockage
# local d'un service Railway est ÉPHÉMÈRE (effacé à chaque redéploiement ou
# redémarrage du conteneur) — Cloudinary devient la source persistante,
# le fichier local ne sert plus que de cache le temps du process courant.
import cloudinary
import cloudinary.uploader

import envkeys

_configured = False


def _ensure_configured():
    global _configured
    if not _configured:
        cloudinary.config(
            cloud_name=envkeys.get("CLOUDINARY_CLOUD_NAME"),
            api_key=envkeys.get("CLOUDINARY_API_KEY"),
            api_secret=envkeys.get("CLOUDINARY_API_SECRET"),
        )
        _configured = True


def _upload(path, job_id, resource_type, name):
    """Repli silencieux sur None si l'upload échoue (clés absentes, réseau) —
    l'appelant garde alors le fichier local comme avant, comportement
    inchangé pour le dev local sans configuration Cloudinary."""
    try:
        _ensure_configured()
        up = cloudinary.uploader.upload(
            path, resource_type=resource_type,
            public_id=f"studio-montage/{job_id}/{name}",
            overwrite=True, invalidate=True,
        )
        return up["secure_url"]
    except Exception as e:
        msg = str(e).encode("ascii", "backslashreplace").decode("ascii")
        print(f"[stockage] echec upload {name} ({msg}) -> repli local")
        return None


def upload_video(path, job_id):
    return _upload(path, job_id, "video", "video")


def upload_image(path, job_id):
    return _upload(path, job_id, "image", "thumbnail")


def attachment_url(url):
    """Variante 'téléchargement forcé' d'une URL Cloudinary (l'attribut HTML
    `download` est ignoré par les navigateurs sur un lien cross-origin)."""
    if not url or "res.cloudinary.com" not in url or "/upload/" not in url:
        return url
    return url.replace("/upload/", "/upload/fl_attachment/", 1)
