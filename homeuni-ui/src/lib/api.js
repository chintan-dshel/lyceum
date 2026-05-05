const BASE = '/api';

function getToken() {
  return localStorage.getItem('lyceum_token');
}

async function request(path, options = {}, timeoutMs = 60000) {
  const token = getToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('Request timed out — the server took too long to respond.');
    throw new Error(`Network error: could not reach the API. Is the API server running on port 3001?`);
  }
  clearTimeout(timer);

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

// ── Auth ──────────────────────────────────────────────────
export const auth = {
  register: (data) => request('/auth/register', { method: 'POST', body: data }),
  login: (data) => request('/auth/login', { method: 'POST', body: data }),
  me: () => request('/auth/me'),
};

// ── Programs + Advisor ────────────────────────────────────
export const programs = {
  list: () => request('/programs'),
  get: (id) => request(`/programs/${id}`),
  status: (id) => request(`/programs/${id}/status`),
  delete: (id) => request(`/programs/${id}`, { method: 'DELETE' }),
  chat: (data) => request('/programs/advisor/chat', { method: 'POST', body: data }),
  confirm: (proposal) => request('/programs/advisor/confirm', { method: 'POST', body: { proposal } }),
  nudges: (programId) => request(`/programs/${programId}/nudges`),
  dismissNudge: (nudgeId) => request(`/programs/nudges/${nudgeId}/read`, { method: 'PATCH' }),
};

// ── Curriculum ────────────────────────────────────────────
export const curriculum = {
  get: (programId) => request(`/curriculum/${programId}`),
  getCourse: (courseId) => request(`/curriculum/course/${courseId}`),
  graph: (programId) => request(`/curriculum/${programId}/graph`),
};

// ── Lessons ───────────────────────────────────────────────
export const lessons = {
  list: (courseId) => request(`/lessons/course/${courseId}`),
  get: (id, { retry } = {}) => request(`/lessons/${id}${retry ? '?retry=true' : ''}`),
  start: (id) => request(`/lessons/${id}/start`, { method: 'POST' }),
  visit: (id, data) => request(`/lessons/${id}/visit`, { method: 'POST', body: data }),
  complete: (id) => request(`/lessons/${id}/complete`, { method: 'POST' }),
  struggling: (id) => request(`/lessons/${id}/struggling`, { method: 'POST' }),
  professorHistory: (id) => request(`/lessons/${id}/professor/history`),
  professorChat: (id, message) => request(`/lessons/${id}/professor/chat`, {
    method: 'POST',
    body: { message },
  }),
};

// ── Assignments ───────────────────────────────────────────
export const assignments = {
  list: (courseId) => request(`/assignments/course/${courseId}`),
  get: (id) => request(`/assignments/${id}`),
  submit: (id, content_text) => request(`/assignments/${id}/submit`, {
    method: 'POST',
    body: { content_text },
  }),
  submissions: (id) => request(`/assignments/${id}/submissions`),
};

// ── Exams ─────────────────────────────────────────────────
export const exams = {
  list: (courseId) => request(`/exams/course/${courseId}`),
  get: (id) => request(`/exams/${id}`),
  startAttempt: (id) => request(`/exams/${id}/attempt`, { method: 'POST' }),
  submit: (id, data) => request(`/exams/${id}/submit`, { method: 'POST', body: data }),
  attempts: (id) => request(`/exams/${id}/attempts`),
};

// ── Progress ──────────────────────────────────────────────
export const progress = {
  gradebook: (programId) => request(`/progress/${programId}/gradebook`),
  transcript: (programId) => request(`/progress/${programId}/transcript`),
  graduation: (programId) => request(`/progress/${programId}/graduation`),
  semesterReview: (programId, semesterId) =>
    request(`/progress/${programId}/semester-review/${semesterId}`, { method: 'POST' }),
  issueCertificate: (programId) => request(`/progress/${programId}/certificate`, { method: 'POST' }),
};

// ── Certificates (public) ─────────────────────────────────
export const certificates = {
  verify: (code) => request(`/certificates/${code}`),
};

// ── Lectures ──────────────────────────────────────────────
export const lectures = {
  get: (lessonId) => request(`/lectures/${lessonId}`),
  generate: (lessonId) => request(`/lectures/${lessonId}/generate`, { method: 'POST' }),
};

// ── Study Sessions ────────────────────────────────────────
export const study = {
  createSession: (programId, data) => request(`/study/${programId}/sessions`, { method: 'POST', body: data }),
  getSession: (programId, sessionId) => request(`/study/${programId}/sessions/${sessionId}`),
  sendMessage: (programId, sessionId, data) => request(`/study/${programId}/sessions/${sessionId}/message`, { method: 'POST', body: data }),
  endSession: (programId, sessionId) => request(`/study/${programId}/sessions/${sessionId}/end`, { method: 'PATCH' }),
};

// ── Practice ──────────────────────────────────────────────
export const practice = {
  list: (lessonId) => request(`/lessons/${lessonId}/practice`),
  submit: (lessonId, n, answer) => request(`/lessons/${lessonId}/practice/${n}`, { method: 'POST', body: { answer } }),
};

// ── Flashcards ────────────────────────────────────────────
export const flashcards = {
  getDeck: (lessonId) => request(`/flashcards/lesson/${lessonId}`),
  review: (lessonId, cardIndex, quality) => request(`/flashcards/lesson/${lessonId}/review`, { method: 'POST', body: { cardIndex, quality } }),
  due: () => request('/flashcards/due'),
};

// ── Telemetry ─────────────────────────────────────────────
export const telemetry = {
  summary: () => request('/telemetry/summary'),
  program: (programId) => request(`/telemetry/program/${programId}`),
  course: (courseId) => request(`/telemetry/course/${courseId}`),
};

// ── Streaming professor chat ───────────────────────────────
export function streamProfessorChat(lessonId, message, onChunk, onDone) {
  const token = getToken();
  const controller = new AbortController();

  fetch(`${BASE}/lessons/${lessonId}/professor/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message, stream: true }),
    signal: controller.signal,
  }).then(async (res) => {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') { onDone?.(); return; }
        try {
          const parsed = JSON.parse(data);
          if (parsed.chunk) onChunk(parsed.chunk);
        } catch { /* ignore malformed */ }
      }
    }
    onDone?.();
  }).catch((err) => {
    if (err.name !== 'AbortError') console.error('Stream error:', err);
  });

  return () => controller.abort();
}
