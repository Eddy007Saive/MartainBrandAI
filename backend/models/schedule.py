from pydantic import BaseModel
from typing import List


class ScheduleItem(BaseModel):
    platform: str
    frequency: str = "weekly"
    days_of_week: List[int] = []
    preferred_time: str = "09:00"
    is_active: bool = True
    format: str = "post"  # post | reel | video
    carrousel_template: str = "bold"  # style des carrousels pour ce réseau
    # Rythme choisi par le client : « cumule » (formats en parallèle, heures
    # décalées) ou « suite » (un seul contenu par jour, tous formats confondus).
    mode_planification: str = "cumule"


class ScheduleUpdate(BaseModel):
    schedules: List[ScheduleItem]
