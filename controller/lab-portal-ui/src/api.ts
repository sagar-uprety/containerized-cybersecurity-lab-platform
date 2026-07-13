import type {
  User,
  Lab,
  LabDetail,
  CheckResultData,
  EnrollmentOption,
  Group,
  GroupDetail,
  GroupProgress,
  DashboardStats,
  StudentDetail,
  SessionDetail,
  StudentsProgressEntry,
  FeedbackInfo,
  InstructorLabInfo,
  InstructorLabDetailData,
  StudentResultsData,
} from "./types";

const API_BASE = "/api";

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: () => void): void {
  onSessionExpired = handler;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    "X-Requested-With": "fetch",
    ...(options.headers as Record<string, string>),
  };

  let response: Response;
  try {
    response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers,
    });
  } catch {
    throw new Error("Connection lost. Please check your internet connection.");
  }

  if (!response.ok) {
    if (response.status === 401 && onSessionExpired) {
      onSessionExpired();
      throw new ApiError("Session expired. Please log in again.", 401);
    }
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body.detail || detail;
    } catch {}
    throw new ApiError(detail, response.status);
  }

  if (response.status === 204) return null as T;
  return response.json();
}

export function login(username: string, password: string): Promise<{ user: User }> {
  return request("/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
    headers: { "Content-Type": "application/json" },
  });
}

export function logout(): Promise<null> {
  return request("/logout", { method: "POST" });
}

export function getMe(): Promise<User> {
  return request("/me");
}

export function getLabs(): Promise<Lab[]> {
  return request("/labs");
}

export function getLabDetail(labId: string): Promise<LabDetail> {
  return request(`/labs/${labId}`);
}

export function getLabFeedback(labId: string): Promise<FeedbackInfo> {
  return request(`/labs/${labId}/feedback`);
}

export function startLab(labId: string, csrfToken: string): Promise<unknown> {
  return request(`/labs/${labId}/start`, {
    method: "POST",
    body: JSON.stringify({ csrf_token: csrfToken }),
    headers: { "Content-Type": "application/json" },
  });
}

export function stopLab(labId: string, csrfToken: string): Promise<unknown> {
  return request(`/labs/${labId}/stop`, {
    method: "POST",
    body: JSON.stringify({ csrf_token: csrfToken }),
    headers: { "Content-Type": "application/json" },
  });
}

export function resetLab(labId: string, csrfToken: string): Promise<unknown> {
  return request(`/labs/${labId}/reset`, {
    method: "POST",
    body: JSON.stringify({ csrf_token: csrfToken }),
    headers: { "Content-Type": "application/json" },
  });
}

export function endLab(labId: string, csrfToken: string): Promise<unknown> {
  return request(`/labs/${labId}/end`, {
    method: "POST",
    body: JSON.stringify({ csrf_token: csrfToken }),
    headers: { "Content-Type": "application/json" },
  });
}

export function runCheck(labId: string, csrfToken: string): Promise<CheckResultData> {
  return request(`/labs/${labId}/check`, {
    method: "POST",
    body: JSON.stringify({ csrf_token: csrfToken }),
    headers: { "Content-Type": "application/json" },
  });
}

export function submitFeedback(
  labId: string,
  opts: {
    csrfToken: string;
    sessionId?: string;
    sectionA: string;
    sectionBRating: number;
    sectionB: string;
  }
): Promise<unknown> {
  return request(`/labs/${labId}/feedback`, {
    method: "POST",
    body: JSON.stringify({
      csrf_token: opts.csrfToken,
      session_id: opts.sessionId,
      section_a: opts.sectionA,
      section_b_rating: opts.sectionBRating,
      section_b: opts.sectionB,
    }),
    headers: { "Content-Type": "application/json" },
  });
}

export function sendHeartbeat(labId: string): Promise<unknown> {
  return request(`/heartbeat/${labId}`, { method: "POST" });
}

export function getInstructorLabs(): Promise<InstructorLabInfo[]> {
  return request("/instructor/labs");
}

export function getInstructorLabDetail(labId: string): Promise<InstructorLabDetailData> {
  return request(`/instructor/labs/${labId}`);
}

export function getInstructorSessionDetail(labId: string, studentId: string): Promise<SessionDetail> {
  return request(`/instructor/labs/${labId}/sessions/${studentId}`);
}

export function getInstructorStudents(): Promise<Array<{ student_id: string; email?: string; username?: string; groups?: Array<{ id: number; name: string }> }>> {
  return request("/instructor/students");
}

export function getInstructorStudentDetail(studentId: string): Promise<StudentDetail> {
  return request(`/instructor/students/${studentId}`);
}

export function getInstructorFeedback(labId: string): Promise<unknown> {
  return request(`/instructor/feedback/${labId}`);
}

export function exportEvidence(opts: { csrfToken: string; evaluationId: string; anonymize: boolean }): Promise<unknown> {
  return request("/instructor/evidence/export", {
    method: "POST",
    body: JSON.stringify({
      csrf_token: opts.csrfToken,
      evaluation_id: opts.evaluationId,
      anonymize: opts.anonymize,
    }),
    headers: { "Content-Type": "application/json" },
  });
}

export function getStudentResults(): Promise<StudentResultsData> {
  return request("/results");
}

export function changePassword(currentPassword: string, newPassword: string): Promise<unknown> {
  return request("/password", {
    method: "POST",
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
    headers: { "Content-Type": "application/json" },
  });
}

export function getInstructorCsrf(): Promise<{ csrf_token: string }> {
  return request("/instructor/csrf");
}

async function instructorPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const csrf = (await getInstructorCsrf()).csrf_token;
  return request(path, {
    method: "POST",
    body: JSON.stringify({ ...body, csrf_token: csrf }),
    headers: { "Content-Type": "application/json" },
  });
}

async function instructorDelete<T>(path: string): Promise<T> {
  const csrf = (await getInstructorCsrf()).csrf_token;
  return request(path, {
    method: "DELETE",
    headers: { "X-CSRF-Token": csrf },
  });
}

export function createStudent(email: string): Promise<unknown> {
  return instructorPost("/instructor/students", { email });
}

export function deleteStudent(studentId: string): Promise<unknown> {
  return instructorDelete(`/instructor/students/${studentId}`);
}

export function getGroups(): Promise<Group[]> {
  return request("/instructor/groups");
}

export function createGroup(name: string): Promise<unknown> {
  return instructorPost("/instructor/groups", { name });
}

export function deleteGroup(groupId: number): Promise<unknown> {
  return instructorDelete(`/instructor/groups/${groupId}`);
}

export function addGroupMember(groupId: number, studentId: string): Promise<unknown> {
  return instructorPost(`/instructor/groups/${groupId}/members`, { student_id: studentId });
}

export function removeGroupMember(groupId: number, studentId: string): Promise<unknown> {
  return instructorDelete(`/instructor/groups/${groupId}/members/${studentId}`);
}

export function assignGroupLab(groupId: number, labId: string): Promise<unknown> {
  return instructorPost(`/instructor/groups/${groupId}/labs`, { lab_id: labId });
}

export function assignGroupLabWithDeadline(groupId: number, labId: string, deadline: string | null): Promise<unknown> {
  return instructorPost(`/instructor/groups/${groupId}/labs`, {
    lab_id: labId,
    deadline: deadline || null,
  });
}

export function unassignGroupLab(groupId: number, labId: string): Promise<unknown> {
  return instructorDelete(`/instructor/groups/${groupId}/labs/${labId}`);
}

export function register(email: string, password: string, semester: string, studyProgram: string): Promise<{ user: User }> {
  return request("/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      semester,
      study_program: studyProgram,
    }),
    headers: { "Content-Type": "application/json" },
  });
}

export function getEnrollmentOptions(): Promise<EnrollmentOption[]> {
  return request("/enrollment-options");
}

export function requestEnrollment(groupId: number): Promise<unknown> {
  return request(`/enroll/${groupId}`, { method: "POST" });
}

export function getGroupDetail(groupId: number): Promise<GroupDetail> {
  return request(`/instructor/groups/${groupId}`);
}

export function approveMembers(groupId: number, userIds: number[], csrfToken: string): Promise<unknown> {
  return request(`/instructor/groups/${groupId}/approve`, {
    method: "POST",
    body: JSON.stringify({ user_ids: userIds, csrf_token: csrfToken }),
    headers: { "Content-Type": "application/json" },
  });
}

export function rejectMembers(groupId: number, userIds: number[], csrfToken: string): Promise<unknown> {
  return request(`/instructor/groups/${groupId}/reject`, {
    method: "POST",
    body: JSON.stringify({ user_ids: userIds, csrf_token: csrfToken }),
    headers: { "Content-Type": "application/json" },
  });
}

export function getDashboardStats(): Promise<DashboardStats> {
  return request("/instructor/dashboard");
}

export function getGroupProgress(groupId: number): Promise<GroupProgress> {
  return request(`/instructor/groups/${groupId}/progress`);
}

export function renameGroup(groupId: number, name: string): Promise<unknown> {
  return instructorPost(`/instructor/groups/${groupId}/rename`, { name });
}

export function getStudentsProgress(): Promise<StudentsProgressEntry[]> {
  return request("/instructor/students-progress");
}

export function getGroupExportCsvUrl(groupId: number): string {
  return `${API_BASE}/instructor/groups/${groupId}/export-csv`;
}
