# SPDX-License-Identifier: GPL-3.0-or-later
"""
Site model - represents physical locations in the network hierarchy.
"""
from datetime import datetime
from typing import List, Optional
from sqlalchemy import String, Integer, Float, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Site(Base):
    __tablename__ = "sites"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    location: Mapped[Optional[str]] = mapped_column(String(500))
    description: Mapped[Optional[str]] = mapped_column(Text)
    parent_site_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("sites.id"), index=True
    )
    level: Mapped[int] = mapped_column(Integer, default=1)  # 1=district, 2=site, 3=building, 4=floor
    contact_name: Mapped[Optional[str]] = mapped_column(String(200))
    contact_email: Mapped[Optional[str]] = mapped_column(String(200))
    map_image_url: Mapped[Optional[str]] = mapped_column(String(500))
    map_config: Mapped[Optional[str]] = mapped_column(Text)
    map_x: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    map_y: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    map_image_id: Mapped[Optional[int]] = mapped_column(ForeignKey("map_images.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    parent: Mapped[Optional["Site"]] = relationship(
        "Site", remote_side="Site.id", back_populates="children"
    )
    children: Mapped[List["Site"]] = relationship(
        "Site", back_populates="parent", cascade="all, delete-orphan"
    )
    devices: Mapped[List["Device"]] = relationship(
        "Device", back_populates="site", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Site(id={self.id}, name='{self.name}')>"
