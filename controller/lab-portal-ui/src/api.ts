import type {
  User,
  Lab,
  LabDetail,
  CheckResultData,
  EnrollmentOption,
  Group,
  GroupDetail,
  GroupProgress,
  StudentDetail,
  SessionDetail,
  StudentsProgressEntry,
  FeedbackInfo,
  InstructorLabInfo,
  InstructorLabDetailData,
  InstructorFeedbackSummary,
  SystemStatus,
  StudentResultsData,
  StudentLabResultsData,
  InstructorAnalyticsData,
  WorkstationAccess,
  Instructor,
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

async function request<T>(path: string, options: RequestInit = {}, notifySessionExpired = true): Promise<T> {
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
    if (response.status === 401 && notifySessionExpired && onSessionExpired) {
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
  return request(
    "/login",
    {
      method: "POST",
      body: JSON.stringify({ username, password }),
      headers: { "Content-Type": "application/json" },
    },
    false,
  );
}

export function logout(): Promise<null> {
  return request("/logout", { method: "POST" });
}

export function getMe(): Promise<User> {
  return request("/me", {}, false);
}

export function getWorkstationAccess(): Promise<WorkstationAccess> {
  return request("/workstation-access");
}

export function getLabs(groupId?: number): Promise<Lab[]> {
  const query = groupId != null ? `?group_id=${groupId}` : "";
  return request(`/labs${query}`);
}

export function getLabDetail(labId: string, groupId?: number): Promise<LabDetail> {
  const query = groupId != null ? `?group_id=${groupId}` : "";
  return request(`/labs/${labId}${query}`);
}

export function getLabFeedback(labId: string, groupId: number): Promise<FeedbackInfo> {
  return request(`/labs/${labId}/feedback?group_id=${groupId}`);
}

export function startLab(labId: string, csrfToken: string, groupId: number): Promise<unknown> {
  return request(`/labs/${labId}/start`, {
    method: "POST",
    body: JSON.stringify({ csrf_token: csrfToken, group_id: groupId }),
    headers: { "Content-Type": "application/json" },
  });
}

export function stopLab(labId: string, csrfToken: string, groupId: number): Promise<unknown> {
  return request(`/labs/${labId}/stop`, {
    method: "POST",
    body: JSON.stringify({ csrf_token: csrfToken, group_id: groupId }),
    headers: { "Content-Type": "application/json" },
  });
}

export function resetLab(labId: string, csrfToken: string, groupId: number): Promise<unknown> {
  return request(`/labs/${labId}/reset`, {
    method: "POST",
    body: JSON.stringify({ csrf_token: csrfToken, group_id: groupId }),
    headers: { "Content-Type": "application/json" },
  });
}

export function endLab(labId: string, csrfToken: string, groupId: number): Promise<unknown> {
  return request(`/labs/${labId}/end`, {
    method: "POST",
    body: JSON.stringify({ csrf_token: csrfToken, group_id: groupId }),
    headers: { "Content-Type": "application/json" },
  });
}

export function runCheck(labId: string, csrfToken: string, groupId: number): Promise<CheckResultData> {
  return request(`/labs/${labId}/check`, {
    method: "POST",
    body: JSON.stringify({ csrf_token: csrfToken, group_id: groupId }),
    headers: { "Content-Type": "application/json" },
  });
}

export function submitFeedback(
  labId: string,
  opts: {
    csrfToken: string;
    sessionId?: string;
    rating: number;
    comment: string;
    issueCategory?: string;
    groupId: number;
  }
): Promise<{ ok: boolean; redirect?: string }> {
  return request(`/labs/${labId}/feedback`, {
    method: "POST",
    body: JSON.stringify({
      csrf_token: opts.csrfToken,
      session_id: opts.sessionId,
      rating: opts.rating,
      comment: opts.comment,
      issue_category: opts.issueCategory,
      group_id: opts.groupId,
    }),
    headers: { "Content-Type": "application/json" },
  });
}

export function sendHeartbeat(labId: string, groupId: number): Promise<unknown> {
  return request(`/heartbeat/${labId}?group_id=${groupId}`, { method: "POST" });
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

export function getInstructorStudentDetail(studentId: string, groupId?: number): Promise<StudentDetail> {
  const query = groupId != null ? `?group_id=${groupId}` : "";
  return request(`/instructor/students/${studentId}${query}`);
}

export function getInstructorFeedback(labId: string): Promise<InstructorFeedbackSummary> {
  return request(`/instructor/feedback/${labId}`);
}

export function getStudentResults(groupId?: number): Promise<StudentResultsData> {
  const query = groupId != null ? `?group_id=${groupId}` : "";
  return request(`/results${query}`);
}

export function getStudentLabResults(labId: string, groupId: number): Promise<StudentLabResultsData> {
  return request(`/results/${labId}?group_id=${groupId}`);
}

export function getInstructorAnalytics(
  groupId?: number,
  status: "active" | "archived" | "all" = "active",
): Promise<InstructorAnalyticsData> {
  const query = new URLSearchParams();
  if (groupId != null) query.set("group_id", String(groupId));
  query.set("status", status);
  const qs = query.toString();
  return request(`/instructor/analytics${qs ? `?${qs}` : ""}`);
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

export function getAdminSystemStatus(): Promise<SystemStatus> {
  return request("/admin/system-status");
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

/** Builds a pseudonymized evidence archive for one owned group and returns its download URL. */
export function exportEvidence(groupId: number): Promise<{ ok: boolean; download_url: string }> {
  return instructorPost("/instructor/evidence/export", { group_id: groupId });
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

export function createGroup(name: string, semester?: string): Promise<unknown> {
  return instructorPost("/instructor/groups", { name, semester });
}

export function deleteGroup(groupId: number): Promise<unknown> {
  return instructorDelete(`/instructor/groups/${groupId}`);
}

// Archiving is a one-way action - the backend exposes no reverse route.
export function archiveGroup(groupId: number): Promise<unknown> {
  return instructorPost(`/instructor/groups/${groupId}/archive`, {});
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

export function getGroupProgress(groupId: number): Promise<GroupProgress> {
  return request(`/instructor/groups/${groupId}/progress`);
}

export function renameGroup(
  groupId: number,
  name: string,
  semester?: string,
): Promise<unknown> {
  return instructorPost(`/instructor/groups/${groupId}/rename`, {
    name,
    semester,
  });
}

export function getStudentsProgress(groupId?: number): Promise<StudentsProgressEntry[]> {
  const query = groupId != null ? `?group_id=${groupId}` : "";
  return request(`/instructor/students-progress${query}`);
}

export function getGroupExportCsvUrl(groupId: number): string {
  return `${API_BASE}/instructor/groups/${groupId}/export-csv`;
}

export function getAdminCsrf(): Promise<{ csrf_token: string }> {
  return request("/admin/csrf");
}

async function adminPost<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const csrf = (await getAdminCsrf()).csrf_token;
  return request(path, {
    method: "POST",
    body: JSON.stringify({ ...body, csrf_token: csrf }),
    headers: { "Content-Type": "application/json" },
  });
}

export function getInstructors(): Promise<Instructor[]> {
  return request("/admin/instructors");
}

export function createInstructor(email: string): Promise<Instructor & { initial_password: string }> {
  return adminPost("/admin/instructors", { email });
}

export function disableInstructor(instructorId: number): Promise<unknown> {
  return adminPost(`/admin/instructors/${instructorId}/disable`);
}

export function enableInstructor(instructorId: number): Promise<unknown> {
  return adminPost(`/admin/instructors/${instructorId}/enable`);
}

export function resetInstructorPassword(instructorId: number): Promise<{ new_password: string }> {
  return adminPost(`/admin/instructors/${instructorId}/reset-password`);
}
