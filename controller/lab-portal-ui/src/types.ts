export interface User {
  username: string;
  role: "student" | "instructor";
  student_id?: string;
  must_change_password?: boolean;
}

export interface Lab {
  id: string;
  title: string;
  difficulty?: string;
  status?: string;
  story?: { situation?: string; role?: string };
  deadline?: string;
}

export interface LabDetail {
  scenario: Scenario;
  status: string;
  endpoints?: LabEndpoints;
  csrf_token: string;
  deadline?: string;
}

export interface Scenario {
  title: string;
  difficulty?: string;
  story?: { situation?: string; role?: string };
  lifecycle?: { idle_timeout_minutes?: number; max_runtime_minutes?: number };
  checker?: { checks?: CheckerCheck[] };
  documentation?: {
    student_guide_url?: string;
    solution_guide_url?: string;
    instructor_guide_url?: string;
  };
}

export interface CheckerCheck {
  name: string;
  label?: string;
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
  member_count: number;
  status?: "approved" | "pending" | null;
}

export interface Group {
  id: number;
  name: string;
  member_count: number;
  lab_count: number;
  pending_count: number;
  created_at?: string;
}

export interface GroupDetail {
  id: number;
  name: string;
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
  email: string;
  semester?: string;
  study_program?: string;
}

export interface PendingMember extends GroupMember {
  user_id: number;
  requested_at?: string;
}

export interface DashboardStats {
  total_groups: number;
  total_students: number;
  total_labs: number;
  total_pending: number;
  total_passed: number;
  total_possible: number;
  total_at_risk: number;
  active_this_week: number;
  groups: Group[];
  recent_activity: ActivityEvent[];
}

export interface ActivityEvent {
  student_id: string;
  action: string;
  lab_title: string;
  timestamp: string;
}

export interface GroupProgress {
  total_students: number;
  total_labs: number;
  total_passed: number;
  total_possible: number;
  total_at_risk: number;
  students: StudentProgress[];
  labs: LabProgress[];
}

export interface StudentProgress {
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
}

export interface LabProgress {
  lab_id: string;
  title: string;
  students_passed: number;
  students_attempted: number;
  avg_time_minutes: number;
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
  sessions?: SessionSummary[];
}

export interface SessionSummary {
  started_at?: string;
  duration_seconds?: number;
  check_count?: number;
  outcome?: string;
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
  groups?: Array<{ id: number; name: string }>;
}

export interface FeedbackInfo {
  csrf_token: string;
  session_id?: string;
  already_submitted?: boolean;
}

export interface InstructorLabInfo {
  id: string;
  title: string;
  difficulty?: string;
}

export interface InstructorLabDetailData {
  scenario: Scenario;
  feedback_count: number;
}

export interface Route {
  page: string;
  labId?: string;
  groupId?: number;
  studentId?: string;
}

export interface StudentLabResult {
  lab_id: string;
  lab_title: string;
  difficulty?: string;
  result: "passed" | "failed" | "not_attempted";
  sessions_attempted: number;
  total_time_seconds: number;
  last_active: string | null;
}

export interface StudentResultsData {
  labs: StudentLabResult[];
  total_sessions: number;
  total_time_seconds: number;
  total_passed: number;
  total_labs: number;
}
