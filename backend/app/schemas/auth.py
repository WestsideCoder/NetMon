# SPDX-License-Identifier: GPL-3.0-or-later
from typing import Optional
from pydantic import BaseModel, EmailStr, Field
from app.models.user import UserRole, AuthSource
from app.schemas import UTCDatetime


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class RefreshRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    full_name: Optional[str] = Field(None, max_length=200)
    role: UserRole = UserRole.VIEWER


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: Optional[str]
    role: UserRole
    auth_source: AuthSource
    is_active: bool
    must_change_password: bool = False
    created_at: UTCDatetime
    last_login: Optional[UTCDatetime]

    class Config:
        from_attributes = True


TokenResponse.model_rebuild()
