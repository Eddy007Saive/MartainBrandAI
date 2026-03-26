from pydantic import BaseModel
from typing import Optional


class AvatarCreateRequest(BaseModel):
    avatar_name: str


class AvatarStatusResponse(BaseModel):
    avatar_id: str
    avatar_name: Optional[str] = None
    status: str  # in_progress, complete, failed
    preview_image_url: Optional[str] = None
    preview_video_url: Optional[str] = None
    error_message: Optional[str] = None
    training_video_url: Optional[str] = None
    consent_video_url: Optional[str] = None
