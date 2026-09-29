from pydantic import BaseModel
from typing import Optional


class ContenuUpdate(BaseModel):
    statut: Optional[str] = None
    titre: Optional[str] = None
    contenu: Optional[str] = None
    date_publication: Optional[str] = None
    # Instrumentation mémoire (H2) : posés au moment de la validation/du refus,
    # jamais dérivés côté serveur.
    note_ressemblance: Optional[int] = None
    motif_refus: Optional[str] = None
