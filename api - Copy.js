// src/api.js
const BASE = "http://localhost:4000";

async function checkResponse(res) {
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch(e) {}
  if (!res.ok) {
    const err = new Error("Request failed");
    err.status = res.status;
    err.body = json ?? text;
    throw err;
  }
  return json ?? text;
}

export async function login(username, password) {
  const res = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  return checkResponse(res);
}

export async function getQuestions() {
  const url = new URL(`${BASE}/api/questions`);
  // allow optional topic param via argument overloading
  if (arguments.length > 0 && arguments[0]) url.searchParams.set('topic', arguments[0]);
  const res = await fetch(url.toString());
  return checkResponse(res);
}

export async function adminUsers() {
  const res = await fetch(`${BASE}/api/admin/users`);
  return checkResponse(res);
}

export async function submitAnswers(userId, answers, cacheKey, courseId) {
  const body = { userId, answers, cacheKey };
  if (courseId) body.courseId = courseId;
  const res = await fetch(`${BASE}/api/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return checkResponse(res);
}

export async function getCourses() {
  const res = await fetch(`${BASE}/api/courses`);
  return checkResponse(res);
}

export async function createAdmin(username, password, secret) {
  const res = await fetch(`${BASE}/api/admin/create`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, secret })
  });
  return checkResponse(res);
}

export async function createStudent(username, password) {
  const res = await fetch(`${BASE}/api/admin/create-student`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password })
  });
  return checkResponse(res);
}

export async function listEnrollments() {
  const res = await fetch(`${BASE}/api/admin/enrollments`);
  return checkResponse(res);
}

export async function enrollStudent(userId, courseId) {
  const res = await fetch(`${BASE}/api/admin/enroll`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, courseId })
  });
  return checkResponse(res);
}

export async function deleteUser(userId) {
  const res = await fetch(`${BASE}/api/admin/user/${userId}`, { method: 'DELETE' });
  return checkResponse(res);
}

export async function deleteEnrollment(enrollmentId) {
  const res = await fetch(`${BASE}/api/admin/enrollment/${enrollmentId}`, { method: 'DELETE' });
  return checkResponse(res);
}

export async function getLinks() {
  const res = await fetch(`${BASE}/api/admin/links`);
  return checkResponse(res);
}

export async function saveLinks(userId, links) {
  const res = await fetch(`${BASE}/api/admin/links`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, links })
  });
  return checkResponse(res);
}

export async function getCachedQuiz(cacheKey) {
  const res = await fetch(`${BASE}/api/cache/${cacheKey}`);
  return checkResponse(res);
}

export async function getTutorFeedback(payload) {
  const res = await fetch(`${BASE}/api/ai-tutor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return checkResponse(res);
}

export async function downloadTutorPDF(concept, content) {
  const res = await fetch(`${BASE}/api/ai-tutor/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ concept, tutoringText: content })
  });
  if (!res.ok) throw new Error("PDF download failed");
  return res.blob();
}