// Mirrors the aggregation logic in controller/lab-controller-api/app/main.py
// (session-history building, dashboard/group-progress/students-progress
// computation) so the mock API returns shapes and numbers that behave the
// same way the real backend's do.
import { store, LABS, CHECKS_POOL } from "./data";
import type { MockLifecycleEvent, MockCheckResult, MockCommandEvent } from "./data";
import type { CriterionEvidence, ReviewReason } from "../types";

export interface SessionSpan {
  session_id?: string;
  started_at: string;
  ended_at: string | null;
  outcome: string;
  duration_seconds: number | null;
  check_count: number;
  student_check_count: number;
  automatic_check_count: number;
  close_reason?: string | null;
  passed: boolean | null;
}

export function buildSessionHistory(studentId: string, labId: string): SessionSpan[] {
  const events = store.lifecycleEvents
    .filter((e) => e.student_id === studentId && e.lab_id === labId)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const checkCounts = store.checkResults.filter((c) => c.student_id === studentId && c.lab_id === labId);

  const sessions: SessionSpan[] = [];
  let current: { started_at: string; session_id?: string } | null = null;
  const endActions = new Set(["end", "stop", "destroy", "auto_stop", "reset"]);

  function completeSession(endedAt: string | null, outcome: string, closeReason?: string | null) {
    if (!current) return;
    const start = new Date(current.started_at);
    const end = endedAt ? new Date(endedAt) : null;
    const checksInWindow = checkCounts.filter((check) => {
      if (current?.session_id && check.session_id) return check.session_id === current.session_id;
      const timestamp = new Date(check.timestamp);
      return timestamp >= start && (!end || timestamp <= end);
    });
    const lastCheck = checksInWindow[checksInWindow.length - 1];
    sessions.push({
      session_id: current.session_id,
      started_at: current.started_at,
      ended_at: endedAt,
      outcome,
      duration_seconds: end ? (end.getTime() - start.getTime()) / 1000 : null,
      check_count: checksInWindow.length,
      student_check_count: checksInWindow.filter((check) => check.actor_type === "student").length,
      automatic_check_count: checksInWindow.filter((check) => check.actor_type === "system").length,
      close_reason: closeReason,
      passed: lastCheck ? lastCheck.check_result.passed : null,
    });
  }

  for (const ev of events) {
    if (ev.result !== "success") continue;
    if (ev.action === "start") {
      if (current) completeSession(ev.timestamp, "interrupted");
      current = { started_at: ev.timestamp, session_id: ev.session_id };
    } else if (endActions.has(ev.action) && current) {
      completeSession(ev.timestamp, ev.action, ev.reason);
      current = null;
    }
  }
  if (current) completeSession(null, "running");
  return sessions;
}

function latestCheck(studentId: string, labId: string, eligibleAt?: string, sessionId?: string): MockCheckResult["check_result"] | null {
  const results = store.checkResults.filter((c) => c.student_id === studentId && c.lab_id === labId && (!eligibleAt || new Date(c.timestamp) >= new Date(eligibleAt)) && (!sessionId || c.session_id === sessionId));
  if (results.length === 0) return null;
  return results[results.length - 1].check_result;
}

function passed(studentId: string, labId: string): boolean {
  return store.checkResults.some((check) =>
    check.student_id === studentId
    && check.lab_id === labId
    && (check.check_result.passed || check.check_result.status === "fixed")
  );
}

function passedAfter(studentId: string, labId: string, eligibleAt: string): boolean {
  return store.checkResults.some((check) =>
    check.student_id === studentId
    && check.lab_id === labId
    && new Date(check.timestamp) >= new Date(eligibleAt)
    && (check.check_result.passed || check.check_result.status === "fixed")
  );
}

function firstPassAt(studentId: string, labId: string, eligibleAt?: string): string | undefined {
  return store.checkResults.find((check) =>
    check.student_id === studentId
    && check.lab_id === labId
    && (!eligibleAt || new Date(check.timestamp) >= new Date(eligibleAt))
    && (check.check_result.passed || check.check_result.status === "fixed")
  )?.timestamp;
}

function criterionEvidence(studentId: string, labId: string, eligibleAt?: string, currentSessionId?: string): CriterionEvidence[] {
  const history = store.checkResults.filter((check) => check.student_id === studentId && check.lab_id === labId && (!eligibleAt || new Date(check.timestamp) >= new Date(eligibleAt)));
  return (CHECKS_POOL[labId] || []).map((definition) => {
    const observations = history.flatMap((check) => {
      const criterion = check.check_result.checks.find((item) => item.name === definition.name);
      return criterion ? [{ passed: criterion.passed, observed_state: criterion.observed_state, timestamp: check.timestamp }] : [];
    });
    const firstPassIndex = observations.findIndex((item) => item.passed);
    const currentObservations = currentSessionId
      ? history.filter((check) => check.session_id === currentSessionId).flatMap((check) => {
        const criterion = check.check_result.checks.find((item) => item.name === definition.name);
        return criterion ? [{ passed: criterion.passed, observed_state: criterion.observed_state, timestamp: check.timestamp }] : [];
      })
      : observations;
    const latest = currentObservations[currentObservations.length - 1];
    return {
      name: definition.name,
      label: definition.label,
      kind: definition.kind,
      ever_passed: firstPassIndex >= 0,
      current_passed: latest ? latest.passed : null,
      current_state: latest?.observed_state || "unknown",
      total_checks: observations.length,
      failed_checks: observations.filter((item) => !item.passed).length,
      failures_before_achievement: firstPassIndex >= 0
        ? observations.slice(0, firstPassIndex).filter((item) => !item.passed).length
        : observations.filter((item) => !item.passed).length,
      first_pass_at: firstPassIndex >= 0 ? observations[firstPassIndex].timestamp : undefined,
      last_checked_at: latest?.timestamp,
    };
  });
}

const REVIEW_REASON_LABELS = {
  overdue_incomplete: "Overdue incomplete",
  not_started_near_deadline: "Not started near deadline",
  repeated_criterion_failure: "Repeated criterion failure",
  no_check_recorded: "Started, no check recorded",
  environment_error: "Environment error",
} as const;

function reviewReasons(studentId: string, assignments: Array<{ lab_id: string; deadline: string | null; eligible_at?: string }>): ReviewReason[] {
  const reasons: ReviewReason[] = [];
  const now = Date.now();
  for (const assignment of assignments) {
    const sessions = buildSessionHistory(studentId, assignment.lab_id).filter((session) => !assignment.eligible_at || new Date(session.started_at) >= new Date(assignment.eligible_at));
    const studentChecks = store.checkResults.filter((check) => check.student_id === studentId && check.lab_id === assignment.lab_id && check.actor_type === "student" && (!assignment.eligible_at || new Date(check.timestamp) >= new Date(assignment.eligible_at)));
    const title = labTitle(assignment.lab_id);
    const deadline = assignment.deadline ? new Date(assignment.deadline).getTime() : null;
    const achieved = assignment.eligible_at ? passedAfter(studentId, assignment.lab_id, assignment.eligible_at) : passed(studentId, assignment.lab_id);
    if (deadline && deadline < now && !achieved) {
      reasons.push({ code: "overdue_incomplete", label: REVIEW_REASON_LABELS.overdue_incomplete, lab_id: assignment.lab_id, lab_title: title });
    }
    if (deadline && deadline >= now && deadline - now <= 3 * 86400000 && sessions.length === 0) {
      reasons.push({ code: "not_started_near_deadline", label: REVIEW_REASON_LABELS.not_started_near_deadline, lab_id: assignment.lab_id, lab_title: title });
    }
    if (sessions.length > 0 && studentChecks.length === 0) {
      reasons.push({ code: "no_check_recorded", label: REVIEW_REASON_LABELS.no_check_recorded, lab_id: assignment.lab_id, lab_title: title });
    }
    const repeated = criterionEvidence(studentId, assignment.lab_id, assignment.eligible_at).find((criterion) => criterion.kind === "objective" && !criterion.ever_passed && criterion.failed_checks >= 2);
    if (repeated) {
      reasons.push({ code: "repeated_criterion_failure", label: REVIEW_REASON_LABELS.repeated_criterion_failure, lab_id: assignment.lab_id, lab_title: title, criterion_name: repeated.label });
    }
    const hasEnvironmentError = store.lifecycleEvents.some((event) => event.student_id === studentId && event.lab_id === assignment.lab_id && event.result === "error" && (!assignment.eligible_at || new Date(event.timestamp) >= new Date(assignment.eligible_at)));
    if (hasEnvironmentError) {
      reasons.push({ code: "environment_error", label: REVIEW_REASON_LABELS.environment_error, lab_id: assignment.lab_id, lab_title: title });
    }
  }
  return reasons;
}

export function labTitle(labId: string): string {
  return LABS.find((l) => l.id === labId)?.title || labId;
}

export function groupSummary(groupId: number) {
  const group = store.groups.find((g) => g.id === groupId)!;
  const members = store.memberships.filter((m) => m.group_id === groupId);
  const approved = members.filter((m) => m.status === "approved").length;
  const pending = members.filter((m) => m.status === "pending").length;
  const labs = store.groupLabs.filter((gl) => gl.group_id === groupId);
  return {
    id: group.id,
    name: group.name,
    semester: group.semester,
    is_active: group.is_active,
    member_count: approved,
    pending_count: pending,
    lab_count: labs.length,
    created_at: group.created_at,
  };
}

export function dashboardStats() {
  const groups = store.groups.map((g) => groupSummary(g.id));
  const totalStudents = new Set(store.memberships.filter((m) => m.status === "approved").map((m) => m.user_id)).size;
  const totalPending = store.memberships.filter((m) => m.status === "pending").length;

  let totalPassed = 0;
  let totalPossible = 0;
  let totalAtRisk = 0;
  const now = Date.now();
  const activeStudents = new Set<string>();
  const weekAgo = now - 7 * 86400000;

  for (const group of store.groups) {
    const approvedMembers = store.memberships.filter((m) => m.group_id === group.id && m.status === "approved");
    const labs = store.groupLabs.filter((gl) => gl.group_id === group.id);
    totalPossible += approvedMembers.length * labs.length;

    for (const m of approvedMembers) {
      const user = store.users.find((u) => u.id === m.user_id)!;
      let atRisk = false;
      for (const gl of labs) {
        const p = passed(user.internal_id, gl.lab_id);
        if (p) totalPassed += 1;
        if (gl.deadline && new Date(gl.deadline).getTime() < now && !p) atRisk = true;
        const sessions = buildSessionHistory(user.internal_id, gl.lab_id);
        if (sessions.some((s) => s.ended_at && new Date(s.ended_at).getTime() >= weekAgo)) {
          activeStudents.add(user.internal_id);
        }
      }
      if (atRisk) totalAtRisk += 1;
    }
  }

  const recent = [...store.lifecycleEvents]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 15)
    .map((e) => ({
      timestamp: e.timestamp,
      action: e.action,
      student_id: e.student_id,
      student_email: store.users.find((user) => user.internal_id === e.student_id)?.email ?? null,
      lab_id: e.lab_id,
      lab_title: labTitle(e.lab_id),
      result: e.result,
      actor_type: e.actor_type,
      reason: e.reason ?? null,
    }));

  return {
    total_groups: store.groups.length,
    total_labs: LABS.length,
    total_students: totalStudents,
    total_pending: totalPending,
    total_passed: totalPassed,
    total_possible: totalPossible,
    total_at_risk: totalAtRisk,
    active_this_week: activeStudents.size,
    groups,
    recent_activity: recent,
  };
}

export function groupDetail(groupId: number) {
  const group = store.groups.find((g) => g.id === groupId);
  if (!group) return null;
  const pending = store.memberships
    .filter((m) => m.group_id === groupId && m.status === "pending")
    .map((m) => {
      const u = store.users.find((x) => x.id === m.user_id)!;
      return { user_id: u.id, student_id: u.internal_id, email: u.email, semester: u.semester, study_program: u.study_program, requested_at: m.requested_at };
    });
  const approved = store.memberships
    .filter((m) => m.group_id === groupId && m.status === "approved")
    .map((m) => {
      const u = store.users.find((x) => x.id === m.user_id)!;
      return { user_id: u.id, student_id: u.internal_id, email: u.email, semester: u.semester, study_program: u.study_program };
    });
  const labs = store.groupLabs.filter((gl) => gl.group_id === groupId).map((gl) => ({ lab_id: gl.lab_id, deadline: gl.deadline }));

  const memberIds = new Set(approved.map((m) => m.student_id));
  const recentActivity = [...store.lifecycleEvents]
    .filter((e) => memberIds.has(e.student_id))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 10)
    .map((e) => ({
      timestamp: e.timestamp,
      action: e.action,
      student_id: e.student_id,
      student_email: store.users.find((user) => user.internal_id === e.student_id)?.email ?? null,
      lab_id: e.lab_id,
      lab_title: labTitle(e.lab_id),
      result: e.result,
      actor_type: e.actor_type,
      reason: e.reason ?? null,
    }));

  return {
    id: group.id,
    name: group.name,
    semester: group.semester,
    is_active: group.is_active,
    created_at: group.created_at,
    pending_members: pending,
    approved_members: approved,
    labs,
    recent_activity: recentActivity,
    csrf_token: "mock-csrf-token",
  };
}

export function groupProgress(groupId: number) {
  const approvedMembers = store.memberships.filter((m) => m.group_id === groupId && m.status === "approved");
  const labs = store.groupLabs.filter((gl) => gl.group_id === groupId);
  const totalLabs = labs.length;
  const now = Date.now();

  let totalGroupPassed = 0;
  let totalAtRisk = 0;
  const labStats: Record<string, { passed: number; attempted: number; checked: number; runtimes: number[] }> = {};
  labs.forEach((gl) => (labStats[gl.lab_id] = { passed: 0, attempted: 0, checked: 0, runtimes: [] }));

  const students = approvedMembers.map((m) => {
    const user = store.users.find((u) => u.id === m.user_id)!;
    let labsPassed = 0;
    let totalSessions = 0;
    let totalTime = 0;
    let labsStarted = 0;
    let checksSubmitted = 0;
    let lastActive: string | null = null;
    let atRisk = false;

    for (const gl of labs) {
      const eligibilityDates = [gl.assigned_at, m.approved_at || m.requested_at].sort();
      const eligibleAt = eligibilityDates[eligibilityDates.length - 1];
      const sessions = buildSessionHistory(user.internal_id, gl.lab_id).filter((session) => new Date(session.started_at) >= new Date(eligibleAt));
      totalSessions += sessions.length;
      if (sessions.length > 0) {
        labStats[gl.lab_id].attempted += 1;
        labsStarted += 1;
      }
      const studentChecks = store.checkResults.filter((check) => check.student_id === user.internal_id && check.lab_id === gl.lab_id && check.actor_type === "student" && new Date(check.timestamp) >= new Date(eligibleAt));
      if (studentChecks.length > 0) {
        labStats[gl.lab_id].checked += 1;
        checksSubmitted += 1;
      }
      let labRuntime = 0;
      for (const s of sessions) {
        if (s.duration_seconds) {
          totalTime += s.duration_seconds;
          labRuntime += s.duration_seconds;
        }
        if (s.ended_at && (!lastActive || s.ended_at > lastActive)) lastActive = s.ended_at;
      }
      if (labRuntime > 0) labStats[gl.lab_id].runtimes.push(labRuntime);
      const p = passedAfter(user.internal_id, gl.lab_id, eligibleAt);
      if (p) {
        labsPassed += 1;
        labStats[gl.lab_id].passed += 1;
      }
    }
    const reasons = reviewReasons(user.internal_id, labs.map((lab) => {
      const eligibilityDates = [lab.assigned_at, m.approved_at || m.requested_at].sort();
      return { ...lab, eligible_at: eligibilityDates[eligibilityDates.length - 1] };
    }));
    atRisk = reasons.some((reason) => reason.code === "overdue_incomplete");
    totalGroupPassed += labsPassed;
    if (atRisk) totalAtRisk += 1;

    return {
      user_id: user.id,
      student_id: user.internal_id,
      email: user.email,
      semester: user.semester,
      study_program: user.study_program,
      labs_assigned: totalLabs,
      labs_passed: labsPassed,
      total_sessions: totalSessions,
      labs_started: labsStarted,
      checks_submitted: checksSubmitted,
      last_active: lastActive,
      total_time_seconds: Math.round(totalTime * 10) / 10,
      at_risk: atRisk,
      review_reasons: reasons,
    };
  });

  const n = approvedMembers.length || 1;
  const labSummaries = labs.map((gl) => {
    const ls = labStats[gl.lab_id];
    const runtimes = [...ls.runtimes].sort((a, b) => a - b);
    const middle = Math.floor(runtimes.length / 2);
    const medianRuntime = runtimes.length === 0
      ? 0
      : runtimes.length % 2
        ? runtimes[middle]
        : (runtimes[middle - 1] + runtimes[middle]) / 2;
    return {
      lab_id: gl.lab_id,
      title: labTitle(gl.lab_id),
      students_passed: ls.passed,
      students_attempted: ls.attempted,
      avg_time_minutes: Math.round((medianRuntime / 60) * 10) / 10,
      median_recorded_minutes: Math.round((medianRuntime / 60) * 10) / 10,
      runtime_samples: runtimes.length,
      students_checked: ls.checked,
      pass_rate: Math.round((ls.passed / n) * 100),
    };
  });

  return {
    total_labs: totalLabs,
    total_students: approvedMembers.length,
    total_passed: totalGroupPassed,
    total_possible: totalLabs * approvedMembers.length,
    total_at_risk: totalAtRisk,
    overdue_incomplete: totalAtRisk,
    students,
    labs: labSummaries,
  };
}

export function studentsProgress() {
  return store.users.map((user) => {
    const memberships = store.memberships.filter((m) => m.user_id === user.id && m.status === "approved");
    const groups = memberships.map((m) => {
      const g = store.groups.find((x) => x.id === m.group_id)!;
      return { id: g.id, name: g.name };
    });
    const assignedLabIds = Array.from(new Set(store.groupLabs.filter((gl) => memberships.some((m) => m.group_id === gl.group_id)).map((gl) => gl.lab_id)));

    let labsPassed = 0;
    let totalSessions = 0;
    let totalTime = 0;
    let labsStarted = 0;
    let checksSubmitted = 0;
    let lastActive: string | null = null;
    let atRisk = false;

    for (const labId of assignedLabIds) {
      const matchingAssignments = store.groupLabs.filter((item) => item.lab_id === labId && memberships.some((membership) => membership.group_id === item.group_id));
      const eligibleAt = matchingAssignments.map((item) => {
        const membership = memberships.find((candidate) => candidate.group_id === item.group_id)!;
        return [item.assigned_at, membership.approved_at || membership.requested_at].sort().slice(-1)[0];
      }).sort()[0];
      const sessions = buildSessionHistory(user.internal_id, labId).filter((session) => !eligibleAt || new Date(session.started_at) >= new Date(eligibleAt));
      totalSessions += sessions.length;
      if (sessions.length > 0) labsStarted += 1;
      if (store.checkResults.some((check) => check.student_id === user.internal_id && check.lab_id === labId && check.actor_type === "student" && (!eligibleAt || new Date(check.timestamp) >= new Date(eligibleAt)))) checksSubmitted += 1;
      for (const s of sessions) {
        if (s.duration_seconds) totalTime += s.duration_seconds;
        if (s.ended_at && (!lastActive || s.ended_at > lastActive)) lastActive = s.ended_at;
      }
      const p = eligibleAt ? passedAfter(user.internal_id, labId, eligibleAt) : passed(user.internal_id, labId);
      if (p) labsPassed += 1;
    }

    const assignments = assignedLabIds.map((labId) => {
      const matching = store.groupLabs.filter((item) => item.lab_id === labId && memberships.some((membership) => membership.group_id === item.group_id));
      const deadlines = matching.map((item) => item.deadline).filter((deadline): deadline is string => !!deadline).sort();
      const eligibilityDates = matching.map((item) => {
        const membership = memberships.find((candidate) => candidate.group_id === item.group_id)!;
        return [item.assigned_at, membership.approved_at || membership.requested_at].sort().slice(-1)[0];
      }).sort();
      return { lab_id: labId, deadline: deadlines[0] || null, eligible_at: eligibilityDates[0] };
    });
    const reasons = reviewReasons(user.internal_id, assignments);
    atRisk = reasons.some((reason) => reason.code === "overdue_incomplete");

    return {
      student_id: user.internal_id,
      email: user.email,
      semester: user.semester,
      study_program: user.study_program,
      groups,
      labs_passed: labsPassed,
      labs_assigned: assignedLabIds.length,
      total_sessions: totalSessions,
      labs_started: labsStarted,
      checks_submitted: checksSubmitted,
      total_time_seconds: Math.round(totalTime * 10) / 10,
      last_active: lastActive,
      at_risk: atRisk,
      review_reasons: reasons,
    };
  }).filter((s) => s.groups.length > 0 || s.total_sessions > 0);
}

export function studentDetail(studentId: string, groupId?: number) {
  const user = store.users.find((u) => u.internal_id === studentId);
  if (!user) return null;
  const memberships = store.memberships.filter((membership) => membership.user_id === user.id && membership.status === "approved" && (groupId == null || membership.group_id === groupId));
  const assignedLabs = store.groupLabs
    .filter((assignment) => memberships.some((membership) => membership.group_id === assignment.group_id))
    .map((assignment) => {
      const membership = memberships.find((candidate) => candidate.group_id === assignment.group_id)!;
      const eligibilityDates = [assignment.assigned_at, membership.approved_at || membership.requested_at].sort();
      return { lab_id: assignment.lab_id, eligible_at: eligibilityDates[eligibilityDates.length - 1] };
    });
  const assignedLabIds = new Set(assignedLabs.map((assignment) => assignment.lab_id));
  // Includes labs with zero sessions too — the UI renders those as "Not attempted".
  const labs = Array.from(assignedLabIds).map((labId) => {
    const eligibleAt = assignedLabs.filter((assignment) => assignment.lab_id === labId).map((assignment) => assignment.eligible_at).sort()[0];
    const sessions = buildSessionHistory(user.internal_id, labId).filter((session) => !eligibleAt || new Date(session.started_at) >= new Date(eligibleAt));
    return {
      lab_id: labId,
      lab_title: labTitle(labId),
      total_sessions: sessions.length,
      latest_check: latestCheck(user.internal_id, labId, eligibleAt, sessions[sessions.length - 1]?.session_id),
      ever_passed: eligibleAt ? passedAfter(user.internal_id, labId, eligibleAt) : passed(user.internal_id, labId),
      first_pass_at: firstPassAt(user.internal_id, labId, eligibleAt),
      checks_submitted: store.checkResults.filter((check) => check.student_id === user.internal_id && check.lab_id === labId && check.actor_type === "student" && (!eligibleAt || new Date(check.timestamp) >= new Date(eligibleAt))).length,
      criteria: criterionEvidence(user.internal_id, labId, eligibleAt, sessions[sessions.length - 1]?.session_id),
      sessions: sessions.map((s) => ({
        started_at: s.started_at,
        duration_seconds: s.duration_seconds ?? undefined,
        check_count: s.check_count,
        student_check_count: s.student_check_count,
        automatic_check_count: s.automatic_check_count,
        outcome: s.outcome,
        close_reason: s.close_reason,
        passed: s.passed,
      })),
    };
  });

  return { student_id: user.internal_id, labs };
}

export function sessionDetail(labId: string, studentId: string) {
  const sessions = buildSessionHistory(studentId, labId);
  const commands: MockCommandEvent[] = store.commandEvents.filter((c) => c.student_id === studentId && c.lab_id === labId);
  const checks: MockCheckResult[] = store.checkResults.filter((c) => c.student_id === studentId && c.lab_id === labId);
  const events: MockLifecycleEvent[] = store.lifecycleEvents.filter((e) => e.student_id === studentId && e.lab_id === labId);
  const latest = checks.length > 0 ? checks[checks.length - 1].check_result : null;
  const lastSession = sessions[sessions.length - 1];
  const scenario = LABS.find((l) => l.id === labId);

  return {
    status: lastSession?.outcome || "not_created",
    duration_seconds: lastSession?.duration_seconds ?? undefined,
    commands: commands.map((c) => ({ timestamp: c.timestamp, command: c.command })),
    latest_check: latest,
    lifecycle_events: events.map((e) => ({ action: e.action, timestamp: e.timestamp, result: e.result })),
    scenario: scenario && {
      title: scenario.title,
      difficulty: scenario.difficulty,
      story: scenario.story,
      checker: { checks: (CHECKS_POOL[labId] || []).map((c) => ({ name: c.name, label: c.label })) },
      documentation: {
        student_guide_url: `https://docs.example.invalid/labs/${labId}`,
        solution_notes_url: `https://docs.example.invalid/labs/${labId}-solution`,
        instructor_guide_url: `https://docs.example.invalid/labs/${labId}-instructor`,
      },
    },
    check_results: checks.map((c) => ({ timestamp: c.timestamp, check_result: c.check_result })),
  };
}

export function analytics(groupId?: number) {
  const selectedGroups = groupId != null
    ? store.groups.filter((g) => g.id === groupId)
    : store.groups;
  const selectedGroupIds = new Set(selectedGroups.map((g) => g.id));
  const memberships = store.memberships.filter((m) => m.status === "approved" && selectedGroupIds.has(m.group_id));
  const selectedUserIds = new Set(memberships.map((m) => m.user_id));
  const selectedStudents = store.users.filter((u) => selectedUserIds.has(u.id));
  const assignments = store.groupLabs.filter((gl) => selectedGroupIds.has(gl.group_id));
  const now = new Date();
  const obligations = memberships.flatMap((membership) => {
    const student = store.users.find((user) => user.id === membership.user_id);
    if (!student) return [];
    return assignments
      .filter((assignment) => assignment.group_id === membership.group_id)
      .map((assignment) => {
        const eligibilityDates = [assignment.assigned_at, membership.approved_at || membership.requested_at].sort();
        const eligibleAt = eligibilityDates[eligibilityDates.length - 1];
        return { ...assignment, student_id: student.internal_id, eligible_at: eligibleAt };
      });
  });
  const eligibleObligations = obligations.filter((obligation) => new Date(obligation.eligible_at) <= now);
  const obligationPassedBy = (obligation: (typeof obligations)[number], cutoff: Date) => store.checkResults.some((check) =>
    check.student_id === obligation.student_id
    && check.lab_id === obligation.lab_id
    && new Date(check.timestamp) >= new Date(obligation.eligible_at)
    && new Date(check.timestamp) < cutoff
    && (check.check_result.passed || check.check_result.status === "fixed")
  );
  const totalPassed = eligibleObligations.filter((obligation) => obligationPassedBy(obligation, new Date(now.getTime() + 1))).length;
  const completionRate = eligibleObligations.length > 0 ? Math.round((totalPassed / eligibleObligations.length) * 100) : 0;

  const pairKeys = new Set(eligibleObligations.map((obligation) => `${obligation.student_id}:${obligation.lab_id}`));
  const pairEligibility = new Map<string, string>();
  for (const obligation of eligibleObligations) {
    const key = `${obligation.student_id}:${obligation.lab_id}`;
    const existing = pairEligibility.get(key);
    if (!existing || obligation.eligible_at < existing) pairEligibility.set(key, obligation.eligible_at);
  }
  const sessions = [...pairKeys].flatMap((key) => {
    const separator = key.indexOf(":");
    const studentId = key.slice(0, separator);
    const labId = key.slice(separator + 1);
    const eligibleAt = pairEligibility.get(key);
    return buildSessionHistory(studentId, labId)
      .filter((session) => !eligibleAt || new Date(session.started_at) >= new Date(eligibleAt))
      .map((session) => ({ ...session, studentId, labId }));
  });
  const durations = sessions
    .filter((session) => session.ended_at)
    .map((session) => session.duration_seconds || 0)
    .filter((duration) => duration > 0)
    .sort((a, b) => a - b);
  const middle = Math.floor(durations.length / 2);
  const medianSeconds = durations.length === 0
    ? 0
    : durations.length % 2
      ? durations[middle]
      : (durations[middle - 1] + durations[middle]) / 2;

  const weekStart = (date: Date) => {
    const d = new Date(date);
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const currentWeek = weekStart(new Date());
  const weekly = Array.from({ length: 8 }, (_, index) => {
    const start = new Date(currentWeek.getTime() - (7 - index) * 7 * 86400000);
    const end = new Date(start.getTime() + 7 * 86400000);
    const sessionsInWeek = sessions.filter((session) => {
      const timestamp = new Date(session.started_at);
      return timestamp >= start && timestamp < end;
    });
    const eligible = obligations.filter((obligation) => new Date(obligation.eligible_at) < end);
    const completed = eligible.filter((obligation) => obligationPassedBy(obligation, end)).length;
    return {
      week: `${start.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}${index === 7 ? " WTD" : ""}`,
      completion_rate: eligible.length > 0 ? Math.round((completed / eligible.length) * 100) : 0,
      completed_assignments: completed,
      eligible_assignments: eligible.length,
      sessions: sessionsInWeek.length,
      active_students: new Set(sessionsInWeek.map((session) => session.studentId)).size,
      is_partial: index === 7,
    };
  });

  const assignedLabIds = [...new Set(assignments.map((gl) => gl.lab_id))];
  const labs = assignedLabIds.map((labId) => {
    const labObligations = eligibleObligations.filter((obligation) => obligation.lab_id === labId);
    const labSessions = sessions.filter((session) => session.labId === labId);
    const startedStudents = new Set(labSessions.map((session) => session.studentId));
    const studentChecks = store.checkResults.filter((check) => {
      const key = `${check.student_id}:${labId}`;
      const eligibleAt = pairEligibility.get(key);
      return pairKeys.has(key) && check.lab_id === labId && check.actor_type === "student" && (!eligibleAt || new Date(check.timestamp) >= new Date(eligibleAt));
    });
    const checkedStudents = new Set(studentChecks.map((check) => check.student_id));
    const passedCount = labObligations.filter((obligation) => obligationPassedBy(obligation, new Date(now.getTime() + 1))).length;
    const labDurations = labObligations.map((obligation) => labSessions
      .filter((session) => session.studentId === obligation.student_id && session.ended_at && new Date(session.started_at) >= new Date(obligation.eligible_at))
      .reduce((total, session) => total + (session.duration_seconds || 0), 0))
      .filter((duration) => duration > 0)
      .sort((a, b) => a - b);
    const labMiddle = Math.floor(labDurations.length / 2);
    const labMedian = labDurations.length === 0 ? 0 : labDurations.length % 2 ? labDurations[labMiddle] : (labDurations[labMiddle - 1] + labDurations[labMiddle]) / 2;
    const failuresByCriterion = new Map<string, { label: string; failed: number; observed: number }>();
    for (const obligation of labObligations) {
      const latest = studentChecks.filter((check) => check.student_id === obligation.student_id && new Date(check.timestamp) >= new Date(obligation.eligible_at)).slice(-1)[0];
      for (const criterion of latest?.check_result.checks || []) {
        if (criterion.kind !== "objective") continue;
        const current = failuresByCriterion.get(criterion.name) || { label: criterion.label, failed: 0, observed: 0 };
        current.observed += 1;
        if (!criterion.passed) current.failed += 1;
        failuresByCriterion.set(criterion.name, current);
      }
    }
    const commonFailure = [...failuresByCriterion.values()].sort((a, b) => b.failed - a.failed)[0];
    const labStudentIds = new Set(labObligations.map((obligation) => obligation.student_id));
    const feedback = store.feedback
      .filter((item) => item.lab_id === labId && labStudentIds.has(item.student_id))
      .map((item) => item.section_b_rating);
    const feedbackAverage = feedback.length >= 5 ? feedback.reduce((sum, rating) => sum + rating, 0) / feedback.length : undefined;
    return {
      lab_id: labId,
      title: labTitle(labId),
      completion_rate: labObligations.length > 0 ? Math.round((passedCount / labObligations.length) * 100) : 0,
      started_rate: labObligations.length > 0 ? Math.round((startedStudents.size / labObligations.length) * 100) : 0,
      check_submission_rate: labObligations.length > 0 ? Math.round((checkedStudents.size / labObligations.length) * 100) : 0,
      median_recorded_minutes: Math.round(labMedian / 60),
      runtime_samples: labDurations.length,
      open_sessions: labSessions.filter((session) => !session.ended_at).length,
      students_passed: passedCount,
      students_started: startedStudents.size,
      students_checked: checkedStudents.size,
      students_assigned: labObligations.length,
      common_failed_criterion: commonFailure?.failed ? commonFailure.label : undefined,
      criterion_failure_rate: commonFailure?.observed ? Math.round((commonFailure.failed / commonFailure.observed) * 100) : undefined,
      environment_errors: store.lifecycleEvents.filter((event) => {
        const key = `${event.student_id}:${labId}`;
        const eligibleAt = pairEligibility.get(key);
        return event.lab_id === labId && event.result === "error" && pairKeys.has(key) && (!eligibleAt || new Date(event.timestamp) >= new Date(eligibleAt));
      }).length,
      feedback_count: feedback.length,
      feedback_average: feedbackAverage == null ? undefined : Math.round(feedbackAverage * 10) / 10,
    };
  });

  const weekAgo = Date.now() - 7 * 86400000;
  const activeStudentIds = new Set(
    sessions.filter((session) => new Date(session.started_at).getTime() >= weekAgo).map((session) => session.studentId)
  );
  const overdueEligible = eligibleObligations.filter((obligation) => obligation.deadline && new Date(obligation.deadline) < now);
  const overdueObligations = overdueEligible.filter((obligation) => !obligationPassedBy(obligation, new Date(now.getTime() + 1)));
  const overdueStudents = new Set(overdueObligations.map((obligation) => obligation.student_id));

  const groups = selectedGroups.map((group) => {
    const progress = groupProgress(group.id);
    const groupStudentIds = new Set(
      store.memberships
        .filter((m) => m.group_id === group.id && m.status === "approved")
        .map((m) => store.users.find((u) => u.id === m.user_id)?.internal_id)
        .filter(Boolean)
    );
    const active = [...activeStudentIds].filter((studentId) => groupStudentIds.has(studentId)).length;
    return {
      id: group.id,
      name: group.name,
      completion_rate: progress.total_possible > 0 ? Math.round((progress.total_passed / progress.total_possible) * 100) : 0,
      active_rate: progress.total_students > 0 ? Math.round((active / progress.total_students) * 100) : 0,
      at_risk: progress.total_at_risk,
      completed_assignments: progress.total_passed,
      eligible_assignments: progress.total_possible,
      active_students: active,
      total_students: progress.total_students,
      overdue_incomplete: progress.overdue_incomplete,
    };
  });

  return {
    scope_name: groupId != null ? selectedGroups[0]?.name : undefined,
    as_of: now.toISOString(),
    timezone: "Europe/Berlin",
    window_label: "Last 8 weeks; current week to date",
    total_students: selectedStudents.length,
    completion_rate: completionRate,
    completed_assignments: totalPassed,
    eligible_assignments: eligibleObligations.length,
    active_this_week: activeStudentIds.size,
    at_risk: overdueStudents.size,
    overdue_incomplete: overdueStudents.size,
    overdue_eligible: overdueEligible.length,
    median_session_minutes: Math.round(medianSeconds / 60),
    median_runtime_samples: durations.length,
    open_sessions: sessions.filter((session) => !session.ended_at).length,
    weekly,
    labs,
    groups,
  };
}
