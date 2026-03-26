from pydantic import BaseModel
from typing import Optional


class ContenuUpdate(BaseModel):
    statut: Optional[str] = None
    titre: Optional[str] = None
    contenu: Optional[str] = None
    date_publication: Optional[str] = None
