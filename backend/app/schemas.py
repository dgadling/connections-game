from __future__ import annotations
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, Literal
from datetime import datetime
from . import validators as v

QuestionTag = Literal["warm", "secretive", "reflective", "tension", "vulnerable", "loyal"]

class _BaseModel(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

class _OutModel(BaseModel):
    model_config = ConfigDict(extra='forbid', from_attributes=True)

# --- common response ---

class OkResponse(_BaseModel):
    ok: bool = True

# --- games ---

class GameCreate(_BaseModel):
    name: str = Field(..., min_length=1, max_length=200)

    @field_validator('name')
    @classmethod
    def validate_name(cls, s: str) -> str:
        s = s.strip()
        if not s:
            raise ValueError('name must not be empty')
        return s

class GamePatchRequest(_BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    discord_role_id: Optional[str] = Field(None, max_length=64)

    @field_validator('name')
    @classmethod
    def validate_name(cls, s: Optional[str]) -> Optional[str]:
        if s is None:
            return None
        s = s.strip()
        if not s:
            raise ValueError('name must not be empty')
        return s

    @field_validator('discord_role_id')
    @classmethod
    def validate_role(cls, s: Optional[str]) -> Optional[str]:
        try:
            return v.normalize_discord_role_id(s)
        except ValueError as e:
            raise ValueError(str(e)) from e

class GameOut(_OutModel):
    id: int
    name: str
    owner_discord_id: str
    discord_role_id: Optional[str] = None
    archived_at: Optional[datetime] = None

# --- members ---

class MemberCreate(_BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    discord_id: Optional[str] = Field(None, max_length=64)

    @field_validator('name')
    @classmethod
    def validate_name(cls, s: str) -> str:
        s = s.strip()
        if not s:
            raise ValueError('name must not be empty')
        return s

    @field_validator('discord_id', mode='before')
    @classmethod
    def normalize_discord(cls, val):
        # Accept empty string -> None (back-compat with existing tests / API)
        if isinstance(val, str):
            val = val.strip()
            if not val:
                return None
        try:
            return v.normalize_discord_id_optional(val)
        except ValueError as e:
            raise ValueError(str(e)) from e

class MemberPatch(_BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    discord_id: Optional[str] = Field(None, max_length=64)

    @field_validator('name')
    @classmethod
    def validate_name(cls, s: Optional[str]) -> Optional[str]:
        if s is None:
            return None
        s = s.strip()
        if not s:
            raise ValueError('name must not be empty')
        return s

    @field_validator('discord_id', mode='before')
    @classmethod
    def normalize_discord(cls, val):
        # Allow explicit None to clear; empty string -> None
        if isinstance(val, str):
            val = val.strip()
            if not val:
                return None
        try:
            return v.normalize_discord_id_optional(val)
        except ValueError as e:
            raise ValueError(str(e)) from e

class MemberOut(_OutModel):
    id: int
    game_id: int
    name: str
    discord_id: Optional[str] = None
    deleted_at: Optional[datetime] = None

# response models matching current API shapes
class MemberResponse(_OutModel):
    id: int
    game_id: int
    name: str
    discord_id: Optional[str] = None

class MemberListItem(BaseModel):
    id: int
    game_id: int
    name: str
    discord_id: Optional[str] = None
    sort_order: int
    created_at: datetime
    deleted_at: Optional[datetime] = None
    model_config = ConfigDict(extra='forbid', from_attributes=True)

# --- questions ---

class QuestionCreate(_BaseModel):
    text: str = Field(..., min_length=1, max_length=500)

    @field_validator('text')
    @classmethod
    def validate_text(cls, s: str) -> str:
        s = s.strip()
        if not s:
            raise ValueError('text must not be empty')
        return s

class QuestionPatch(_BaseModel):
    text: Optional[str] = Field(None, min_length=1, max_length=500)
    tag: Optional[QuestionTag] = None
    tag_auto: Optional[bool] = None

    @field_validator('text')
    @classmethod
    def validate_text(cls, s: Optional[str]) -> Optional[str]:
        if s is None:
            return None
        s = s.strip()
        if not s:
            raise ValueError('text must not be empty')
        return s

class QuestionImport(_BaseModel):
    questions: list[str] = Field(..., min_length=1)

    @field_validator('questions')
    @classmethod
    def validate_questions(cls, items: list[str]) -> list[str]:
        cleaned = []
        for q in items:
            if not isinstance(q, str):
                raise ValueError('each question must be a string')
            qs = q.strip()
            if not qs:
                raise ValueError('question text must not be empty')
            if len(qs) > 500:
                raise ValueError('question text must be <= 500 characters')
            cleaned.append(qs)
        if not cleaned:
            raise ValueError('questions list must not be empty')
        return cleaned

class QuestionOut(_OutModel):
    id: int
    game_id: int
    text: str
    tag: QuestionTag
    tag_auto: bool
    status: str
    sort_order: int
    edit_count: int = 0

class QuestionListItem(BaseModel):
    id: int
    game_id: int
    text: str
    tag: QuestionTag
    tag_auto: bool
    status: str
    sort_order: int
    edit_count: int = 0
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(extra='forbid', from_attributes=True)

class QuestionCreateResponse(BaseModel):
    question_id: int
    tag: QuestionTag
    tag_auto: bool
    model_config = ConfigDict(extra='forbid')

class QuestionPatchResponse(BaseModel):
    id: int
    text: str
    tag: QuestionTag
    tag_auto: bool
    status: str
    sort_order: int
    model_config = ConfigDict(extra='forbid', from_attributes=True)

class QuestionHistoryItem(BaseModel):
    id: int
    question_id: int
    old_text: str
    old_tag: str
    edited_by: str
    edited_by_name: Optional[str] = None
    edited_at: datetime
    model_config = ConfigDict(extra='forbid')

class ImportQuestionsResponse(BaseModel):
    inserted: int
    skipped: int
    model_config = ConfigDict(extra='forbid')

class RecycleResponse(BaseModel):
    recycled_count: int
    model_config = ConfigDict(extra='forbid')

class SeedResponse(BaseModel):
    inserted: int
    total_bank: int
    model_config = ConfigDict(extra='forbid')

class ExportQuestionItem(BaseModel):
    text: str
    tag: QuestionTag
    status: str
    sort_order: int
    model_config = ConfigDict(extra='forbid')

# --- invites / join ---

class JoinRequest(_BaseModel):
    invite_token: str = Field(..., min_length=1, max_length=200)

    @field_validator('invite_token')
    @classmethod
    def validate_token(cls, s: str) -> str:
        s = s.strip()
        if not s:
            raise ValueError('invite_token must not be empty')
        return s

class JoinGameResponse(BaseModel):
    game_id: int
    name: str
    archived_at: Optional[datetime] = None
    discord_role_id: Optional[str] = None
    model_config = ConfigDict(extra='forbid')

class InviteCreateResponse(BaseModel):
    id: int
    invite_token: str
    expires_at: datetime
    model_config = ConfigDict(extra='forbid')

class InviteListItem(BaseModel):
    id: int
    token_prefix: str
    created_at: datetime
    expires_at: datetime
    model_config = ConfigDict(extra='forbid')

# --- admin ---

class AdminListItem(BaseModel):
    discord_id: str
    joined_at: datetime
    username: str
    global_name: Optional[str] = None
    model_config = ConfigDict(extra='forbid')

# --- rounds / pairings / history ---

class PairingItem(BaseModel):
    asker_id: int
    asker_name: str
    asker_discord_id: Optional[str] = None
    target_id: int
    target_name: str
    target_discord_id: Optional[str] = None
    model_config = ConfigDict(extra='forbid')

class RoundQuestionOut(BaseModel):
    id: int
    text: str
    tag: QuestionTag
    tag_auto: bool
    status: str
    model_config = ConfigDict(extra='forbid', from_attributes=True)

class GetRoundResponse(BaseModel):
    round_num: int
    question: Optional[RoundQuestionOut] = None
    pairings: list[PairingItem]
    model_config = ConfigDict(extra='forbid')

class CompleteRoundResponse(BaseModel):
    ok: bool = True
    next_round: int
    model_config = ConfigDict(extra='forbid')

class HistoryItem(BaseModel):
    round_num: int
    played_at: datetime
    played_by: str
    played_by_username: Optional[str] = None
    question_id: Optional[int] = None
    question_text: Optional[str] = None
    question_tag: Optional[str] = None
    pairings: list[PairingItem]
    model_config = ConfigDict(extra='forbid')

class GetPairingsResponse(BaseModel):
    round_num: int
    pairings: list[PairingItem]
    model_config = ConfigDict(extra='forbid')

# --- reorder ---

class ReorderRequest(_BaseModel):
    question_ids: list[int] = Field(..., min_length=1)
