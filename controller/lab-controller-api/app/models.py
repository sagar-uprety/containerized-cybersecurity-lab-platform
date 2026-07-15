
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
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
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
    semester: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    study_program: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utcnow)
    synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    memberships: Mapped[list["GroupMember"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    semester: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utcnow)
    synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

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
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    requested_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utcnow)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

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
    deadline: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    assigned_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utcnow)
    synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    group: Mapped["Group"] = relationship(back_populates="labs")


class AssignmentObligation(Base):
    __tablename__ = "assignment_obligations"
    __table_args__ = (UniqueConstraint("group_lab_id", "user_id", name="uq_assignment_obligation"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    group_lab_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("group_labs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    group_id: Mapped[int] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    lab_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    assigned_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    eligible_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    deadline: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    removed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)


class LabSession(Base):
    __tablename__ = "lab_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    student_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    lab_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    outcome: Mapped[str] = mapped_column(String, nullable=False, default="running")
    close_reason: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)


class RuntimeLease(Base):
    __tablename__ = "runtime_leases"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    student_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    lab_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String, nullable=False, index=True)
    session_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("lab_sessions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utcnow)


class SessionObligation(Base):
    __tablename__ = "session_obligations"
    __table_args__ = (
        UniqueConstraint("session_id", "assignment_id", name="uq_session_obligation"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("lab_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assignment_id: Mapped[str] = mapped_column(
        ForeignKey("assignment_obligations.id", ondelete="CASCADE"), nullable=False, index=True
    )


class LifecycleEvidence(Base):
    __tablename__ = "lifecycle_evidence"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    session_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("lab_sessions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    student_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    lab_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    actor_id: Mapped[str] = mapped_column(String, nullable=False)
    actor_type: Mapped[str] = mapped_column(String, nullable=False)
    action: Mapped[str] = mapped_column(String, nullable=False, index=True)
    result: Mapped[str] = mapped_column(String, nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=_utcnow, index=True
    )
    operation_duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)


class CheckAttempt(Base):
    __tablename__ = "check_attempts"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    session_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("lab_sessions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    student_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    lab_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    actor_id: Mapped[str] = mapped_column(String, nullable=False)
    actor_type: Mapped[str] = mapped_column(String, nullable=False)
    phase: Mapped[str] = mapped_column(String, nullable=False)
    scenario_version: Mapped[str] = mapped_column(String, nullable=False, default="1")
    checker_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    overall_state: Mapped[str] = mapped_column(String, nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=_utcnow, index=True
    )
    operation_duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)


class CheckObligation(Base):
    __tablename__ = "check_obligations"
    __table_args__ = (UniqueConstraint("check_id", "assignment_id", name="uq_check_obligation"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    check_id: Mapped[str] = mapped_column(
        ForeignKey("check_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assignment_id: Mapped[str] = mapped_column(
        ForeignKey("assignment_obligations.id", ondelete="CASCADE"), nullable=False, index=True
    )


class CriterionObservation(Base):
    __tablename__ = "criterion_observations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    check_id: Mapped[str] = mapped_column(
        ForeignKey("check_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    label: Mapped[str] = mapped_column(String, nullable=False)
    kind: Mapped[str] = mapped_column(String, nullable=False)
    observed_state: Mapped[str] = mapped_column(String, nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    exit_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    matched_states: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    output: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class TerminalCommand(Base):
    __tablename__ = "terminal_commands"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    lab_session_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("lab_sessions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    terminal_session_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    student_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    lab_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    event: Mapped[str] = mapped_column(String, nullable=False)
    command: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=_utcnow, index=True
    )
    synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)


class FeedbackResponse(Base):
    __tablename__ = "feedback_responses"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    lab_session_id: Mapped[str] = mapped_column(
        ForeignKey("lab_sessions.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    student_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    lab_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    section_a: Mapped[str] = mapped_column(Text, nullable=False)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str] = mapped_column(Text, nullable=False)
    issue_category: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utcnow)
    synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)


class Intervention(Base):
    __tablename__ = "interventions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    group_id: Mapped[int] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lab_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    reason: Mapped[str] = mapped_column(String, nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    owner: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="open")
    follow_up_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utcnow)
    synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
