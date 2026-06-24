const API_BASE = '/api';

async function request(path, options = {}) {
    const url = `${API_BASE}${path}`;
    const headers = {
        'X-Requested-With': 'fetch',
        ...options.headers,
    };

    const response = await fetch(url, {
        credentials: 'same-origin',
        ...options,
        headers,
    });

    if (!response.ok) {
        let detail = response.statusText;
        try {
            const body = await response.json();
            detail = body.detail || detail;
        } catch {}
        const error = new Error(detail);
        error.status = response.status;
        throw error;
    }

    if (response.status === 204) return null;
    return response.json();
}

export function login(username, password) {
    return request('/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
        headers: { 'Content-Type': 'application/json' },
    });
}

export function logout() {
    return request('/logout', { method: 'POST' });
}

export function getMe() {
    return request('/me');
}

export function getLabs() {
    return request('/labs');
}

export function getLabDetail(labId) {
    return request(`/labs/${labId}`);
}

export function getLabFeedback(labId) {
    return request(`/labs/${labId}/feedback`);
}

export function startLab(labId, csrfToken) {
    return request(`/labs/${labId}/start`, {
        method: 'POST',
        body: JSON.stringify({ csrf_token: csrfToken }),
        headers: { 'Content-Type': 'application/json' },
    });
}

export function stopLab(labId, csrfToken) {
    return request(`/labs/${labId}/stop`, {
        method: 'POST',
        body: JSON.stringify({ csrf_token: csrfToken }),
        headers: { 'Content-Type': 'application/json' },
    });
}

export function resetLab(labId, csrfToken) {
    return request(`/labs/${labId}/reset`, {
        method: 'POST',
        body: JSON.stringify({ csrf_token: csrfToken }),
        headers: { 'Content-Type': 'application/json' },
    });
}

export function endLab(labId, csrfToken) {
    return request(`/labs/${labId}/end`, {
        method: 'POST',
        body: JSON.stringify({ csrf_token: csrfToken }),
        headers: { 'Content-Type': 'application/json' },
    });
}

export function runCheck(labId, csrfToken) {
    return request(`/labs/${labId}/check`, {
        method: 'POST',
        body: JSON.stringify({ csrf_token: csrfToken }),
        headers: { 'Content-Type': 'application/json' },
    });
}

export function submitFeedback(
    labId,
    { csrfToken, sessionId, sectionA, sectionBRating, sectionB }
) {
    return request(`/labs/${labId}/feedback`, {
        method: 'POST',
        body: JSON.stringify({
            csrf_token: csrfToken,
            session_id: sessionId,
            section_a: sectionA,
            section_b_rating: sectionBRating,
            section_b: sectionB,
        }),
        headers: { 'Content-Type': 'application/json' },
    });
}

export function sendHeartbeat(labId) {
    return request(`/heartbeat/${labId}`, { method: 'POST' });
}

// Instructor endpoints
export function getInstructorLabs() {
    return request('/instructor/labs');
}

export function getInstructorLabDetail(labId) {
    return request(`/instructor/labs/${labId}`);
}

export function getInstructorSessionDetail(labId, studentId) {
    return request(`/instructor/labs/${labId}/sessions/${studentId}`);
}

export function getInstructorStudents() {
    return request('/instructor/students');
}

export function getInstructorStudentDetail(studentId) {
    return request(`/instructor/students/${studentId}`);
}

export function getInstructorFeedback(labId) {
    return request(`/instructor/feedback/${labId}`);
}

export function exportEvidence({ csrfToken, evaluationId, anonymize }) {
    return request('/instructor/evidence/export', {
        method: 'POST',
        body: JSON.stringify({
            csrf_token: csrfToken,
            evaluation_id: evaluationId,
            anonymize,
        }),
        headers: { 'Content-Type': 'application/json' },
    });
}

export function changePassword(currentPassword, newPassword) {
    return request('/password', {
        method: 'POST',
        body: JSON.stringify({
            current_password: currentPassword,
            new_password: newPassword,
        }),
        headers: { 'Content-Type': 'application/json' },
    });
}

export function getInstructorCsrf() {
    return request('/instructor/csrf');
}

async function instructorPost(path, body) {
    const csrf = (await getInstructorCsrf()).csrf_token;
    return request(path, {
        method: 'POST',
        body: JSON.stringify({ ...body, csrf_token: csrf }),
        headers: { 'Content-Type': 'application/json' },
    });
}

async function instructorDelete(path) {
    const csrf = (await getInstructorCsrf()).csrf_token;
    return request(path, {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': csrf },
    });
}

export function createStudent(email) {
    return instructorPost('/instructor/students', { email });
}

export function deleteStudent(studentId) {
    return instructorDelete(`/instructor/students/${studentId}`);
}

export function getGroups() {
    return request('/instructor/groups');
}

export function createGroup(name) {
    return instructorPost('/instructor/groups', { name });
}

export function deleteGroup(groupId) {
    return instructorDelete(`/instructor/groups/${groupId}`);
}

export function addGroupMember(groupId, studentId) {
    return instructorPost(`/instructor/groups/${groupId}/members`, { student_id: studentId });
}

export function removeGroupMember(groupId, studentId) {
    return instructorDelete(`/instructor/groups/${groupId}/members/${studentId}`);
}

export function assignGroupLab(groupId, labId) {
    return instructorPost(`/instructor/groups/${groupId}/labs`, { lab_id: labId });
}

export function assignGroupLabWithDeadline(groupId, labId, deadline) {
    return instructorPost(`/instructor/groups/${groupId}/labs`, {
        lab_id: labId,
        deadline: deadline || null,
    });
}

export function unassignGroupLab(groupId, labId) {
    return instructorDelete(`/instructor/groups/${groupId}/labs/${labId}`);
}

// Student self-registration
export function register(email, password, semester, studyProgram) {
    return request('/register', {
        method: 'POST',
        body: JSON.stringify({
            email,
            password,
            semester,
            study_program: studyProgram,
        }),
        headers: { 'Content-Type': 'application/json' },
    });
}

// Student enrollment
export function getEnrollmentOptions() {
    return request('/enrollment-options');
}

export function requestEnrollment(groupId) {
    return request(`/enroll/${groupId}`, { method: 'POST' });
}

// Instructor group detail & actions
export function getGroupDetail(groupId) {
    return request(`/instructor/groups/${groupId}`);
}

export function approveMembers(groupId, userIds, csrfToken) {
    return request(`/instructor/groups/${groupId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ user_ids: userIds, csrf_token: csrfToken }),
        headers: { 'Content-Type': 'application/json' },
    });
}

export function rejectMembers(groupId, userIds, csrfToken) {
    return request(`/instructor/groups/${groupId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ user_ids: userIds, csrf_token: csrfToken }),
        headers: { 'Content-Type': 'application/json' },
    });
}

// Instructor dashboard stats
export function getDashboardStats() {
    return request('/instructor/dashboard');
}

// Group progress (student × lab completion matrix)
export function getGroupProgress(groupId) {
    return request(`/instructor/groups/${groupId}/progress`);
}
