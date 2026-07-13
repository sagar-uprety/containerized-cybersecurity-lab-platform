import { http, HttpResponse } from "msw";
import { store, LABS, INSTRUCTOR_USER, STUDENT_USER, studentLabState, STUDENT_RESULTS, LAB_FEEDBACK_RATINGS, allocGroupId } from "./data";
import type { InterventionStatus, ReviewReasonCode } from "../types";
import {
  dashboardStats, groupSummary, groupDetail, groupProgress, studentsProgress,
  studentDetail, sessionDetail,
  analytics,
} from "./compute";

const API = "/api";

// Dev-only role switch for exercising both instructor and student UI against the mock backend:
// localStorage.setItem("mockRole", "student") in the browser console, then reload.
function currentRole(): "instructor" | "student" {
  return localStorage.getItem("mockRole") === "student" ? "student" : "instructor";
}

function currentUser() {
  return currentRole() === "student" ? STUDENT_USER : INSTRUCTOR_USER;
}

let nextEvidenceId = 100000;

function currentSession(labId: string) {
  return [...store.sessions].reverse().find((item) => item.student_id === STUDENT_USER.student_id && item.lab_id === labId && !item.ended_at);
}

function appendLifecycle(labId: string, action: string, result: "success" | "error" = "success", sessionId?: string, reason?: string) {
  const timestamp = new Date().toISOString();
  store.lifecycleEvents.push({
    id: `mock-event-${nextEvidenceId++}`,
    student_id: STUDENT_USER.student_id,
    lab_id: labId,
    action,
    occurred_at: timestamp,
    timestamp,
    result,
    session_id: sessionId,
    actor_id: STUDENT_USER.username,
    actor_type: "student",
    reason,
    operation_duration_seconds: 0.8,
  });
}

function startSession(labId: string) {
  const assignment = store.groupLabs.find((item) => item.lab_id === labId && store.memberships.some((membership) => membership.group_id === item.group_id && membership.status === "approved" && store.users.find((user) => user.id === membership.user_id)?.internal_id === STUDENT_USER.student_id));
  const sessionId = `mock-session-${nextEvidenceId++}`;
  store.sessions.push({
    id: sessionId,
    student_id: STUDENT_USER.student_id,
    lab_id: labId,
    group_id: assignment?.group_id || 1,
    started_at: new Date().toISOString(),
    ended_at: null,
    outcome: "running",
    close_reason: null,
  });
  appendLifecycle(labId, "start", "success", sessionId);
  return sessionId;
}

function closeSession(labId: string, outcome: "stop" | "end" | "reset", reason: string) {
  const session = currentSession(labId);
  if (!session) return;
  session.ended_at = new Date().toISOString();
  session.outcome = outcome;
  session.close_reason = reason;
  appendLifecycle(labId, outcome, "success", session.id, reason);
}

export const handlers = [
  http.get(`${API}/me`, () =>
    localStorage.getItem("mockAuthenticated") === "false"
      ? HttpResponse.json({ detail: "Not authenticated" }, { status: 401 })
      : HttpResponse.json({ ...currentUser(), must_change_password: false })
  ),
  http.post(`${API}/login`, async ({ request }) => {
    const body = await request.json() as { username?: string };
    const role = body.username?.toLowerCase().includes("instructor") ? "instructor" : "student";
    localStorage.setItem("mockRole", role);
    localStorage.setItem("mockAuthenticated", "true");
    return HttpResponse.json({ user: role === "instructor" ? INSTRUCTOR_USER : STUDENT_USER });
  }),
  http.post(`${API}/register`, () => {
    localStorage.setItem("mockRole", "student");
    localStorage.setItem("mockAuthenticated", "true");
    return HttpResponse.json({ user: STUDENT_USER });
  }),
  http.post(`${API}/logout`, () => {
    localStorage.setItem("mockAuthenticated", "false");
    return new HttpResponse(null, { status: 204 });
  }),
  http.post(`${API}/password`, () => HttpResponse.json({ ok: true })),
  http.get(`${API}/instructor/csrf`, () => HttpResponse.json({ csrf_token: "mock-csrf-token" })),

  http.get(`${API}/enrollment-options`, () =>
    HttpResponse.json(
      store.groups.slice(0, 3).map((g, i) => ({
        id: g.id,
        name: g.name,
        member_count: 10 + i * 7,
        status: i === 0 ? "approved" : i === 1 ? "pending" : null,
      }))
    )
  ),
  http.post(`${API}/enroll/:groupId`, () => HttpResponse.json({ ok: true })),

  http.get(`${API}/labs`, () =>
    HttpResponse.json(
      LABS.map((l) => ({
        id: l.id,
        title: l.title,
        difficulty: l.difficulty,
        status: studentLabState[l.id]?.status ?? "not_created",
        story: l.story,
        deadline: studentLabState[l.id]?.deadline ?? null,
      }))
    )
  ),

  http.get(`${API}/labs/:id`, ({ params }) => {
    const lab = LABS.find((l) => l.id === params.id);
    if (!lab) return HttpResponse.json({ detail: "Lab not found" }, { status: 404 });
    const state = studentLabState[lab.id] ?? { status: "not_created" as const, deadline: null };
    const isRunning = state.status === "running";
    return HttpResponse.json({
      scenario: {
        title: lab.title,
        difficulty: lab.difficulty,
        story: lab.story,
        lifecycle: { idle_timeout_minutes: 30, max_runtime_minutes: 180 },
        checker: { checks: [{ name: "auth_required", label: "Authentication required" }, { name: "no_anon_access", label: "Anonymous access blocked" }] },
      },
      status: state.status,
      deadline: state.deadline,
      csrf_token: "mock-csrf-token",
      endpoints: isRunning
        ? { browser_terminal: "about:blank", ssh: `ssh student01@lab-worker.example -p 2201`, guide_url: `https://docs.example.invalid/labs/${lab.id}` }
        : undefined,
    });
  }),

  http.post(`${API}/labs/:id/start`, ({ params }) => {
    const labId = String(params.id);
    if (!currentSession(labId)) startSession(labId);
    studentLabState[labId] = { status: "running", deadline: studentLabState[labId]?.deadline ?? null };
    return HttpResponse.json({ ok: true });
  }),
  http.post(`${API}/labs/:id/stop`, ({ params }) => {
    const labId = String(params.id);
    closeSession(labId, "stop", "student_stop");
    studentLabState[labId] = { status: "stopped", deadline: studentLabState[labId]?.deadline ?? null };
    return HttpResponse.json({ ok: true });
  }),
  http.post(`${API}/labs/:id/reset`, ({ params }) => {
    const labId = String(params.id);
    closeSession(labId, "reset", "student_reset");
    startSession(labId);
    studentLabState[labId] = { status: "running", deadline: studentLabState[labId]?.deadline ?? null };
    return HttpResponse.json({ ok: true });
  }),
  http.post(`${API}/labs/:id/end`, ({ params }) => {
    const labId = String(params.id);
    closeSession(labId, "end", "student_end");
    studentLabState[labId] = { status: "stopped", deadline: studentLabState[labId]?.deadline ?? null };
    return HttpResponse.json({ ok: true, redirect: `/labs/${labId}/feedback` });
  }),
  http.post(`${API}/labs/:id/check`, ({ params }) => {
    const labId = String(params.id);
    const lab = LABS.find((item) => item.id === labId);
    const sessionId = currentSession(labId)?.id;
    const checks = (lab?.criteria || []).map((criterion, index) => ({
      ...criterion,
      passed: criterion.kind === "guardrail" || index === 0,
      observed_state: criterion.kind === "guardrail" || index === 0 ? "fixed" : "vulnerable",
      matched_states: [criterion.kind === "guardrail" || index === 0 ? "fixed" : "vulnerable"],
      exit_code: 0,
      output: criterion.kind === "guardrail" || index === 0 ? "FIXED" : "VULNERABLE",
    }));
    const objectives = checks.filter((criterion) => criterion.kind === "objective");
    const fixed = objectives.filter((criterion) => criterion.passed).length;
    const status: "fixed" | "vulnerable" | "partial" = fixed === objectives.length ? "fixed" : fixed === 0 ? "vulnerable" : "partial";
    const timestamp = new Date().toISOString();
    const checkResult = { status, passed: status === "fixed", checker_version: lab?.checker_version || 1, checks };
    store.checkResults.push({ id: `mock-check-${nextEvidenceId++}`, student_id: STUDENT_USER.student_id, lab_id: labId, group_id: store.sessions.find((item) => item.id === sessionId)?.group_id || 1, timestamp, occurred_at: timestamp, session_id: sessionId, actor: STUDENT_USER.username, actor_type: "student", phase: "student", operation_duration_seconds: 1.1, check_result: checkResult });
    appendLifecycle(labId, "check", "success", sessionId);
    return HttpResponse.json(checkResult);
  }),
  http.post(`${API}/heartbeat/:id`, () => HttpResponse.json({ ok: true })),

  http.get(`${API}/labs/:id/feedback`, ({ params }) => {
    const labId = String(params.id);
    const session = [...store.sessions].reverse().find((item) => item.student_id === STUDENT_USER.student_id && item.lab_id === labId);
    return HttpResponse.json({ csrf_token: "mock-csrf-token", session_id: session?.id, already_submitted: !!store.feedback.find((item) => item.lab_session_id === session?.id) });
  }),
  http.post(`${API}/labs/:id/feedback`, async ({ params, request }) => {
    const body = await request.json() as { session_id?: string; section_a?: string; section_b_rating?: number; section_b?: string; issue_category?: string };
    if (!body.session_id || store.feedback.some((item) => item.lab_session_id === body.session_id)) return HttpResponse.json({ detail: "Feedback already submitted for this lab session" }, { status: 400 });
    if (!body.section_b_rating || body.section_b_rating < 1 || body.section_b_rating > 5 || (body.section_a?.trim().length || 0) < 4 || (body.section_b?.trim().length || 0) < 4) return HttpResponse.json({ detail: "Invalid feedback" }, { status: 400 });
    store.feedback.push({ id: `mock-feedback-${nextEvidenceId++}`, lab_session_id: body.session_id, student_id: STUDENT_USER.student_id, lab_id: String(params.id), section_a: body.section_a!, section_b_rating: body.section_b_rating, section_b: body.section_b!, issue_category: body.issue_category || null, occurred_at: new Date().toISOString() });
    return HttpResponse.json({ ok: true });
  }),

  http.get(`${API}/results`, () => {
    const labs = STUDENT_RESULTS;
    const total_sessions = labs.reduce((acc, l) => acc + l.sessions_attempted, 0);
    const total_time_seconds = labs.reduce((acc, l) => acc + l.total_time_seconds, 0);
    const total_passed = labs.filter((l) => l.result === "passed").length;
    return HttpResponse.json({ labs, total_sessions, total_time_seconds, total_passed, total_labs: labs.length });
  }),

  http.get(`${API}/results/:labId`, ({ params }) => {
    const labId = String(params.labId);
    const result = STUDENT_RESULTS.find((lab) => lab.lab_id === labId);
    if (!result) return HttpResponse.json({ detail: "Result not found" }, { status: 404 });
    const detail = studentDetail(STUDENT_USER.student_id)?.labs.find((lab) => lab.lab_id === labId);
    return HttpResponse.json({
      lab_id: labId,
      lab_title: result.lab_title,
      total_sessions: detail?.total_sessions || 0,
      latest_check: detail?.latest_check,
      sessions: result.result === "not_attempted" ? [] : detail?.sessions || [],
      difficulty: result.difficulty,
      result: result.result,
      total_time_seconds: result.total_time_seconds,
    });
  }),

  http.get(`${API}/instructor/dashboard`, () => HttpResponse.json(dashboardStats())),
  http.get(`${API}/instructor/analytics`, ({ request }) => {
    const group = new URL(request.url).searchParams.get("group_id");
    return HttpResponse.json(analytics(group ? Number(group) : undefined));
  }),

  http.get(`${API}/instructor/interventions`, ({ request }) => {
    const query = new URL(request.url).searchParams;
    const groupId = query.get("group_id");
    const studentId = query.get("student_id");
    const status = query.get("status");
    return HttpResponse.json(store.interventions
      .filter((item) => !groupId || item.group_id === Number(groupId))
      .filter((item) => !studentId || item.student_id === studentId)
      .filter((item) => !status || item.status === status)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
  }),

  http.post(`${API}/instructor/interventions`, async ({ request }) => {
    const body = await request.json() as {
      student_id: string;
      group_id: number;
      lab_id?: string;
      reason: ReviewReasonCode;
      note: string;
      follow_up_at?: string;
    };
    const now = new Date().toISOString();
    const intervention = {
      id: Math.max(0, ...store.interventions.map((item) => item.id)) + 1,
      student_id: body.student_id,
      group_id: body.group_id,
      lab_id: body.lab_id,
      reason: body.reason,
      note: body.note,
      owner: INSTRUCTOR_USER.username,
      status: "open" as const,
      follow_up_at: body.follow_up_at,
      created_at: now,
      updated_at: now,
    };
    store.interventions.push(intervention);
    return HttpResponse.json(intervention, { status: 201 });
  }),

  http.post(`${API}/instructor/interventions/:id`, async ({ params, request }) => {
    const body = await request.json() as { status?: InterventionStatus; note?: string; follow_up_at?: string };
    const intervention = store.interventions.find((item) => item.id === Number(params.id));
    if (!intervention) return HttpResponse.json({ detail: "Intervention not found" }, { status: 404 });
    if (body.status) intervention.status = body.status;
    if (body.note != null) intervention.note = body.note;
    if (body.follow_up_at != null) intervention.follow_up_at = body.follow_up_at;
    intervention.updated_at = new Date().toISOString();
    return HttpResponse.json(intervention);
  }),

  http.get(`${API}/instructor/groups`, () => HttpResponse.json(store.groups.map((g) => groupSummary(g.id)))),

  http.post(`${API}/instructor/groups`, async ({ request }) => {
    const body = (await request.json()) as { name: string };
    const id = allocGroupId();
    store.groups.push({ id, name: body.name, created_at: new Date().toISOString() });
    return HttpResponse.json({ ok: true, id });
  }),

  http.delete(`${API}/instructor/groups/:id`, ({ params }) => {
    const id = Number(params.id);
    store.groups = store.groups.filter((g) => g.id !== id);
    store.memberships = store.memberships.filter((m) => m.group_id !== id);
    store.groupLabs = store.groupLabs.filter((gl) => gl.group_id !== id);
    return HttpResponse.json({ ok: true });
  }),

  http.post(`${API}/instructor/groups/:id/rename`, async ({ params, request }) => {
    const id = Number(params.id);
    const body = (await request.json()) as { name: string };
    const g = store.groups.find((x) => x.id === id);
    if (g) g.name = body.name;
    return HttpResponse.json({ ok: true });
  }),

  http.get(`${API}/instructor/groups/:id`, ({ params }) => {
    const detail = groupDetail(Number(params.id));
    if (!detail) return HttpResponse.json({ detail: "Group not found" }, { status: 404 });
    return HttpResponse.json(detail);
  }),

  http.get(`${API}/instructor/groups/:id/progress`, ({ params }) => HttpResponse.json(groupProgress(Number(params.id)))),

  http.get(`${API}/instructor/groups/:id/export-csv`, ({ params }) => {
    const progress = groupProgress(Number(params.id));
    const rows = [["Student", "Email", "Achieved", "Sessions", "Recorded Runtime (min)", "Last Active"]];
    progress.students.forEach((s) => {
      rows.push([s.student_id, s.email, `${s.labs_passed}/${s.labs_assigned}`, String(s.total_sessions), String(Math.round(s.total_time_seconds / 60)), s.last_active || ""]);
    });
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    return new HttpResponse(csv, { headers: { "Content-Type": "text/csv" } });
  }),

  http.post(`${API}/instructor/groups/:id/approve`, async ({ params, request }) => {
    const groupId = Number(params.id);
    const body = (await request.json()) as { user_ids: number[] };
    store.memberships.forEach((m) => {
      if (m.group_id === groupId && body.user_ids.includes(m.user_id)) {
        m.status = "approved";
        m.approved_at = new Date().toISOString();
      }
    });
    return HttpResponse.json({ ok: true });
  }),

  http.post(`${API}/instructor/groups/:id/reject`, async ({ params, request }) => {
    const groupId = Number(params.id);
    const body = (await request.json()) as { user_ids: number[] };
    store.memberships = store.memberships.filter((m) => !(m.group_id === groupId && body.user_ids.includes(m.user_id)));
    return HttpResponse.json({ ok: true });
  }),

  http.delete(`${API}/instructor/groups/:id/members/:studentId`, ({ params }) => {
    const groupId = Number(params.id);
    const user = store.users.find((u) => u.internal_id === params.studentId);
    if (user) store.memberships = store.memberships.filter((m) => !(m.group_id === groupId && m.user_id === user.id));
    return HttpResponse.json({ ok: true });
  }),

  http.post(`${API}/instructor/groups/:id/labs`, async ({ params, request }) => {
    const groupId = Number(params.id);
    const body = (await request.json()) as { lab_id: string; deadline: string | null };
    const existing = store.groupLabs.find((gl) => gl.group_id === groupId && gl.lab_id === body.lab_id);
    if (existing) existing.deadline = body.deadline;
    else store.groupLabs.push({ id: Math.max(0, ...store.groupLabs.map((item) => item.id)) + 1, group_id: groupId, lab_id: body.lab_id, deadline: body.deadline, assigned_at: new Date().toISOString() });
    return HttpResponse.json({ ok: true });
  }),

  http.delete(`${API}/instructor/groups/:id/labs/:labId`, ({ params }) => {
    const groupId = Number(params.id);
    store.groupLabs = store.groupLabs.filter((gl) => !(gl.group_id === groupId && gl.lab_id === params.labId));
    return HttpResponse.json({ ok: true });
  }),

  http.get(`${API}/instructor/labs`, () =>
    HttpResponse.json(LABS.map((l) => ({ id: l.id, title: l.title, difficulty: l.difficulty })))
  ),

  http.get(`${API}/instructor/labs/:id`, ({ params }) => {
    const lab = LABS.find((l) => l.id === params.id);
    if (!lab) return HttpResponse.json({ detail: "Lab not found" }, { status: 404 });
    return HttpResponse.json({
      scenario: {
        title: lab.title,
        difficulty: lab.difficulty,
        story: lab.story,
        documentation: {
          student_guide_url: `https://docs.example.invalid/labs/${lab.id}`,
          solution_guide_url: `https://docs.example.invalid/labs/${lab.id}-solution`,
          instructor_guide_url: `https://docs.example.invalid/labs/${lab.id}-instructor`,
        },
      },
      feedback_count: LAB_FEEDBACK_RATINGS[lab.id]?.length || 0,
    });
  }),

  http.get(`${API}/instructor/labs/:labId/sessions/:studentId`, ({ params }) =>
    HttpResponse.json(sessionDetail(String(params.labId), String(params.studentId)))
  ),

  http.get(`${API}/instructor/students`, () =>
    HttpResponse.json(
      store.users.map((u) => ({
        student_id: u.internal_id,
        email: u.email,
        username: u.internal_id,
        groups: store.memberships
          .filter((m) => m.user_id === u.id && m.status === "approved")
          .map((m) => ({ id: m.group_id, name: store.groups.find((g) => g.id === m.group_id)!.name })),
      }))
    )
  ),

  http.get(`${API}/instructor/students-progress`, () => HttpResponse.json(studentsProgress())),

  http.get(`${API}/instructor/students/:studentId`, ({ params, request }) => {
    const group = new URL(request.url).searchParams.get("group_id");
    const detail = studentDetail(String(params.studentId), group ? Number(group) : undefined);
    if (!detail) return HttpResponse.json({ detail: "Student not found" }, { status: 404 });
    return HttpResponse.json(detail);
  }),

  http.delete(`${API}/instructor/students/:studentId`, ({ params }) => {
    const user = store.users.find((u) => u.internal_id === params.studentId);
    if (user) {
      store.users = store.users.filter((u) => u.id !== user.id);
      store.memberships = store.memberships.filter((m) => m.user_id !== user.id);
    }
    return HttpResponse.json({ ok: true });
  }),

  http.get(`${API}/instructor/feedback/:labId`, ({ params }) => {
    const responses = store.feedback.filter((item) => item.lab_id === params.labId);
    const ratings = responses.map((item) => item.section_b_rating);
    return HttpResponse.json({
      feedback_count: responses.length,
      feedback_average: responses.length >= 5 ? Math.round((ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 10) / 10 : null,
      rating_distribution: responses.length >= 5 ? Object.fromEntries([1, 2, 3, 4, 5].map((value) => [String(value), ratings.filter((rating) => rating === value).length])) : null,
      responses: responses.length >= 5 ? responses.map((item) => ({ response_id: item.id, timestamp: item.occurred_at, section_a: item.section_a, section_b: item.section_b, issue_category: item.issue_category, synthetic: true })) : [],
    });
  }),
];
