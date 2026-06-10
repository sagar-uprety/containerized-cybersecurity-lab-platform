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
