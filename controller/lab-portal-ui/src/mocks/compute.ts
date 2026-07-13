// Mirrors the aggregation logic in controller/lab-controller-api/app/main.py
// (session-history building, dashboard/group-progress/students-progress
// computation) so the mock API returns shapes and numbers that behave the
// same way the real backend's do.
import { store, LABS, CHECKS_POOL } from "./data";
import type { MockLifecycleEvent, MockCheckResult, MockCommandEvent } from "./data";

export interface SessionSpan {
  started_at: string;
  ended_at: string | null;
  outcome: string;
  duration_seconds: number | null;
  check_count: number;
}

export function buildSessionHistory(studentId: string, labId: string): SessionSpan[] {
  const events = store.lifecycleEvents
    .filter((e) => e.student_id === studentId && e.lab_id === labId)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const checkCounts = store.checkResults.filter((c) => c.student_id === studentId && c.lab_id === labId);

  const sessions: SessionSpan[] = [];
  let current: { started_at: string } | null = null;
  const endActions = new Set(["end", "stop", "destroy", "auto_stop"]);

  for (const ev of events) {
    if (ev.action === "start") {
      current = { started_at: ev.timestamp };
    } else if (endActions.has(ev.action) && current) {
      const start = new Date(current.started_at);
      const end = new Date(ev.timestamp);
      const checksInWindow = checkCounts.filter((c) => {
        const t = new Date(c.timestamp);
        return t >= start && t <= end;
      });
      sessions.push({
        started_at: current.started_at,
        ended_at: ev.timestamp,
        outcome: ev.action,
        duration_seconds: (end.getTime() - start.getTime()) / 1000,
        check_count: checksInWindow.length,
      });
      current = null;
    }
  }
  return sessions;
}

function labIdsAssignedToStudent(userId: number): Set<string> {
  const groupIds = store.memberships.filter((m) => m.user_id === userId && m.status === "approved").map((m) => m.group_id);
  const ids = new Set<string>();
  store.groupLabs.filter((gl) => groupIds.includes(gl.group_id)).forEach((gl) => ids.add(gl.lab_id));
  return ids;
}

function latestCheck(studentId: string, labId: string): MockCheckResult["check_result"] | null {
  const results = store.checkResults.filter((c) => c.student_id === studentId && c.lab_id === labId);
  if (results.length === 0) return null;
  return results[results.length - 1].check_result;
}

function passed(studentId: string, labId: string): boolean {
  const c = latestCheck(studentId, labId);
  return !!c && c.passed;
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
    .filter((e) => e.action !== "check")
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 15)
    .map((e) => ({
      timestamp: e.timestamp,
      action: e.action,
      student_id: e.student_id,
      lab_id: e.lab_id,
      lab_title: labTitle(e.lab_id),
      result: e.result,
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
    .filter((e) => e.action !== "check" && memberIds.has(e.student_id))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 10)
    .map((e) => ({ timestamp: e.timestamp, action: e.action, student_id: e.student_id, lab_id: e.lab_id, lab_title: labTitle(e.lab_id), result: e.result }));

  return {
    id: group.id,
    name: group.name,
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
  const labStats: Record<string, { passed: number; attempted: number; totalTime: number }> = {};
  labs.forEach((gl) => (labStats[gl.lab_id] = { passed: 0, attempted: 0, totalTime: 0 }));

  const students = approvedMembers.map((m) => {
    const user = store.users.find((u) => u.id === m.user_id)!;
    let labsPassed = 0;
    let totalSessions = 0;
    let totalTime = 0;
    let lastActive: string | null = null;
    let atRisk = false;

    for (const gl of labs) {
      const sessions = buildSessionHistory(user.internal_id, gl.lab_id);
      totalSessions += sessions.length;
      if (sessions.length > 0) labStats[gl.lab_id].attempted += 1;
      for (const s of sessions) {
        if (s.duration_seconds) {
          totalTime += s.duration_seconds;
          labStats[gl.lab_id].totalTime += s.duration_seconds;
        }
        if (s.ended_at && (!lastActive || s.ended_at > lastActive)) lastActive = s.ended_at;
      }
      const p = passed(user.internal_id, gl.lab_id);
      if (p) {
        labsPassed += 1;
        labStats[gl.lab_id].passed += 1;
      }
      if (gl.deadline && new Date(gl.deadline).getTime() < now && !p) atRisk = true;
    }
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
      last_active: lastActive,
      total_time_seconds: Math.round(totalTime * 10) / 10,
      at_risk: atRisk,
    };
  });

  const n = approvedMembers.length || 1;
  const labSummaries = labs.map((gl) => {
    const ls = labStats[gl.lab_id];
    return {
      lab_id: gl.lab_id,
      title: labTitle(gl.lab_id),
      students_passed: ls.passed,
      students_attempted: ls.attempted,
      avg_time_minutes: ls.attempted > 0 ? Math.round((ls.totalTime / ls.attempted / 60) * 10) / 10 : 0,
      pass_rate: Math.round((ls.passed / n) * 100),
    };
  });

  return {
    total_labs: totalLabs,
    total_students: approvedMembers.length,
    total_passed: totalGroupPassed,
    total_possible: totalLabs * approvedMembers.length,
    total_at_risk: totalAtRisk,
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
    let lastActive: string | null = null;
    let atRisk = false;
    const now = Date.now();

    for (const labId of assignedLabIds) {
      const sessions = buildSessionHistory(user.internal_id, labId);
      totalSessions += sessions.length;
      for (const s of sessions) {
        if (s.duration_seconds) totalTime += s.duration_seconds;
        if (s.ended_at && (!lastActive || s.ended_at > lastActive)) lastActive = s.ended_at;
      }
      const p = passed(user.internal_id, labId);
      if (p) labsPassed += 1;
      const gl = store.groupLabs.find((x) => x.lab_id === labId && memberships.some((m) => m.group_id === x.group_id) && x.deadline);
      if (gl?.deadline && new Date(gl.deadline).getTime() < now && !p) atRisk = true;
    }

    return {
      student_id: user.internal_id,
      email: user.email,
      semester: user.semester,
      study_program: user.study_program,
      groups,
      labs_passed: labsPassed,
      labs_assigned: assignedLabIds.length,
      total_sessions: totalSessions,
      total_time_seconds: Math.round(totalTime * 10) / 10,
      last_active: lastActive,
      at_risk: atRisk,
    };
  }).filter((s) => s.groups.length > 0 || s.total_sessions > 0);
}

export function studentDetail(studentId: string) {
  const user = store.users.find((u) => u.internal_id === studentId);
  if (!user) return null;
  const assignedLabIds = labIdsAssignedToStudent(user.id);
  // Includes labs with zero sessions too — the UI renders those as "Not attempted".
  const labs = Array.from(assignedLabIds).map((labId) => {
    const sessions = buildSessionHistory(user.internal_id, labId);
    return {
      lab_id: labId,
      lab_title: labTitle(labId),
      total_sessions: sessions.length,
      latest_check: latestCheck(user.internal_id, labId),
      sessions: sessions.map((s) => ({ started_at: s.started_at, duration_seconds: s.duration_seconds ?? undefined, check_count: s.check_count, outcome: s.outcome })),
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
        solution_guide_url: `https://docs.example.invalid/labs/${labId}-solution`,
        instructor_guide_url: `https://docs.example.invalid/labs/${labId}-instructor`,
      },
    },
    check_results: checks.map((c) => ({ timestamp: c.timestamp, check_result: c.check_result })),
  };
}
