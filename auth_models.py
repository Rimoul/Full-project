"""Authentication support tables. Does not alter the core models2.py tables."""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func
from database import Base


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    session_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    # Store only a SHA-256 hash of the high-entropy browser token, never the token itself.
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True, index=True)
    user_agent = Column(String(512), nullable=True)

    __table_args__ = (Index("ix_auth_sessions_user_expiry", "user_id", "expires_at"),)


class AuthChallenge(Base):
    __tablename__ = "auth_challenges"

    challenge_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    # email_verification or password_reset
    purpose = Column(String(32), nullable=False, index=True)
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    consumed_at = Column(DateTime(timezone=True), nullable=True, index=True)
    attempts = Column(Integer, nullable=False, default=0)

    __table_args__ = (
        Index("ix_auth_challenge_user_purpose_created", "user_id", "purpose", "created_at"),
    )


class AuthRateLimit(Base):
    __tablename__ = "auth_rate_limits"

    rate_limit_id = Column(Integer, primary_key=True, index=True)
    key_hash = Column(String(64), nullable=False, unique=True, index=True)
    attempts = Column(Integer, nullable=False, default=0)
    window_started_at = Column(DateTime(timezone=True), nullable=False)
    blocked_until = Column(DateTime(timezone=True), nullable=True)

