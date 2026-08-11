from pydantic import BaseModel, EmailStr
from typing import Optional


class UserRegister(BaseModel):
    nom: str
    email: EmailStr
    username: Optional[str] = None
    password: str
    langue: Optional[str] = None  # langue de l'interface à l'inscription -> langue du contenu (fr | en | es)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class AdminLogin(BaseModel):
    email: EmailStr
    password: str
