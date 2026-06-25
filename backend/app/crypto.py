from __future__ import annotations
import os
import logging
from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

def _load_key() -> bytes:
    key_str = os.environ.get("DISCORD_OAUTH_FERNET_KEY", "")
    if not key_str:
        raise RuntimeError("DISCORD_OAUTH_FERNET_KEY must be set")
    try:
        # Validate key by constructing Fernet
        Fernet(key_str.encode())
        return key_str.encode()
    except Exception as e:
        raise RuntimeError(f"DISCORD_OAUTH_FERNET_KEY invalid: {e}") from e

_FERNET = Fernet(_load_key())

def encrypt_token(plaintext: str) -> str:
    return _FERNET.encrypt(plaintext.encode()).decode()

def decrypt_token(ciphertext: str) -> str:
    try:
        return _FERNET.decrypt(ciphertext.encode()).decode()
    except InvalidToken as e:
        raise ValueError("invalid token ciphertext") from e
