import { http, HttpResponse } from "msw";
import { store, LABS, INSTRUCTOR_USER, STUDENT_USER, studentLabState, allocGroupId } from "./data";
import {
  dashboardStats, groupSummary, groupDetail, groupProgress, studentsProgress,
  studentDetail, sessionDetail,
} from "./compute";

const API = "/api";

// Dev-only role switch for exercising both instructor and student UI against the mock backend:
// localStorage.setItem("mockRole", "student") in the browser console, then reload.
function currentRole(): "instructor" | "student" {
  return localStorage.getItem("mockRole") === "student" ? "student" : "instructor";
}

export const handlers = [
  http.get(`${API}/me`, () =>
    HttpResponse.json(
      currentRole() === "student"
        ? { ...STUDENT_USER, must_change_password: false }
        : { ...INSTRUCTOR_USER, must_change_password: false }
    )
  ),
  http.post(`${API}/logout`, () => HttpResponse.json(null, { status: 204 })),
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
    studentLabState[String(params.id)] = { status: "running", deadline: studentLabState[String(params.id)]?.deadline ?? null };
    return HttpResponse.json({ ok: true });
  }),
  http.post(`${API}/labs/:id/stop`, ({ params }) => {
    studentLabState[String(params.id)] = { status: "stopped", deadline: studentLabState[String(params.id)]?.deadline ?? null };
    return HttpResponse.json({ ok: true });
  }),
  http.post(`${API}/labs/:id/reset`, () => HttpResponse.json({ ok: true })),
  http.post(`${API}/labs/:id/end`, ({ params }) => {
    studentLabState[String(params.id)] = { status: "stopped", deadline: studentLabState[String(params.id)]?.deadline ?? null };
    return HttpResponse.json({ ok: true });
  }),
  http.post(`${API}/labs/:id/check`, () =>
    HttpResponse.json({
      status: "vulnerable",
      checks: [
        { name: "auth_required", passed: false },
        { name: "no_anon_access", passed: true },
      ],
    })
  ),
  http.post(`${API}/heartbeat/:id`, () => HttpResponse.json({ ok: true })),

  http.get(`${API}/labs/:id/feedback`, () => HttpResponse.json({ csrf_token: "mock-csrf-token", session_id: "mock-session-id", already_submitted: false })),
  http.post(`${API}/labs/:id/feedback`, () => HttpResponse.json({ ok: true })),

  http.get(`${API}/instructor/dashboard`, () => HttpResponse.json(dashboardStats())),

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
    const rows = [["Student", "Email", "Passed", "Sessions", "Time Spent (min)", "Last Active"]];
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
      if (m.group_id === groupId && body.user_ids.includes(m.user_id)) m.status = "approved";
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
    else store.groupLabs.push({ group_id: groupId, lab_id: body.lab_id, deadline: body.deadline });
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
      feedback_count: Math.floor(Math.random() * 6),
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

  http.get(`${API}/instructor/students/:studentId`, ({ params }) => {
    const detail = studentDetail(String(params.studentId));
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

  http.get(`${API}/instructor/feedback/:labId`, ({ params }) =>
    HttpResponse.json([{ response_id: "1", timestamp: new Date().toISOString(), lab_id: params.labId, student_id: "student01", section_a: "Mock feedback response.", section_b_rating: 4, section_b: "Clear enough." }])
  ),
];
