from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class GameCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)

class GameOut(BaseModel):
    id: int
    slug: str
    name: str
    owner_discord_id: str
    archived_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class MemberCreate(BaseModel):
    name: str
    discord_id: Optional[str] = None

class MemberPatch(BaseModel):
    name: Optional[str] = None
    discord_id: Optional[str] = None

class MemberOut(BaseModel):
    id: int
    game_id: int
    name: str
    discord_id: Optional[str]
    deleted_at: Optional[datetime]
    class Config:
        from_attributes = True

class QuestionCreate(BaseModel):
    text: str = Field(..., max_length=500)

class QuestionPatch(BaseModel):
    text: Optional[str] = Field(None, max_length=500)
    tag: Optional[str] = None
    tag_auto: Optional[bool] = None

class QuestionImport(BaseModel):
    questions: list[str] = Field(..., min_length=1)
    # accepts raw list of question strings; tags are auto-classified

class QuestionOut(BaseModel):
    id: int
    game_id: int
    text: str
    tag: str
    tag_auto: bool
    status: str
    sort_order: int
    class Config:
        from_attributes = True

class ClaimRequest(BaseModel):
    member_id: Optional[int] = None
    name: Optional[str] = None

class JoinRequest(BaseModel):
    invite_token: str

class ReorderRequest(BaseModel):
    question_ids: list[int]
