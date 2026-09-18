"""Éditeur vidéo manuel : un « montage » = un projet JSON (voir backend/remotion/src/montage/schema.js)
édité dans le navigateur et rendu par la composition Remotion « Montage »."""
from typing import Optional, Any
from pydantic import BaseModel


class MontageCreer(BaseModel):
    titre: Optional[str] = None
    projet: Optional[dict[str, Any]] = None      # absent = projet vide 9:16
    source_contenu_id: Optional[str] = None      # reel ou vidéo d'origine


class MontageModifier(BaseModel):
    titre: Optional[str] = None
    projet: Optional[dict[str, Any]] = None


class MontageRendre(BaseModel):
    reseau: str = "Instagram"
    titre: Optional[str] = None


class MontageResume(BaseModel):
    id: str
    titre: str
    statut: str
    duree_s: float
    video_url: Optional[str] = None
    contenu_id: Optional[str] = None
    updated_at: Optional[str] = None


class MontageTranscrire(BaseModel):
    element_id: str                              # le plan vidéo à sous-titrer
