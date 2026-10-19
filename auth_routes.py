"""Cookie-session authentication routes for the Seazonal Swaad FastAPI backend.

Security notes:
- Argon2id password hashing.
- Opaque random session cookie; only its hash is stored in PostgreSQL.
- Email-verification and password-reset secrets are single-use and time-limited.
- OTPs are HMACed using AUTH_CHALLENGE_SECRET, not stored in plaintext.
- Origin allow-list, login throttling, resend cooldown and OTP attempt limit.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Optional
from urllib.parse import urlencode

from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models3 as models
import schemas4 as schemas
from auth_models import AuthChallenge, AuthRateLimit, AuthSession
from database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])

PASSWORD_HASHER = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2, type=Type.ID)
DUMMY_PASSWORD_HASH = PASSWORD_HASHER.hash("not-a-real-password-used-for-timing-equalization")
SESSION_COOKIE_NAME = os.getenv("SESSION_COOKIE_NAME", "ss_session")
SESSION_TTL_DAYS = max(1, min(int(os.getenv("SESSION_TTL_DAYS", "7")), 30))
ENVIRONMENT = os.getenv("APP_ENV", "development").lower()
COOKIE_SECURE = os.getenv("SESSION_COOKIE_SECURE", "true" if ENVIRONMENT == "production" else "false").lower() == "true"
COOKIE_SAMESITE = os.getenv("SESSION_COOKIE_SAMESITE", "lax").lower()
if COOKIE_SAMESITE not in {"lax", "strict", "none"}:
    COOKIE_SAMESITE = "lax"
if COOKIE_SAMESITE == "none" and not COOKIE_SECURE:
    raise RuntimeError("SameSite=None requires SESSION_COOKIE_SECURE=true")
if ENVIRONMENT == "production" and not COOKIE_SECURE:
    raise RuntimeError("Production authentication requires SESSION_COOKIE_SECURE=true and HTTPS")


class LoginResult(schemas.UserResponse):
    pass


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_dt(value: datetime) -> datetime:
    # SQLite tests may return naive datetimes; PostgreSQL timestamps are timezone-aware.
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _origins() -> set[str]:
    configured = os.getenv("FRONTEND_ORIGINS", "")
    defaults = {
        "http://127.0.0.1:5500", "http://localhost:5500",
        "http://127.0.0.1:5501", "http://localhost:5501",
    }
    values = {x.strip().rstrip("/") for x in configured.split(",") if x.strip()}
    return values or defaults


def require_trusted_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") not in _origins():
        raise HTTPException(status_code=403, detail="Request origin is not allowed.")
    if request.headers.get("sec-fetch-site", "").lower() == "cross-site":
        raise HTTPException(status_code=403, detail="Cross-site request blocked.")


def _challenge_secret() -> bytes:
    secret = os.getenv("AUTH_CHALLENGE_SECRET")
    if not secret or len(secret) < 32 or "CHANGE_ME" in secret:
        raise HTTPException(
            status_code=503,
            detail="Authentication secrets are not configured. Set AUTH_CHALLENGE_SECRET in the server environment.",
        )
    return secret.encode("utf-8")


def hash_password(password: str) -> str:
    return PASSWORD_HASHER.hash(password)


def verify_password(password: str, stored_hash: Optional[str]) -> bool:
    candidate_hash = stored_hash or DUMMY_PASSWORD_HASH
    try:
        valid = PASSWORD_HASHER.verify(candidate_hash, password)
        return bool(stored_hash) and valid
    except InvalidHashError:
        # Legacy/plaintext/corrupt values should fail closed; still do dummy Argon2 work
        # so this path is not dramatically faster than a wrong password.
        try:
            PASSWORD_HASHER.verify(DUMMY_PASSWORD_HASH, password)
        except (VerifyMismatchError, VerificationError, InvalidHashError):
            pass
        return False
    except (VerifyMismatchError, VerificationError):
        return False


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _hash_otp(purpose: str, user_id: int, otp: str) -> str:
    message = f"{purpose}:{user_id}:{otp}".encode("utf-8")
    return hmac.new(_challenge_secret(), message, hashlib.sha256).hexdigest()


def _rate_key(label: str) -> str:
    return hmac.new(_challenge_secret(), label.encode("utf-8"), hashlib.sha256).hexdigest()


def _smtp_send(to_email: str, subject: str, body: str) -> None:
    sender = os.getenv("SENDER_EMAIL")
    password = os.getenv("SENDER_PASSWORD")
    if not sender or not password:
        raise RuntimeError("SENDER_EMAIL and SENDER_PASSWORD must be configured to send email")

    host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    port = int(os.getenv("SMTP_PORT", "465"))
    timeout = float(os.getenv("SMTP_TIMEOUT_SECONDS", "10"))
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = to_email
    message.set_content(body)

    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=timeout) as server:
            server.login(sender, password)
            server.send_message(message)
    else:
        with smtplib.SMTP(host, port, timeout=timeout) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(sender, password)
            server.send_message(message)


def _issue_otp(db: Session, user: models.User, purpose: str, *, cooldown_check: bool = False) -> str:
    now = utcnow()
    if cooldown_check:
        latest = (
            db.query(AuthChallenge)
            .filter(AuthChallenge.user_id == user.user_id, AuthChallenge.purpose == purpose)
            .order_by(AuthChallenge.created_at.desc())
            .first()
        )
        if latest and now - _normalize_dt(latest.created_at) < timedelta(seconds=60):
            raise HTTPException(status_code=429, detail="Please wait before requesting another code.")
        recent_count = db.query(func.count(AuthChallenge.challenge_id)).filter(
            AuthChallenge.user_id == user.user_id,
            AuthChallenge.purpose == purpose,
            AuthChallenge.created_at >= now - timedelta(hours=1),
        ).scalar() or 0
        if recent_count >= 5:
            raise HTTPException(status_code=429, detail="Too many code requests. Try again later.")

    db.query(AuthChallenge).filter(
        AuthChallenge.user_id == user.user_id,
        AuthChallenge.purpose == purpose,
        AuthChallenge.consumed_at.is_(None),
    ).update({AuthChallenge.consumed_at: now}, synchronize_session=False)

    otp = f"{secrets.randbelow(1_000_000):06d}"
    challenge = AuthChallenge(
        user_id=user.user_id,
        purpose=purpose,
        token_hash=_hash_otp(purpose, user.user_id, otp),
        created_at=now,
        expires_at=now + timedelta(minutes=10),
        attempts=0,
    )
    db.add(challenge)
    db.commit()
    return otp


def _get_active_challenge(db: Session, user_id: int, purpose: str) -> Optional[AuthChallenge]:
    return (
        db.query(AuthChallenge)
        .filter(
            AuthChallenge.user_id == user_id,
            AuthChallenge.purpose == purpose,
            AuthChallenge.consumed_at.is_(None),
        )
        .order_by(AuthChallenge.created_at.desc())
        .with_for_update()
        .first()
    )


def _create_session(db: Session, user: models.User, request: Request, response: Response) -> None:
    raw = secrets.token_urlsafe(32)
    expires = utcnow() + timedelta(days=SESSION_TTL_DAYS)
    session = AuthSession(
        user_id=user.user_id,
        token_hash=_hash_token(raw),
        created_at=utcnow(),
        expires_at=expires,
        user_agent=(request.headers.get("user-agent") or "")[:512] or None,
    )
    db.add(session)
    db.commit()
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=raw,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
        max_age=SESSION_TTL_DAYS * 24 * 60 * 60,
    )


def _clear_cookie(response: Response) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        secure=COOKIE_SECURE,
        httponly=True,
        samesite=COOKIE_SAMESITE,
    )


def get_current_session_user(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> models.User:
    raw = request.cookies.get(SESSION_COOKIE_NAME)
    if not raw:
        raise HTTPException(status_code=401, detail="Please log in to continue.")

    active_session = db.query(AuthSession).filter(
        AuthSession.token_hash == _hash_token(raw),
        AuthSession.revoked_at.is_(None),
        AuthSession.expires_at > utcnow(),
    ).first()
    if not active_session:
        _clear_cookie(response)
        raise HTTPException(status_code=401, detail="Your session has expired. Please log in again.")

    user = db.get(models.User, active_session.user_id)
    if not user or not user.is_active or user.deleted_at is not None:
        active_session.revoked_at = utcnow()
        db.commit()
        _clear_cookie(response)
        raise HTTPException(status_code=401, detail="This account is unavailable.")
    return user


def _get_or_create_rate_row(db: Session, key_hash: str, now: datetime) -> AuthRateLimit:
    row = db.query(AuthRateLimit).filter(AuthRateLimit.key_hash == key_hash).with_for_update().first()
    if row:
        return row
    row = AuthRateLimit(key_hash=key_hash, attempts=0, window_started_at=now, blocked_until=None)
    db.add(row)
    try:
        db.flush()
        return row
    except IntegrityError:
        # Two first requests can race to create the same bucket. Keep the winning row.
        db.rollback()
        row = db.query(AuthRateLimit).filter(AuthRateLimit.key_hash == key_hash).with_for_update().first()
        if row:
            return row
        raise


def _consume_ip_limit(
    db: Session,
    request: Request,
    label: str,
    *,
    limit: int,
    window: timedelta,
) -> None:
    """Database-backed per-IP limiter for endpoints that can send mail or allocate accounts."""
    now = utcnow()
    ip = request.client.host if request.client else "unknown"
    key_hash = _rate_key(f"{label}:{ip}")
    row = _get_or_create_rate_row(db, key_hash, now)
    if now - _normalize_dt(row.window_started_at) >= window:
        row.attempts = 0
        row.window_started_at = now
        row.blocked_until = None
    if row.blocked_until and _normalize_dt(row.blocked_until) > now:
        db.commit()
        raise HTTPException(status_code=429, detail="Too many requests. Please wait and try again later.")
    if row.attempts >= limit:
        row.blocked_until = now + window
        db.commit()
        raise HTTPException(status_code=429, detail="Too many requests. Please wait and try again later.")
    row.attempts += 1
    if row.attempts >= limit:
        row.blocked_until = now + window
    db.commit()


def _check_login_rate_limit(db: Session, request: Request, email: str) -> list[tuple[str, int]]:
    now = utcnow()
    ip = request.client.host if request.client else "unknown"
    raw_keys = [
        (f"login-ip:{ip}", 30),
        (f"login-id-ip:{ip}:{email.lower()}", 8),
    ]
    keys = [(_rate_key(key), limit) for key, limit in raw_keys]
    for key_hash, limit in keys:
        row = _get_or_create_rate_row(db, key_hash, now)
        window_start = _normalize_dt(row.window_started_at)
        if now - window_start >= timedelta(minutes=15):
            row.attempts = 0
            row.window_started_at = now
            row.blocked_until = None
        if row.blocked_until and _normalize_dt(row.blocked_until) > now:
            db.commit()
            raise HTTPException(status_code=429, detail="Too many login attempts. Please wait and try again.")
        if row.attempts >= limit:
            row.blocked_until = now + timedelta(minutes=15)
            db.commit()
            raise HTTPException(status_code=429, detail="Too many login attempts. Please wait and try again.")
    db.commit()
    return keys


def _record_login_failure(db: Session, keys: list[tuple[str, int]]) -> None:
    now = utcnow()
    for key_hash, limit in keys:
        row = db.query(AuthRateLimit).filter(AuthRateLimit.key_hash == key_hash).with_for_update().first()
        if row:
            row.attempts += 1
            if row.attempts >= limit:
                row.blocked_until = now + timedelta(minutes=15)
    db.commit()


def _clear_login_failures(db: Session, keys: list[tuple[str, int]]) -> None:
    now = utcnow()
    for key_hash, _ in keys:
        row = db.query(AuthRateLimit).filter(AuthRateLimit.key_hash == key_hash).with_for_update().first()
        if row:
            row.attempts = 0
            row.window_started_at = now
            row.blocked_until = None
    db.commit()


def _public_user(user: models.User) -> schemas.UserResponse:
    return schemas.UserResponse.model_validate(user)


@router.post("/register", status_code=status.HTTP_202_ACCEPTED, dependencies=[Depends(require_trusted_origin)])
def register_user(payload: schemas.UserCreate, request: Request, db: Session = Depends(get_db)):
    _consume_ip_limit(db, request, "register-ip", limit=12, window=timedelta(hours=1))
    email = str(payload.email).strip().lower()
    existing = db.query(models.User).filter(models.User.email == email).first()
    now = utcnow()

    if existing and (existing.email_verified or existing.deleted_at is not None or not existing.is_active):
        raise HTTPException(status_code=409, detail="An account with this email already exists. Try logging in or resetting your password.")

    if existing:
        # Never silently replace credentials for an unverified account without proof of mailbox ownership.
        user = existing
        otp = _issue_otp(db, user, "email_verification", cooldown_check=True)
        message = "This email has a pending signup. A verification code was sent if the email delivery service is configured."
    else:
        user = models.User(
            first_name=payload.first_name,
            last_name=payload.last_name,
            email=email,
            password_hash=hash_password(payload.password),
            auth_provider="local",
            email_verified=False,
            mobile_verified=False,
            is_active=True,
        )
        db.add(user)
        try:
            db.flush()
            otp = _issue_otp(db, user, "email_verification")
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(status_code=409, detail="An account with this email already exists. Try logging in or resetting your password.") from exc
        except Exception:
            db.rollback()
            raise
        message = "Account created. Enter the verification code sent to your email."

    try:
        _smtp_send(email, "Verify your Seasonal Swaad account", f"Your Seasonal Swaad verification code is {otp}. It expires in 10 minutes. If you did not request this, you can ignore this email.")
    except Exception as exc:
        logger.exception("Verification email delivery failed")
        raise HTTPException(status_code=503, detail="Your account request was saved, but we could not send the email. Check mail configuration and use Resend verification.") from exc

    return {"message": message, "email": email}


@router.post("/verify-email", response_model=schemas.UserResponse, dependencies=[Depends(require_trusted_origin)])
def verify_email(payload: schemas.OTPVerify, request: Request, response: Response, db: Session = Depends(get_db)):
    email = str(payload.email).strip().lower()
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user or not user.is_active or user.deleted_at is not None:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code.")
    if user.email_verified:
        raise HTTPException(status_code=400, detail="This email is already verified. Please log in.")

    challenge = _get_active_challenge(db, user.user_id, "email_verification")
    if not challenge or _normalize_dt(challenge.expires_at) <= utcnow():
        if challenge:
            challenge.consumed_at = utcnow()
            db.commit()
        raise HTTPException(status_code=400, detail="Invalid or expired verification code. Request a new code.")

    expected = _hash_otp("email_verification", user.user_id, payload.otp_code)
    if not hmac.compare_digest(challenge.token_hash, expected):
        challenge.attempts += 1
        if challenge.attempts >= 5:
            challenge.consumed_at = utcnow()
        db.commit()
        raise HTTPException(status_code=400, detail="Invalid or expired verification code.")

    now = utcnow()
    challenge.consumed_at = now
    user.email_verified = True
    user.email_otp = None
    user.email_otp_expires = None
    db.query(AuthChallenge).filter(
        AuthChallenge.user_id == user.user_id,
        AuthChallenge.purpose == "email_verification",
        AuthChallenge.consumed_at.is_(None),
    ).update({AuthChallenge.consumed_at: now}, synchronize_session=False)
    db.commit()
    _create_session(db, user, request, response)
    return _public_user(user)


@router.post("/resend-verification", status_code=status.HTTP_202_ACCEPTED, dependencies=[Depends(require_trusted_origin)])
def resend_verification(payload: schemas.OTPResend, db: Session = Depends(get_db)):
    email = str(payload.email).strip().lower()
    user = db.query(models.User).filter(models.User.email == email).first()
    # Same response for unknown and verified addresses to avoid email discovery.
    if user and user.is_active and user.deleted_at is None and not user.email_verified:
        try:
            otp = _issue_otp(db, user, "email_verification", cooldown_check=True)
            _smtp_send(email, "Your Seasonal Swaad verification code", f"Your new verification code is {otp}. It expires in 10 minutes.")
        except HTTPException as exc:
            # Avoid letting different HTTP codes disclose whether an email has a pending account.
            if exc.status_code != 429:
                raise
        except Exception:
            logger.exception("Verification resend delivery failed")
    return {"message": "If this account needs verification, an email will be sent when eligible."}


@router.post("/login", response_model=schemas.UserResponse, dependencies=[Depends(require_trusted_origin)])
def login(payload: schemas.UserLogin, request: Request, response: Response, db: Session = Depends(get_db)):
    email = str(payload.email).strip().lower()
    rate_keys = _check_login_rate_limit(db, request, email)
    user = db.query(models.User).filter(models.User.email == email).first()
    valid = verify_password(payload.password, user.password_hash if user else None)

    if not user or not valid or not user.is_active or user.deleted_at is not None:
        _record_login_failure(db, rate_keys)
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if not user.email_verified:
        # Do not create an authenticated session until the mailbox is verified.
        raise HTTPException(status_code=403, detail="Please verify your email before logging in.")

    _clear_login_failures(db, rate_keys)
    _create_session(db, user, request, response)
    return _public_user(user)


@router.get("/me", response_model=schemas.UserResponse)
def current_user(user: models.User = Depends(get_current_session_user)):
    return _public_user(user)


@router.post("/logout", dependencies=[Depends(require_trusted_origin)])
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    raw = request.cookies.get(SESSION_COOKIE_NAME)
    if raw:
        active = db.query(AuthSession).filter(
            AuthSession.token_hash == _hash_token(raw),
            AuthSession.revoked_at.is_(None),
        ).first()
        if active:
            active.revoked_at = utcnow()
            db.commit()
    _clear_cookie(response)
    return {"message": "You have been logged out."}


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED, dependencies=[Depends(require_trusted_origin)])
def forgot_password(payload: schemas.PasswordResetRequest, request: Request, db: Session = Depends(get_db)):
    # A simple hashed IP bucket limits email flooding; the response never confirms account existence.
    ip = request.client.host if request.client else "unknown"
    now = utcnow()
    key_hash = _rate_key(f"password-reset-ip:{ip}")
    row = _get_or_create_rate_row(db, key_hash, now)
    if now - _normalize_dt(row.window_started_at) >= timedelta(hours=1):
        row.attempts = 0
        row.window_started_at = now
        row.blocked_until = None
    if row.blocked_until and _normalize_dt(row.blocked_until) > now:
        db.commit()
        # Same outward response to reduce account-existence leakage.
        return {"message": "If an eligible account exists, password reset instructions will be sent."}
    row.attempts += 1
    if row.attempts >= 10:
        row.blocked_until = now + timedelta(hours=1)
    db.commit()

    email = str(payload.email).strip().lower()
    user = db.query(models.User).filter(models.User.email == email).first()
    if user and user.is_active and user.deleted_at is None and user.email_verified and user.password_hash:
        recent_count = db.query(func.count(AuthChallenge.challenge_id)).filter(
            AuthChallenge.user_id == user.user_id,
            AuthChallenge.purpose == "password_reset",
            AuthChallenge.created_at >= now - timedelta(hours=1),
        ).scalar() or 0
        last = (
            db.query(AuthChallenge).filter(
                AuthChallenge.user_id == user.user_id,
                AuthChallenge.purpose == "password_reset",
            ).order_by(AuthChallenge.created_at.desc()).first()
        )
        can_send = recent_count < 5 and (not last or now - _normalize_dt(last.created_at) >= timedelta(seconds=60))
        if can_send:
            raw_token = secrets.token_urlsafe(32)
            db.query(AuthChallenge).filter(
                AuthChallenge.user_id == user.user_id,
                AuthChallenge.purpose == "password_reset",
                AuthChallenge.consumed_at.is_(None),
            ).update({AuthChallenge.consumed_at: now}, synchronize_session=False)
            db.add(AuthChallenge(
                user_id=user.user_id,
                purpose="password_reset",
                token_hash=_hash_token(raw_token),
                created_at=now,
                expires_at=now + timedelta(minutes=30),
                attempts=0,
            ))
            db.commit()
            login_url = os.getenv("FRONTEND_LOGIN_URL", "http://127.0.0.1:5500/pages/log.html")
            if ENVIRONMENT == "production" and not login_url.lower().startswith("https://"):
                logger.error("FRONTEND_LOGIN_URL must use HTTPS in production; reset email was not sent")
                return {"message": "If an eligible account exists, password reset instructions will be sent."}
            reset_url = f"{login_url}?{urlencode({'view': 'reset', 'token': raw_token})}"
            try:
                _smtp_send(email, "Reset your Seasonal Swaad password", f"A password reset was requested for your account. Open this link within 30 minutes to choose a new password:\n\n{reset_url}\n\nIf you did not request this, ignore this email.")
            except Exception:
                logger.exception("Password reset email delivery failed")
                # Do not reveal delivery status/account existence to the requester.
    return {"message": "If an eligible account exists, password reset instructions will be sent."}


@router.post("/reset-password")
def reset_password(payload: schemas.PasswordResetConfirm, request: Request, response: Response, db: Session = Depends(get_db)):
    # Token is high entropy; only its SHA-256 digest is stored. Enforce same-origin when Origin is present.
    require_trusted_origin(request)
    token_hash = _hash_token(payload.token)
    challenge = db.query(AuthChallenge).filter(
        AuthChallenge.token_hash == token_hash,
        AuthChallenge.purpose == "password_reset",
        AuthChallenge.consumed_at.is_(None),
        AuthChallenge.expires_at > utcnow(),
    ).with_for_update().first()
    if not challenge:
        raise HTTPException(status_code=400, detail="This password reset link is invalid or expired. Request a new one.")

    user = db.get(models.User, challenge.user_id)
    if not user or not user.is_active or user.deleted_at is not None:
        challenge.consumed_at = utcnow()
        db.commit()
        raise HTTPException(status_code=400, detail="This password reset link is invalid or expired. Request a new one.")

    challenge.consumed_at = utcnow()
    user.password_hash = hash_password(payload.new_password)
    user.auth_provider = "local" if user.auth_provider == "google" else user.auth_provider
    # Revoke every active session after a password reset.
    db.query(AuthSession).filter(
        AuthSession.user_id == user.user_id,
        AuthSession.revoked_at.is_(None),
    ).update({AuthSession.revoked_at: utcnow()}, synchronize_session=False)
    db.query(AuthChallenge).filter(
        AuthChallenge.user_id == user.user_id,
        AuthChallenge.purpose == "password_reset",
        AuthChallenge.consumed_at.is_(None),
    ).update({AuthChallenge.consumed_at: utcnow()}, synchronize_session=False)
    db.commit()
    _clear_cookie(response)
    return {"message": "Password updated. Please log in with your new password."}


@router.post("/google", response_model=schemas.UserResponse, dependencies=[Depends(require_trusted_origin)])
def google_login(payload: schemas.GoogleToken, request: Request, response: Response, db: Session = Depends(get_db)):
    _consume_ip_limit(db, request, "google-login-ip", limit=40, window=timedelta(hours=1))
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not client_id:
        raise HTTPException(status_code=501, detail="Google sign-in is not configured yet.")
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token
        claims = id_token.verify_oauth2_token(payload.credential, google_requests.Request(), client_id)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Google credential could not be verified.") from exc

    email = str(claims.get("email", "")).strip().lower()
    if not email or claims.get("email_verified") is not True:
        raise HTTPException(status_code=401, detail="Google must provide a verified email address.")

    user = db.query(models.User).filter(models.User.email == email).first()
    if user:
        if not user.is_active or user.deleted_at is not None:
            raise HTTPException(status_code=403, detail="This account is unavailable.")
        user.email_verified = True
    else:
        full_name = str(claims.get("name") or "Google User").strip()[:200]
        parts = full_name.split(None, 1)
        user = models.User(
            first_name=parts[0][:100],
            last_name=parts[1][:100] if len(parts) > 1 else None,
            email=email,
            password_hash=None,
            auth_provider="google",
            email_verified=True,
            mobile_verified=False,
            is_active=True,
        )
        db.add(user)
    db.commit()
    db.refresh(user)
    _create_session(db, user, request, response)
    return _public_user(user)
