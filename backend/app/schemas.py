from __future__ import annotations
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Literal
from datetime import datetime

QuestionTag = Literal["warm", "secretive", "reflective", "tension", "vulnerable", "loyal"]

class _BaseModel(BaseModel):
    model_config = ConfigDict(extra='forbid')

class _OutModel(BaseModel):
    model_config = ConfigDict(extra='forbid', from_attributes=True)

class GameCreate(_BaseModel):
    name: str = Field(..., min_length=1, max_length=200)

class GameOut(_OutModel):
    id: int
    name: str
    owner_discord_id: str
    discord_role_id: Optional[str] = None
    archived_at: Optional[datetime] = None

class MemberCreate(_BaseModel):
    name: str
    discord_id: Optional[str] = None

class MemberPatch(_BaseModel):
    name: Optional[str] = None
    discord_id: Optional[str] = None

class MemberOut(_OutModel):
    id: int
    game_id: int
    name: str
    discord_id: Optional[str] = None
    deleted_at: Optional[datetime]

class QuestionCreate(_BaseModel):
    text: str = Field(..., max_length=500)

class QuestionPatch(_BaseModel):
    text: Optional[str] = Field(None, max_length=500)
    tag: Optional[QuestionTag] = None
    tag_auto: Optional[bool] = None

class QuestionImport(_BaseModel):
    questions: list[str] = Field(..., min_length=1)
    # accepts raw list of question strings; tags are auto-classified

class QuestionOut(_OutModel):
    id: int
    game_id: int
    text: str
    tag: QuestionTag
    tag_auto: bool
    status: str
    sort_order: int
    edit_count: int = 0

class JoinRequest(_BaseModel):
    invite_token: str

class ReorderRequest(_BaseModel):
    question_ids: list[int]
