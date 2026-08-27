export interface User {
  username: string;
  role: "student" | "instructor" | "admin";
  student_id?: string;
  must_change_password?: boolean;
}

export interface Instructor {
  id: number;
  email: string;
  active: boolean;
  must_change_password: boolean;
  created_at: string | null;
}

export interface WorkstationAccess {
  student_id: string;
  workstation_password: string;
}

export interface Lab {
  assignment_id: string;
  id: string;
  title: string;
  difficulty?: string;
  status?: string;
  story?: { summary?: string };
  deadline?: string;
  group: { id: number | null; name: string | null; semester?: string | null; is_archived?: boolean };
}

export interface LabDetail {
  scenario: Scenario;
  status: string;
  endpoints?: LabEndpoints;
  csrf_token: string;
  deadline?: string;
  // Server-authoritative: true once the deadline has passed. Never derive this
  // from `deadline` client-side - clock skew would let the UI offer actions
  // the server refuses.
  expired?: boolean;
  group: { id: number | null; name: string | null; semester?: string | null; is_archived?: boolean };
}

export interface Scenario {
  title: string;
  difficulty?: string;
  story?: { summary?: string };
  lifecycle?: { idle_timeout_minutes?: number; max_runtime_minutes?: number };
  checker?: { checks?: CheckerCheck[] };
  documentation?: {
    student_guide_url?: string;
    solution_notes_url?: string;
    instructor_guide_url?: string;
  };
}

export interface CheckerCheck {
  name: string;
  label?: string;
  kind?: "objective" | "guardrail";
}

export interface LabEndpoints {
  browser_terminal: string;
  ssh: string;
  app?: string;
  guide_url?: string;
}

export interface CheckResultData {
  status?: string;
  checks?: Array<{ name: string; passed: boolean }>;
}

export interface EnrollmentOption {
  id: number;
  name: string;
  semester?: string | null;
  is_archived?: boolean;
  member_count: number;
  status?: "approved" | "pending" | null;
}

export interface Group {
  id: number;
  name: string;
  semester?: string | null;
  is_archived?: boolean;
  archived_at?: string | null;
  member_count: number;
  lab_count: number;
  pending_count: number;
  created_at?: string;
}

export interface GroupDetail {
  id: number;
  name: string;
  semester?: string | null;
  is_archived?: boolean;
  archived_at?: string | null;
  csrf_token: string;
  labs: GroupLab[];
  approved_members: GroupMember[];
  pending_members: PendingMember[];
  recent_activity?: ActivityEvent[];
}

export interface GroupLab {
  lab_id: string;
  deadline?: string;
}

export interface GroupMember {
  student_id: string;
  email: string | null;
  semester?: string;
  study_program?: string | null;
}

export interface PendingMember extends GroupMember {
  user_id: number;
  requested_at?: string;
}

export interface ActivityEvent {
  student_id: string;
  student_email: string | null;
  action: string;
  lab_title: string;
  timestamp: string;
  result: string;
  actor_type: "student" | "instructor" | "system";
  reason: string | null;
}

export interface GroupProgress {
  is_archived?: boolean;
  total_students: number;
  total_labs: number;
  total_passed: number;
  total_possible: number;
  total_at_risk: number;
  overdue_incomplete: number;
  students: StudentProgress[];
  labs: LabProgress[];
}

export interface StudentProgress {
  student_id: string;
  email: string | null;
  semester?: string;
  study_program?: string | null;
  labs_assigned: number;
  labs_passed: number;
  total_sessions: number;
  total_time_seconds: number;
  last_active?: string;
  at_risk?: boolean;
  labs_started?: number;
  checks_submitted?: number;
  review_reasons?: ReviewReason[];
}

export interface LabProgress {
  lab_id: string;
  title: string;
  students_passed: number;
  students_attempted: number;
  avg_time_minutes: number;
  students_checked?: number;
  median_recorded_minutes?: number;
  runtime_samples?: number;
}

export interface StudentDetail {
  student_id: string;
  labs: StudentLabDetail[];
}

export interface StudentLabDetail {
  lab_id: string;
  lab_title: string;
  total_sessions?: number;
  latest_check?: { passed?: boolean; status?: string };
  ever_passed?: boolean;
  first_pass_at?: string;
  checks_submitted?: number;
  criteria?: CriterionEvidence[];
  sessions?: SessionSummary[];
  group_id: number;
  group_name: string;
  semester?: string | null;
}

export interface SessionSummary {
  started_at?: string;
  duration_seconds?: number;
  check_count?: number;
  student_check_count: number;
  automatic_check_count: number;
  outcome?: string;
  close_reason?: string | null;
  passed?: boolean | null;
}

export interface SessionDetail {
  status: string;
  duration_seconds?: number;
  commands?: Command[];
  latest_check?: CheckResultData;
  lifecycle_events?: LifecycleEvent[];
  scenario?: Scenario;
  check_results?: Array<{ timestamp?: string; checked_at?: string; check_result?: CheckResultData }>;
}

export interface Command {
  timestamp: string;
  command: string;
}

export interface LifecycleEvent {
  action: string;
  timestamp: string;
  result?: string;
  reason?: string | null;
}

export interface StudentsProgressEntry {
  student_id: string;
  email: string;
  semester?: string;
  study_program?: string;
  labs_assigned: number;
  labs_passed: number;
  total_sessions: number;
  total_time_seconds: number;
  last_active?: string;
  at_risk?: boolean;
  labs_started?: number;
  checks_submitted?: number;
  review_reasons?: ReviewReason[];
  groups?: Array<{ id: number; name: string }>;
}

export interface FeedbackInfo {
  csrf_token: string;
  session_id?: string;
  already_submitted?: boolean;
  // Group owning this feedback obligation.
  group?: { id: number | null; name: string | null; semester?: string | null };
}

export interface DiskUsage {
  /** Paths deduplicated by filesystem device. */
  labels?: string[];
  path: string;
  total_gb: number;
  used_gb: number;
  free_gb: number;
  percent: number;
}

export interface HostUsage {
  /** Null when the host cannot report it (e.g. /proc unavailable). */
  cpu_percent?: number | null;
  /** Core count used to interpret aggregate CPU percentage. */
  cores?: number | null;
  memory_percent?: number;
  memory_used_mb?: number;
  memory_total_mb?: number;
  disks?: DiskUsage[];
}

/** Worker metrics are top-level; management metrics are under portal. */
export interface SystemStatus extends HostUsage {
  running_labs: number;
  cpu_percent: number;
  memory_percent: number;
  memory_used_mb: number;
  memory_total_mb: number;
  portal?: HostUsage;
}

export interface InstructorLabInfo {
  id: string;
  title: string;
  difficulty?: string;
  active_sessions?: number;
  total_students?: number;
  student_guide_url?: string;
  solution_notes_url?: string;
  instructor_guide_url?: string;
  is_sample?: boolean;
  // Extracted server-side from the lab's student-guide markdown; not every
  // lab has one yet, so treat as optional and render nothing when absent.
  description?: string | null;
}

export interface InstructorFeedbackResponse {
  response_id: string;
  timestamp: string;
  section_a?: string;
  comment: string;
  issue_category?: string | null;
  synthetic?: boolean;
}

export interface InstructorFeedbackSummary {
  feedback_count: number;
  feedback_average: number | null;
  rating_distribution: Record<string, number> | null;
  issue_categories: Record<string, number> | null;
  responses: InstructorFeedbackResponse[];
  /** Distinct students of this instructor who currently have the lab assigned.
   *  Distinguishes "nobody has this lab" from "nobody has responded yet". */
  assigned_students: number;
}

export interface InstructorLabDetailData {
  scenario: Scenario;
  feedback_count: number;
  is_sample?: boolean;
}

export interface Route {
  page: string;
  labId?: string;
  groupId?: number;
  studentId?: string;
  section?: "labs" | "pending" | "activity";
}

export interface StudentLabResult {
  assignment_id: string;
  lab_id: string;
  lab_title: string;
  difficulty?: string;
  result: "passed" | "failed" | "not_attempted";
  sessions_attempted: number;
  total_time_seconds: number;
  last_active: string | null;
  group_id: number;
  group_name: string;
  semester: string | null;
}

export interface StudentResultsData {
  labs: StudentLabResult[];
  total_sessions: number;
  total_time_seconds: number;
  total_passed: number;
  total_labs: number;
}

export interface StudentLabResultsData extends StudentLabDetail {
  difficulty?: string;
  result: "passed" | "failed" | "not_attempted";
  total_time_seconds: number;
}

export interface AnalyticsPoint {
  week: string;
  completion_rate: number;
  completed_assignments: number;
  eligible_assignments: number;
  sessions: number;
  active_students: number;
  is_partial?: boolean;
}

export interface AnalyticsLab {
  lab_id: string;
  title: string;
  completion_rate: number;
  started_rate: number;
  check_submission_rate: number;
  median_recorded_minutes: number;
  runtime_samples: number;
  open_sessions: number;
  students_passed: number;
  students_started: number;
  students_checked: number;
  students_assigned: number;
  common_failed_criterion?: string;
  criterion_failure_rate?: number;
  environment_errors: number;
  feedback_count: number;
  feedback_average?: number;
}

export interface AnalyticsGroup {
  id: number;
  name: string;
  is_archived?: boolean;
  completion_rate: number;
  active_rate: number;
  at_risk: number;
  completed_assignments: number;
  eligible_assignments: number;
  active_students: number;
  active_now_students: number;
  total_students: number;
  labs_assigned: number;
  overdue_incomplete: number;
  pending_count: number;
}

export interface InstructorAnalyticsData {
  scope_name?: string;
  as_of: string;
  timezone: string;
  window_label: string;
  status: "active" | "archived" | "all";
  archived_groups_count: number;
  total_groups: number;
  total_labs: number;
  total_students: number;
  completion_rate: number;
  completed_assignments: number;
  eligible_assignments: number;
  active_this_week: number;
  active_now_sessions: number;
  active_now_students: number;
  at_risk: number;
  overdue_incomplete: number;
  overdue_eligible: number;
  median_session_minutes: number;
  median_runtime_samples: number;
  open_sessions: number;
  weekly: AnalyticsPoint[];
  labs: AnalyticsLab[];
  groups: AnalyticsGroup[];
}

export type ReviewReasonCode =
  | "overdue_incomplete"
  | "not_started_near_deadline"
  | "repeated_criterion_failure"
  | "no_check_recorded"
  | "environment_error";

export interface ReviewReason {
  code: ReviewReasonCode;
  label: string;
  lab_id?: string;
  lab_title?: string;
  criterion_name?: string;
}

export interface CriterionEvidence {
  name: string;
  label: string;
  kind: "objective" | "guardrail";
  ever_passed: boolean;
  current_passed: boolean | null;
  current_state?: string;
  total_checks: number;
  failed_checks: number;
  failures_before_achievement: number;
  first_pass_at?: string;
  last_checked_at?: string;
}
