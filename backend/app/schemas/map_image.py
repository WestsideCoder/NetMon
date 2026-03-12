# SPDX-License-Identifier: GPL-3.0-or-later
from typing import Optional, List
from pydantic import BaseModel, computed_field
from app.schemas import UTCDatetime


class MapImageResponse(BaseModel):
    id: int
    name: str
    filename: str
    file_path: str
    file_size: int
    content_type: str
    uploaded_by: Optional[int] = None
    created_at: UTCDatetime

    @computed_field
    @property
    def url(self) -> str:
        return f"/uploads/{self.file_path}"

    class Config:
        from_attributes = True


class MapImageListResponse(BaseModel):
    items: List[MapImageResponse]
    total: int
