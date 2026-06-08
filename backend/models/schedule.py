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


class ScheduleUpdate(BaseModel):
    schedules: List[ScheduleItem]
