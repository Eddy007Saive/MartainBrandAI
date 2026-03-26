from pydantic import BaseModel
from typing import List


class ScheduleItem(BaseModel):
    platform: str
    frequency: str = "weekly"
    days_of_week: List[int] = []
    preferred_time: str = "09:00"
    is_active: bool = True


class ScheduleUpdate(BaseModel):
    schedules: List[ScheduleItem]
