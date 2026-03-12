# SPDX-License-Identifier: GPL-3.0-or-later
"""
Field-level encryption for sensitive data at rest (SNMP community strings, passwords).
Uses Fernet symmetric encryption derived from the application SECRET_KEY.
"""
import base64
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings

logger = logging.getLogger(__name__)

# Derive a Fernet key from SECRET_KEY (must be 32 url-safe base64-encoded bytes)
_raw = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
_fernet_key = base64.urlsafe_b64encode(_raw)
_fernet = Fernet(_fernet_key)


def encrypt_value(plaintext: str | None) -> str | None:
    """Encrypt a string value. Returns base64-encoded ciphertext."""
    if not plaintext:
        return plaintext
    return _fernet.encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str | None) -> str | None:
    """Decrypt a previously encrypted value. Returns plaintext."""
    if not ciphertext:
        return ciphertext
    try:
        return _fernet.decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        # Value may be stored as plaintext (pre-encryption migration)
        logger.warning("Failed to decrypt value — returning as-is (may be plaintext)")
        return ciphertext
