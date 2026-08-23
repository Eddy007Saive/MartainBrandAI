from pydantic import BaseModel, EmailStr
from typing import Optional


class UserRegister(BaseModel):
    nom: str
    email: EmailStr
    username: Optional[str] = None
    password: str
    langue: Optional[str] = None  # langue de l'interface à l'inscription -> langue du contenu (fr | en | es)
    ref: Optional[str] = None     # code d'affiliation capté dans l'URL (?ref=CODE)
    # Fuseau du navigateur (« Europe/Madrid », « America/Bogota »). Il donne le
    # PAYS, ce que la langue ne sait pas faire : un Espagnol et un Colombien
    # ecrivent tous deux « es » et n'ont ni la meme monnaie ni la meme heure.
    fuseau: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class AdminLogin(BaseModel):
    email: EmailStr
    password: str
