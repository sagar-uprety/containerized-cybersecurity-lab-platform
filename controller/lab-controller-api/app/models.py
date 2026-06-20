
Identity model:
- A student logs in with `email`; the system also holds an internal `studentNN`
  id and a stable unique `number` used for deterministic port allocation and
  container naming (labctl expects `student([0-9]{2,4})`).
- Labs are assigned to groups only. A student's visible labs are the union of
  lab assignments across every group they belong to.
- The portal-login password (bcrypt hash here) is distinct from the lab/SSH
  password used inside workstation containers on x01.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False, default="student")
    # internal_id / number are set for students, NULL for instructors.
    internal_id: Mapped[Optional[str]] = mapped_column(String, unique=True, nullable=True)
    number: Mapped[Optional[int]] = mapped_column(Integer, unique=True, nullable=True)
    # Lab/SSH password injected into the student's workstation container on x01.
    # Distinct from the portal-login password above; the portal passes this to
    # labctl at start-time (Decision B). Plaintext by necessity — the container
    # needs the literal value. NULL for instructors. Lives on x02 (higher trust).
    lab_password: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utcnow)

    memberships: Mapped[list["GroupMember"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utcnow)

    members: Mapped[list["GroupMember"]] = relationship(
        back_populates="group", cascade="all, delete-orphan"
    )
    labs: Mapped[list["GroupLab"]] = relationship(
        back_populates="group", cascade="all, delete-orphan"
    )


class GroupMember(Base):
    __tablename__ = "group_members"
    __table_args__ = (UniqueConstraint("group_id", "user_id", name="uq_group_member"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    group_id: Mapped[int] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    group: Mapped["Group"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="memberships")


class GroupLab(Base):
    __tablename__ = "group_labs"
    __table_args__ = (UniqueConstraint("group_id", "lab_id", name="uq_group_lab"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    group_id: Mapped[int] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lab_id: Mapped[str] = mapped_column(String, nullable=False, index=True)

    group: Mapped["Group"] = relationship(back_populates="labs")
