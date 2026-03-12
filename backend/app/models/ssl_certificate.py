# SPDX-License-Identifier: GPL-3.0-or-later
"""
SSL Certificate model for managing TLS certificates.
"""
import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, DateTime, Boolean, Text, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class CertificateType(str, enum.Enum):
    CA = "ca"
    SERVER = "server"
    UPLOADED = "uploaded"
    CSR = "csr"


class SSLCertificate(Base):
    __tablename__ = "ssl_certificates"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    cert_type: Mapped[CertificateType] = mapped_column(String(20))
    common_name: Mapped[str] = mapped_column(String(500))
    subject_alt_names: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    issuer: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    serial_number: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    not_before: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    not_after: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    fingerprint_sha256: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    cert_path: Mapped[str] = mapped_column(String(500))
    key_path: Mapped[str] = mapped_column(String(500))
    ca_cert_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    csr_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    is_ca: Mapped[bool] = mapped_column(Boolean, default=False)
    uploaded_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<SSLCertificate(id={self.id}, name='{self.name}', type={self.cert_type})>"
