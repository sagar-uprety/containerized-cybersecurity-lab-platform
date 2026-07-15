import demoData from "./demo-data.json";

export interface MockLab {
  id: string;
  title: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  story: { situation: string; role: string };
  checker_version: number;
  criteria: Array<{ name: string; label: string; kind: "objective" | "guardrail" }>;
}

export interface MockUser {
  id: number;
  internal_id: string;
  number: number;
  email: string;
  semester: string;
  study_program: string;
}

export interface MockGroup {
  id: number;
  name: string;
  semester: string;
  is_active: boolean;
  created_at: string;
}

export interface MockMembership {
  group_id: number;
  user_id: number;
  status: "approved" | "pending";
  requested_at: string;
  approved_at?: string;
}

export interface MockGroupLab {
  id: number;
  group_id: number;
  lab_id: string;
  deadline: string | null;
  assigned_at: string;
}

export interface MockLifecycleEvent {
  id: string;
  student_id: string;
  lab_id: string;
  action: string;
  occurred_at: string;
  timestamp: string;
  result: "success" | "error" | "rejected";
  session_id?: string;
  actor_id: string;
  actor_type: "student" | "instructor" | "system";
  reason?: string;
  operation_duration_seconds?: number;
}

export interface MockCheckResult {
  id: string;
  student_id: string;
  lab_id: string;
  group_id: number;
  timestamp: string;
  occurred_at: string;
  session_id?: string;
  actor: string;
  actor_type: "student" | "instructor" | "system";
  phase: "baseline" | "student" | "final";
  operation_duration_seconds: number;
  check_result: {
    status: "vulnerable" | "partial" | "fixed" | "unknown" | "error";
    passed: boolean;
    checker_version: number;
    checks: Array<{
      name: string;
      label: string;
      kind: "objective" | "guardrail";
      passed: boolean;
      observed_state: string;
      matched_states: string[];
      exit_code: number;
      output: string;
    }>;
  };
}

export interface MockCommandEvent {
  id: string;
  student_id: string;
  lab_id: string;
  timestamp: string;
  occurred_at: string;
  event: string;
  command: string;
  session_id?: string;
  lab_session_id?: string;
  terminal_session_id?: string;
}

export interface MockIntervention {
  id: number;
  student_id: string;
  group_id: number;
  lab_id?: string;
  reason: "overdue_incomplete" | "not_started_near_deadline" | "repeated_criterion_failure" | "no_check_recorded" | "environment_error";
  note: string;
  owner: string;
  status: "open" | "contacted" | "resolved";
  follow_up_at?: string;
  created_at: string;
  updated_at: string;
}

export const LABS = demoData.labs as MockLab[];
export const CHECKS_POOL = Object.fromEntries(
  LABS.map((lab) => [lab.id, lab.criteria])
) as Record<string, MockLab["criteria"]>;

const users = demoData.users as MockUser[];
const groups = demoData.groups as MockGroup[];
const memberships = demoData.memberships.map((item) => ({
  ...item,
  approved_at: item.approved_at || undefined,
})) as MockMembership[];
const groupLabs = demoData.group_labs as MockGroupLab[];
const lifecycleEvents = demoData.lifecycle_events.map((item) => ({
  ...item,
  timestamp: item.occurred_at,
  session_id: item.session_id || undefined,
  reason: item.reason || undefined,
})) as MockLifecycleEvent[];
const checkResults = demoData.checks.map((item) => ({
  ...item,
  timestamp: item.occurred_at,
  session_id: item.session_id || undefined,
  actor: item.actor_id,
})) as MockCheckResult[];
const commandEvents = demoData.commands.map((item) => ({
  ...item,
  timestamp: item.occurred_at,
  session_id: item.terminal_session_id || undefined,
  lab_session_id: item.lab_session_id || undefined,
})) as MockCommandEvent[];
const now = new Date(demoData.generated_at).toISOString();
const interventions = demoData.interventions.map((item, index) => ({
  ...item,
  id: index + 1,
  lab_id: item.lab_id || undefined,
  follow_up_at: item.follow_up_at || undefined,
  created_at: now,
  updated_at: now,
})) as MockIntervention[];

export const store = {
  users,
  groups,
  memberships,
  groupLabs,
  lifecycleEvents,
  checkResults,
  commandEvents,
  interventions,
  sessions: demoData.sessions,
  feedback: demoData.feedback,
};

export const INSTRUCTOR_USER = { username: "instructor@thesis.local", role: "instructor" as const };
const demoStudent = users.find((user) => memberships.some((membership) => membership.user_id === user.id && membership.status === "approved"))!;
export const STUDENT_USER = { username: demoStudent.email, role: "student" as const, student_id: demoStudent.internal_id };

const studentMemberships = memberships.filter((item) => item.user_id === demoStudent.id && item.status === "approved");
const studentAssignments = groupLabs.filter((item) => studentMemberships.some((membership) => membership.group_id === item.group_id));
export const studentLabState: Record<string, { status: "not_created" | "running" | "stopped" | "passed"; deadline: string | null }> = Object.fromEntries(
  studentAssignments.map((assignment) => {
    const sessions = store.sessions.filter((item) => item.student_id === demoStudent.internal_id && item.lab_id === assignment.lab_id);
    const checks = checkResults.filter((item) => item.student_id === demoStudent.internal_id && item.lab_id === assignment.lab_id);
    const open = sessions.some((item) => !item.ended_at);
    const passed = checks.some((item) => item.check_result.passed);
    return [assignment.lab_id, { status: open ? "running" : passed ? "passed" : sessions.length ? "stopped" : "not_created", deadline: assignment.deadline }];
  })
);

export interface StudentLabResult {
  lab_id: string;
  lab_title: string;
  difficulty: MockLab["difficulty"];
  result: "passed" | "failed" | "not_attempted";
  sessions_attempted: number;
  total_time_seconds: number;
  last_active: string | null;
}

export const STUDENT_RESULTS: StudentLabResult[] = studentAssignments.map((assignment) => {
  const lab = LABS.find((item) => item.id === assignment.lab_id)!;
  const sessions = store.sessions.filter((item) => item.student_id === demoStudent.internal_id && item.lab_id === assignment.lab_id);
  const checks = checkResults.filter((item) => item.student_id === demoStudent.internal_id && item.lab_id === assignment.lab_id);
  const runtime = sessions.reduce((total, item) => total + (item.ended_at ? (new Date(item.ended_at).getTime() - new Date(item.started_at).getTime()) / 1000 : 0), 0);
  return {
    lab_id: lab.id,
    lab_title: lab.title,
    difficulty: lab.difficulty,
    result: checks.some((item) => item.check_result.passed) ? "passed" : sessions.length ? "failed" : "not_attempted",
    sessions_attempted: sessions.length,
    total_time_seconds: runtime,
    last_active: sessions.map((item) => item.ended_at || item.started_at).sort().slice(-1)[0] || null,
  };
});

export const LAB_FEEDBACK_RATINGS: Record<string, number[]> = Object.fromEntries(
  LABS.map((lab) => [lab.id, store.feedback.filter((item) => item.lab_id === lab.id).map((item) => item.section_b_rating)])
);

let nextGroupId = Math.max(...groups.map((group) => group.id)) + 1;
export function allocGroupId(): number {
  return nextGroupId++;
}
