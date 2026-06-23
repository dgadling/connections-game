from __future__ import annotations
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, TIMESTAMP, ForeignKey,
    UniqueConstraint, CheckConstraint, Index
)
from sqlalchemy.orm import relationship
from datetime import datetime
from .db import Base

def now():
    return datetime.utcnow()

class DiscordUser(Base):
    __tablename__ = "discord_users"
    discord_id = Column(String, primary_key=True)
    username = Column(String, nullable=False)
    global_name = Column(String, nullable=True)
    avatar_hash = Column(String, nullable=True)
    last_seen = Column(TIMESTAMP, default=now, nullable=False)
    created_at = Column(TIMESTAMP, default=now, nullable=False)

class AuthSession(Base):
    __tablename__ = "auth_sessions"
    id = Column(Integer, primary_key=True)
    session_token_hash = Column(String, unique=True, nullable=False)
    discord_id = Column(String, ForeignKey("discord_users.discord_id", ondelete="CASCADE"), nullable=False)
    created_at = Column(TIMESTAMP, default=now, nullable=False)
    expires_at = Column(TIMESTAMP, nullable=False)
    absolute_expires_at = Column(TIMESTAMP, nullable=False)
    last_used_at = Column(TIMESTAMP, default=now, nullable=False)

class OAuthState(Base):
    __tablename__ = "oauth_states"
    state_token = Column(String, primary_key=True)
    redirect_after = Column(String, nullable=True)
    created_at = Column(TIMESTAMP, default=now, nullable=False)
    expires_at = Column(TIMESTAMP, nullable=False)

class Game(Base):
    __tablename__ = "games"
    id = Column(Integer, primary_key=True)
    slug = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    owner_discord_id = Column(String, ForeignKey("discord_users.discord_id"), nullable=False)
    created_at = Column(TIMESTAMP, default=now, nullable=False)
    archived_at = Column(TIMESTAMP, nullable=True)

class GameInvite(Base):
    __tablename__ = "game_invites"
    id = Column(Integer, primary_key=True)
    token_hash = Column(String, unique=True, nullable=False)
    game_id = Column(Integer, ForeignKey("games.id", ondelete="CASCADE"), nullable=False)
    created_by = Column(String, ForeignKey("discord_users.discord_id"), nullable=False)
    created_at = Column(TIMESTAMP, default=now, nullable=False)
    expires_at = Column(TIMESTAMP, nullable=False)
    used_by = Column(String, ForeignKey("discord_users.discord_id"), nullable=True)
    used_at = Column(TIMESTAMP, nullable=True)
    revoked_at = Column(TIMESTAMP, nullable=True)

class GameMembership(Base):
    __tablename__ = "game_memberships"
    game_id = Column(Integer, ForeignKey("games.id", ondelete="CASCADE"), primary_key=True)
    discord_id = Column(String, ForeignKey("discord_users.discord_id", ondelete="CASCADE"), primary_key=True)
    role = Column(String, nullable=False)
    joined_at = Column(TIMESTAMP, default=now, nullable=False)
    __table_args__ = (
        CheckConstraint("role IN ('owner','admin')", name="ck_membership_role"),
    )

class GameMember(Base):
    __tablename__ = "game_members"
    id = Column(Integer, primary_key=True)
    game_id = Column(Integer, ForeignKey("games.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    discord_id = Column(String, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(TIMESTAMP, default=now, nullable=False)
    deleted_at = Column(TIMESTAMP, nullable=True)
    __table_args__ = (
        UniqueConstraint("game_id", "name", name="uq_game_member_name_active"),
        # partial unique index for discord_id created in migration, can't express WHERE in ORM easily
        Index("ix_game_members_game_discord", "game_id", "discord_id"),
    )

class ConnQuestion(Base):
    __tablename__ = "conn_questions"
    id = Column(Integer, primary_key=True)
    game_id = Column(Integer, ForeignKey("games.id", ondelete="CASCADE"), nullable=False)
    text = Column(Text, nullable=False)
    tag = Column(String, nullable=False)
    tag_auto = Column(Boolean, default=True, nullable=False)
    status = Column(String, nullable=False, default="upcoming")
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(TIMESTAMP, default=now, nullable=False)
    updated_at = Column(TIMESTAMP, default=now, nullable=False)
    __table_args__ = (
        CheckConstraint("length(text) <= 500", name="ck_question_len"),
        CheckConstraint("tag IN ('warm','secretive','reflective','tension','vulnerable','loyal')", name="ck_question_tag"),
        CheckConstraint("status IN ('upcoming','used','graveyard')", name="ck_question_status"),
    )

class ConnQuestionEdit(Base):
    __tablename__ = "conn_question_edits"
    id = Column(Integer, primary_key=True)
    question_id = Column(Integer, ForeignKey("conn_questions.id", ondelete="CASCADE"), nullable=False)
    old_text = Column(Text, nullable=False)
    old_tag = Column(String, nullable=False)
    edited_by = Column(String, ForeignKey("discord_users.discord_id"), nullable=False)
    edited_at = Column(TIMESTAMP, default=now, nullable=False)

class ConnPairing(Base):
    __tablename__ = "conn_pairings"
    id = Column(Integer, primary_key=True)
    game_id = Column(Integer, ForeignKey("games.id", ondelete="CASCADE"), nullable=False)
    round_num = Column(Integer, nullable=False)
    asker_member_id = Column(Integer, ForeignKey("game_members.id", ondelete="RESTRICT"), nullable=False)
    target_member_id = Column(Integer, ForeignKey("game_members.id", ondelete="RESTRICT"), nullable=False)
    __table_args__ = (
        CheckConstraint("asker_member_id != target_member_id", name="ck_no_self_pair"),
        UniqueConstraint("game_id", "round_num", "asker_member_id", name="uq_pairing_asker"),
        UniqueConstraint("game_id", "round_num", "target_member_id", name="uq_pairing_target"),
    )

class ConnPlay(Base):
    __tablename__ = "conn_plays"
    id = Column(Integer, primary_key=True)
    game_id = Column(Integer, ForeignKey("games.id", ondelete="CASCADE"), nullable=False)
    round_num = Column(Integer, nullable=False)
    question_id = Column(Integer, ForeignKey("conn_questions.id", ondelete="SET NULL"), nullable=True)
    played_at = Column(TIMESTAMP, default=now, nullable=False)
    played_by = Column(String, ForeignKey("discord_users.discord_id"), nullable=False)
    __table_args__ = (
        UniqueConstraint("game_id", "round_num", name="uq_play_round"),
    )

class ConnState(Base):
    __tablename__ = "conn_state"
    game_id = Column(Integer, ForeignKey("games.id", ondelete="CASCADE"), primary_key=True)
    current_round = Column(Integer, default=1, nullable=False)
    current_question_id = Column(Integer, ForeignKey("conn_questions.id", ondelete="SET NULL"), nullable=True)
    updated_at = Column(TIMESTAMP, default=now, nullable=False)
