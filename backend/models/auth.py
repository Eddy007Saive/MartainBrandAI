from pydantic import BaseModel, EmailStr
from typing import Optional


class UserRegister(BaseModel):
    telegram_id: Optional[int] = None
    nom: str
    email: EmailStr
    username: Optional[str] = None
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class AdminLogin(BaseModel):
    password: str
