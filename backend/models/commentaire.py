from pydantic import BaseModel
from typing import Optional


class CommentaireUpdate(BaseModel):
    statut: Optional[str] = None
    reponse_ia: Optional[str] = None
