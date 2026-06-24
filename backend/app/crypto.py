from __future__ import annotations
import os
import logging
from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

def _load_key() -> bytes:
    key_str = os.environ.get("DISCORD_OAUTH_FERNET_KEY", "")
    if key_str:
        try:
            # Validate key by constructing Fernet
            Fernet(key_str.encode())
            return key_str.encode()
        except Exception as e:
            logger.warning(f"DISCORD_OAUTH_FERNET_KEY invalid, using ephemeral dev key: {e}")
    # Dev fallback: ephemeral key
    key = Fernet.generate_key()
    logger.warning("DISCORD_OAUTH_FERNET_KEY not set - using ephemeral dev key (tokens won't survive restart)")
    return key

_FERNET = Fernet(_load_key())

def encrypt_token(plaintext: str) -> str:
    return _FERNET.encrypt(plaintext.encode()).decode()

def decrypt_token(ciphertext: str) -> str:
    try:
        return _FERNET.decrypt(ciphertext.encode()).decode()
    except InvalidToken as e:
        raise ValueError("invalid token ciphertext") from e
