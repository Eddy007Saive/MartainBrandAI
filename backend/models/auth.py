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
    appareil: Optional[str] = None   # secret « appareil de confiance » gardé par le navigateur


class CodeVerifier(BaseModel):
    jeton: str                 # jeton d'attente rendu par /login quand code_requis
    code: str
    confiance: bool = False    # marquer cet appareil de confiance (30 jours)


class CodeRenvoyer(BaseModel):
    jeton: str


class GoogleLogin(BaseModel):
    # Jeton d'accès Google obtenu dans le navigateur (google.accounts.oauth2) ;
    # le serveur le vérifie auprès de Google, jamais le contraire.
    access_token: str
    langue: Optional[str] = None
    fuseau: Optional[str] = None
    ref: Optional[str] = None


class GoogleLogin(BaseModel):
    # Jeton d'accès Google obtenu dans le navigateur (google.accounts.oauth2) ;
    # le serveur le vérifie auprès de Google, jamais le contraire.
    access_token: str
    langue: Optional[str] = None
    fuseau: Optional[str] = None
    ref: Optional[str] = None


class AdminLogin(BaseModel):
    email: EmailStr
    password: str
    appareil: Optional[str] = None
