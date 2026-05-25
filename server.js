// backend/server.js
// Restored backend: curated questions + AI tutor (Groq preferred, fallback safe) + PDF export
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const stringSimilarity = require("string-similarity");
const axios = require("axios");
const PDFDocument = require("pdfkit");
const crypto = require("crypto");

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "1mb" }));

// Graceful handler for invalid JSON bodies so the server doesn't crash
app.use((err, req, res, next) => {
  try {
    if (!err) return next();
    // body-parser sets SyntaxError for invalid JSON
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      console.warn('Invalid JSON payload received:', err.message);
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }
    // fallback for other body-parser parse failures
    if (err.type === 'entity.parse.failed') {
      console.warn('Entity parse failed (invalid JSON?):', err.message || err);
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }
  } catch (e) {
    console.warn('Error in JSON error handler', e && e.message);
  }
  return next(err);
});

// ----- paths & storage -----
const ROOT = __dirname;
const CACHE_DIR = path.join(ROOT, "cache");
const DATA_DIR = path.join(ROOT, "data");
const CURATED_PATH = path.join(ROOT, "curated_questions.json");
const COURSES_FILE = path.join(DATA_DIR, "courses.json");

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const USERS_FILE = path.join(DATA_DIR, "users.json");
const ATTEMPTS_FILE = path.join(DATA_DIR, "attempts.json");
const ENROLLMENTS_FILE = path.join(DATA_DIR, "enrollments.json");
const ALLOWED_FILE = path.join(DATA_DIR, "allowed_users.json");
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(ATTEMPTS_FILE)) fs.writeFileSync(ATTEMPTS_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(ENROLLMENTS_FILE)) fs.writeFileSync(ENROLLMENTS_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(ALLOWED_FILE)) fs.writeFileSync(ALLOWED_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(COURSES_FILE)) fs.writeFileSync(COURSES_FILE, JSON.stringify([], null, 2));

function readJSONSafe(p, def = null) {
  try {
    if (!fs.existsSync(p)) return def;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    console.warn("readJSONSafe error", p, e && e.message);
    return def;
  }
}
function writeJSONSafe(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

// ----- password helpers (PBKDF2) -----
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(String(password), salt, 100000, 64, "sha512").toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  try {
    const hash = crypto.pbkdf2Sync(String(password), salt, 100000, 64, "sha512").toString("hex");
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expectedHash, "hex"));
  } catch (e) {
    return false;
  }
}

// ----- load curated questions (should be CS-only: Algorithms, Data Structures, Databases) -----
let curatedPool = [];
try {
  if (!fs.existsSync(CURATED_PATH)) {
    console.warn("curated_questions.json not found at", CURATED_PATH);
    curatedPool = [];
  } else {
    const j = JSON.parse(fs.readFileSync(CURATED_PATH, "utf8"));
    curatedPool = Array.isArray(j.questions) ? j.questions : [];
    console.log("Loaded curated pool:", curatedPool.length, "items");
  }
} catch (e) {
  console.error("Failed loading curated_questions.json", e && e.message);
  curatedPool = [];
}

// --- ensure admin user from env (optional) ---
function ensureAdminFromEnv() {
  const adminUser = process.env.ADMIN_USERNAME;
  const adminPass = process.env.ADMIN_PASSWORD;
  if (!adminUser || !adminPass) return;
  const users = readJSONSafe(USERS_FILE, []);
  const exists = users.find((u) => u.email === adminUser && u.role === 'admin');
  if (exists) return;
  const { salt, hash } = hashPassword(adminPass);
  const user = { id: uuidv4(), email: adminUser, salt, hash, role: 'admin', createdAt: new Date().toISOString() };
  users.push(user);
  writeJSONSafe(USERS_FILE, users);
  console.log('Admin user created from env:', adminUser);
}
ensureAdminFromEnv();

// ensure default courses exist
try {
  const existing = readCourses();
  if (!existing || existing.length === 0) {
    const defaults = [
      {
        id: 'dsa_dbms_level1',
        title: 'Assessment 1',
        topicList: ['Data Structures', 'Databases'],
        description: 'Mixed assessment covering Data Structures and SQL basics (Level 1)',
        level: 1,
        locked: false,
        createdAt: new Date().toISOString()
      },
      {
        id: 'dsa_dbms_level2',
        title: 'Assessment 2',
        topicList: ['Data Structures', 'Databases'],
        description: 'Higher-difficulty assessment focusing on weak topics (Level 2)',
        level: 2,
        locked: false,
        createdAt: new Date().toISOString()
      }
    ];
    writeCourses(defaults);
    console.log('Wrote default courses');
  }
} catch (e) { console.warn('failed ensuring default courses', e && e.message); }

// ----- helpers -----
function normalizeText(s) {
  if (!s) return "";
  return String(s).replace(/<[^>]*>/g, " ").replace(/[^a-zA-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}
function sampleFromPool(type, count, topic) {
  let pool = curatedPool.filter((q) => q.type === type);
  if (topic) pool = pool.filter(p => String(p.topic || p.category || '').toLowerCase() === String(topic).toLowerCase());
  const arr = pool.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const r = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[r]] = [arr[r], arr[i]];
  }
  return arr.slice(0, Math.min(arr.length, count)).map((x) => ({ ...x }));
}

// extended sampler: supports topics array and difficulty filtering and favoring topics
function sampleFromPoolExtended({ type, count = 10, topics = [], difficulty = null, favorTopics = [] }) {
  let pool = curatedPool.filter((q) => q.type === type);
  if (difficulty) pool = pool.filter((q) => String(q.difficulty || '').toLowerCase() === String(difficulty).toLowerCase());
  if (Array.isArray(topics) && topics.length > 0) {
    const lowerTopics = topics.map(t => String(t).toLowerCase());
    pool = pool.filter(p => lowerTopics.includes(String(p.topic || p.category || '').toLowerCase()));
  }
  if (pool.length === 0) return [];
  // Favor certain topics by placing them earlier in the shuffled array
  const favSet = new Set((favorTopics || []).map(f => String(f).toLowerCase()));
  const fav = pool.filter(p => favSet.has(String(p.topic || p.category || '').toLowerCase()));
  const other = pool.filter(p => !favSet.has(String(p.topic || p.category || '').toLowerCase()));
  // shuffle helper
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const r = Math.floor(Math.random() * (i + 1)); [a[i], a[r]] = [a[r], a[i]]; } }
  shuffle(fav); shuffle(other);
  const combined = fav.concat(other);
  return combined.slice(0, Math.min(combined.length, count)).map(x => ({ ...x }));
}

function readCourses() { return readJSONSafe(COURSES_FILE, []); }
function writeCourses(c) { writeJSONSafe(COURSES_FILE, c); }
function getCourseById(id) { const c = readCourses(); return c.find(x => String(x.id) === String(id)); }

// load curated links from backend/data/links.json so non-devs can update easily
const LINKS_FILE = path.join(DATA_DIR, 'links.json');
if (!fs.existsSync(LINKS_FILE)) {
  try { fs.writeFileSync(LINKS_FILE, JSON.stringify({}, null, 2)); } catch (e) { /* ignore */ }
}
let LINKS_MAP = readJSONSafe(LINKS_FILE, {});
// auto-reload when links.json is edited
try {
  fs.watchFile(LINKS_FILE, { interval: 2000 }, () => {
    try { LINKS_MAP = readJSONSafe(LINKS_FILE, {}); console.log('links.json reloaded, topics:', Object.keys(LINKS_MAP).length); } catch (e) {}
  });
} catch (e) { /* ignore watch errors on some platforms */ }

function getLinksForTopic(topic) {
  if (!topic) return [];
  const key = String(topic).trim();
  const val = LINKS_MAP && LINKS_MAP[key];
  return Array.isArray(val) ? val.slice() : [];
}

function hasCompletedCourse(userId, courseId) {
  if (!userId) return false;
  const attempts = readJSONSafe(ATTEMPTS_FILE, []);
  // direct matches where courseId stored on the attempt
  const direct = attempts.filter(a => String(a.userId) === String(userId) && String(a.courseId || '') === String(courseId));
  for (const a of direct) {
    if (a.score === undefined || a.score === null) continue;
    // treat completion as having at least 1 correct answer
    if (Number(a.score) >= 1) return true;
  }

  // fallback: check attempts that reference a cacheKey whose cached quiz contains the courseId
  for (const a of attempts.filter(x => String(x.userId) === String(userId) && x.cacheKey)) {
    try {
      const cachePath = path.join(CACHE_DIR, `${a.cacheKey}.json`);
      if (!fs.existsSync(cachePath)) continue;
      const cached = readJSONSafe(cachePath, {});
      if (String(cached.courseId || '') === String(courseId)) {
        if (a.score === undefined || a.score === null) continue;
        if (Number(a.score) >= 1) return true;
      }
    } catch (e) { /* ignore malformed cache */ }
  }

  return false;
}

function scoreShortAnswer(gold, given, keywords = []) {
  const G = normalizeText(gold);
  const A = normalizeText(given || "");
  if (!A) return 0;
  if (G === A) return 1.0;
  if (Array.isArray(keywords) && keywords.length > 0) {
    let present = 0;
    for (const k of keywords) {
      if (!k) continue;
      if (A.includes(normalizeText(k))) present++;
    }
    const ratio = present / keywords.length;
    if (ratio >= 0.75) return 1.0;
    if (ratio >= 0.4) return 0.5;
  }
  if (A.includes(G) || G.includes(A)) return 1.0;
  try {
    const sim = stringSimilarity.compareTwoStrings(G, A);
    if (sim >= 0.78) return 1.0;
    if (sim >= 0.6) return 0.5;
  } catch (e) {}
  return 0.0;
}

// ----- API: login -----
// Login: accepts { username, password }
app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username and password required" });
  const users = readJSONSafe(USERS_FILE, []);
  let user = users.find((u) => u.email === username);
  if (!user) {
    // Do not auto-register users. Only admin can create accounts.
    return res.status(404).json({ error: 'user not found; admin must create accounts' });
  }
  // existing user: verify password
  if (!user.salt || !user.hash) return res.status(500).json({ error: "user record missing password data" });
  if (!verifyPassword(password, user.salt, user.hash)) return res.status(401).json({ error: "invalid credentials" });
  // update lastLogin timestamp
  try {
    user.lastLogin = new Date().toISOString();
    writeJSONSafe(USERS_FILE, users);
  } catch (e) { console.warn('failed to update lastLogin', e && e.message); }
  // enforce allowed users list: admins always allowed
  const allowed = readJSONSafe(ALLOWED_FILE, []);
  if (user.role !== 'admin') {
    const ok = allowed.includes(String(user.email));
    if (!ok) return res.status(403).json({ error: 'user not allowed to login' });
  }
  const out = { id: user.id, email: user.email, createdAt: user.createdAt, role: user.role || 'student', lastLogin: user.lastLogin };
  res.json(out);
});

// ----- API: get questions (6 MCQ + 4 short) -----
app.get("/api/questions", (req, res) => {
  try {
    const topic = req.query.topic;
    const courseId = req.query.courseId;
    const userId = req.query.userId;

    if (courseId) {
      const course = getCourseById(courseId);
      if (!course) return res.status(404).json({ error: 'course not found' });
      // determine if requester is admin
      let isAdmin = false;
      if (userId) {
        const users = readJSONSafe(USERS_FILE, []);
        const u = users.find(x => String(x.id) === String(userId) || String(x.email) === String(userId));
        if (u && u.role === 'admin') isAdmin = true;
      }
      // enforce lock
      if (course.locked && !isAdmin) {
        if (!userId) return res.status(403).json({ error: 'course locked; userId required' });
        const prereq = course.prerequisite;
        if (prereq && !hasCompletedCourse(userId, prereq)) return res.status(403).json({ error: 'course locked until prerequisite completed' });
      }

      // build questions based on course level
      let mcqs = [], shorts = [];
      if (Number(course.level) === 1) {
        mcqs = sampleFromPoolExtended({ type: 'mcq', count: 6, topics: course.topicList || [], difficulty: 'easy' });
        shorts = sampleFromPoolExtended({ type: 'short', count: 4, topics: course.topicList || [], difficulty: 'easy' });
      } else {
        // level 2: favor user's weak concepts (by topic)
        let weakTopics = [];
        if (userId) {
          const attempts = readJSONSafe(ATTEMPTS_FILE, []);
          const mine = attempts.filter(a => String(a.userId) === String(userId));
          const counter = {};
          for (const a of mine) {
            if (Array.isArray(a.weakConcepts)) {
              for (const w of a.weakConcepts) {
                if (!w || !w.concept) continue;
                counter[String(w.concept)] = (counter[String(w.concept)] || 0) + 1;
              }
            }
          }
          weakTopics = Object.keys(counter).sort((a, b) => counter[b] - counter[a]).slice(0, 3);
        }
        mcqs = sampleFromPoolExtended({ type: 'mcq', count: 6, topics: course.topicList || [], difficulty: 'medium', favorTopics: weakTopics });
        shorts = sampleFromPoolExtended({ type: 'short', count: 4, topics: course.topicList || [], difficulty: 'medium', favorTopics: weakTopics });
      }

      const combined = mcqs.concat(shorts).sort(() => 0.5 - Math.random()).slice(0, 10);
      const cacheKey = `curated_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
      // attach curated links per question when available
      const enriched = combined.map(q => ({ ...q, links: getLinksForTopic(q.topic || q.concept || q.category) }));
      writeJSONSafe(cachePath, { questions: enriched, createdAt: new Date().toISOString(), courseId });
      const clientQs = enriched.map((q) => {
        const c = { ...q };
        delete c.answer;
        delete c.keywords;
        return c;
      });
      return res.json({ questions: clientQs, cacheKey });
    }

    // fallback: old behavior (by topic)
    const mcqs = (topic ? sampleFromPool("mcq", 6, topic) : sampleFromPool("mcq", 6));
    const shorts = (topic ? sampleFromPool("short", 4, topic) : sampleFromPool("short", 4));
    const combined = mcqs.concat(shorts).sort(() => 0.5 - Math.random()).slice(0, 10);
    const cacheKey = `curated_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const enriched = combined.map(q => ({ ...q, links: getLinksForTopic(q.topic || q.concept || q.category) }));
    const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
    writeJSONSafe(cachePath, { questions: enriched, createdAt: new Date().toISOString() });
    const clientQs = enriched.map((q) => {
      const c = { ...q };
      delete c.answer;
      delete c.keywords;
      return c;
    });
    res.json({ questions: clientQs, cacheKey });
  } catch (e) {
    console.error("/api/questions error", e && e.message);
    res.status(500).json({ error: "Failed to get questions" });
  }
});

// ----- API: courses list (from courses.json) -----
app.get('/api/courses', (req, res) => {
  try {
    const courses = readCourses();
    res.json({ count: courses.length, courses });
  } catch (e) {
    console.error('/api/courses error', e && e.message);
    res.status(500).json({ error: 'Failed to list courses' });
  }
});

// Check whether a course is accessible for a given user
app.get('/api/course-access', (req, res) => {
  try {
    const { courseId, userId } = req.query || {};
    if (!courseId) return res.status(400).json({ error: 'courseId required' });
    const course = getCourseById(courseId);
    if (!course) return res.status(404).json({ error: 'course not found' });
    let isAdmin = false;
    if (userId) {
      const users = readJSONSafe(USERS_FILE, []);
      const u = users.find(x => String(x.id) === String(userId) || String(x.email) === String(userId));
      if (u && u.role === 'admin') isAdmin = true;
    }
    if (course.locked && !isAdmin) {
      const prereq = course.prerequisite;
      if (prereq) {
        const ok = hasCompletedCourse(userId, prereq);
        return res.json({ accessible: !!ok, locked: true, prerequisite: prereq });
      }
      return res.json({ accessible: false, locked: true });
    }
    return res.json({ accessible: true, locked: !!course.locked });
  } catch (e) {
    console.error('/api/course-access error', e && e.message);
    res.status(500).json({ error: 'Failed to check course access' });
  }
});

// ----- API: submit answers & compute weak concepts -----
app.post("/api/submit", (req, res) => {
  try {
    const { userId, cacheKey, answers, courseId } = req.body || {};
    if (!userId || !cacheKey || !Array.isArray(answers)) return res.status(400).json({ error: "userId, cacheKey and answers[] required" });
    const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
    if (!fs.existsSync(cachePath)) return res.status(400).json({ error: "invalid or expired cacheKey" });
    const cached = readJSONSafe(cachePath, {});
    const questions = Array.isArray(cached.questions) ? cached.questions : [];
    let correctCount = 0;
    const perConcept = {};
    for (const q of questions) {
      const userAnsObj = answers.find((a) => a.id === q.id) || { answer: "" };
      const userAns = (userAnsObj.answer || "").toString();
      if (!perConcept[q.concept]) perConcept[q.concept] = { total: 0, scoreSum: 0, correctCount: 0 };
      perConcept[q.concept].total++;
      let qscore = 0;
      if (q.type === "mcq") {
        if (normalizeText(userAns) && normalizeText(q.answer) && normalizeText(userAns) === normalizeText(q.answer)) qscore = 1.0;
      } else {
        qscore = scoreShortAnswer(q.answer || "", userAns || "", q.keywords || []);
      }
      if (qscore >= 0.999) correctCount++;
      perConcept[q.concept].scoreSum += qscore;
      if (qscore > 0) perConcept[q.concept].correctCount++;
    }
    const weak = [];
    const perConceptSummary = {};
    for (const [concept, stats] of Object.entries(perConcept)) {
      const avg = stats.total ? stats.scoreSum / stats.total : 0;
      perConceptSummary[concept] = { averageScore: Number(avg.toFixed(3)), totalQuestions: stats.total, correctCount: stats.correctCount };
      if (avg < 0.6) weak.push({ concept, accuracy: Number(avg.toFixed(3)) });
    }
    const attempts = readJSONSafe(ATTEMPTS_FILE, []);
    const attemptId = uuidv4();
    const attempt = { id: attemptId, userId, cacheKey, courseId: courseId || null, score: correctCount, total: questions.length, perConcept: perConceptSummary, weakConcepts: weak, createdAt: new Date().toISOString() };
    attempts.push(attempt);
    writeJSONSafe(ATTEMPTS_FILE, attempts);
    const learning = weak.map((w) => {
      return { concept: w.concept, reason: `Average score ${w.accuracy}. Recommended revision: ${w.concept}.`, links: getLinksForTopic(w.concept) };
    });
    res.json({ attemptId, score: correctCount, total: questions.length, weak, perConcept: perConceptSummary, learning });
  } catch (e) {
    console.error("/api/submit error", e && e.message);
    res.status(500).json({ error: "Submit failed" });
  }
});

// Create admin user with secret (used for initial setup)
app.post('/api/admin/create', (req, res) => {
  try {
    const { username, password, secret } = req.body || {};
    const creationSecret = process.env.ADMIN_CREATION_SECRET || null;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    if (!creationSecret || String(secret || '') !== String(creationSecret)) return res.status(401).json({ error: 'invalid admin creation secret' });
    const users = readJSONSafe(USERS_FILE, []);
    if (users.find(u => u.email === username && u.role === 'admin')) return res.status(409).json({ error: 'admin already exists' });
    const { salt, hash } = hashPassword(password);
    const user = { id: uuidv4(), email: username, salt, hash, role: 'admin', createdAt: new Date().toISOString() };
    users.push(user);
    writeJSONSafe(USERS_FILE, users);
    const out = { id: user.id, email: user.email, createdAt: user.createdAt, role: user.role };
    res.status(201).json(out);
  } catch (e) {
    console.error('/api/admin/create error', e && e.message);
    res.status(500).json({ error: 'failed to create admin' });
  }
});

// admin: create student account
app.post('/api/admin/create-student', (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    const users = readJSONSafe(USERS_FILE, []);
    if (users.find(u => u.email === username)) return res.status(409).json({ error: 'user already exists' });
    const { salt, hash } = hashPassword(password);
    const user = { id: uuidv4(), email: username, salt, hash, role: 'student', createdAt: new Date().toISOString() };
    users.push(user);
    writeJSONSafe(USERS_FILE, users);
    // ensure the student is allowed to login by adding to allowed_users.json
    try {
      const allowed = readJSONSafe(ALLOWED_FILE, []);
      if (!Array.isArray(allowed)) {
        writeJSONSafe(ALLOWED_FILE, [String(username)]);
      } else {
        if (!allowed.includes(String(username))) {
          allowed.push(String(username));
          writeJSONSafe(ALLOWED_FILE, allowed);
        }
      }
    } catch (e) {
      console.warn('failed to add new student to allowed_users.json', e && e.message);
    }
    res.status(201).json({ id: user.id, email: user.email, createdAt: user.createdAt, role: user.role });
  } catch (e) {
    console.error('/api/admin/create-student error', e && e.message);
    res.status(500).json({ error: 'Failed to create student' });
  }
});

// admin: delete a student (and their enrollments and attempts)
app.delete('/api/admin/user/:id', (req, res) => {
  try {
    const id = req.params.id;
    let users = readJSONSafe(USERS_FILE, []);
    const found = users.find(u => String(u.id) === String(id));
    if (!found) return res.status(404).json({ error: 'user not found' });
    users = users.filter(u => String(u.id) !== String(id));
    writeJSONSafe(USERS_FILE, users);
    // remove enrollments and attempts
    let enroll = readJSONSafe(ENROLLMENTS_FILE, []);
    enroll = enroll.filter(e => String(e.userId) !== String(id));
    writeJSONSafe(ENROLLMENTS_FILE, enroll);
    let attempts = readJSONSafe(ATTEMPTS_FILE, []);
    attempts = attempts.filter(a => String(a.userId) !== String(id));
    writeJSONSafe(ATTEMPTS_FILE, attempts);
    res.json({ ok: true });
  } catch (e) {
    console.error('/api/admin/user delete error', e && e.message);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// admin: delete an enrollment
app.delete('/api/admin/enrollment/:id', (req, res) => {
  try {
    const id = req.params.id;
    let enroll = readJSONSafe(ENROLLMENTS_FILE, []);
    const found = enroll.find(e => String(e.id) === String(id));
    if (!found) return res.status(404).json({ error: 'enrollment not found' });
    enroll = enroll.filter(e => String(e.id) !== String(id));
    writeJSONSafe(ENROLLMENTS_FILE, enroll);
    res.json({ ok: true });
  } catch (e) {
    console.error('/api/admin/enrollment delete error', e && e.message);
    res.status(500).json({ error: 'Failed to delete enrollment' });
  }
});

// ----- admin endpoints -----
app.get("/api/admin/attempts", (req, res) => {
  const attempts = readJSONSafe(ATTEMPTS_FILE, []);
  res.json({ count: attempts.length, attempts: attempts.slice(-50).reverse() });
});
app.get('/api/admin/enrollments', (req, res) => {
  try {
    const enroll = readJSONSafe(ENROLLMENTS_FILE, []);
    res.json({ count: enroll.length, enrollments: enroll });
  } catch (e) {
    console.error('/api/admin/enrollments error', e && e.message);
    res.status(500).json({ error: 'Failed to read enrollments' });
  }
});

app.post('/api/admin/enroll', (req, res) => {
  try {
    const { userId, courseId } = req.body || {};
    if (!userId || !courseId) return res.status(400).json({ error: 'userId and courseId required' });
    const users = readJSONSafe(USERS_FILE, []);
    if (!users.find(u => String(u.id) === String(userId))) return res.status(404).json({ error: 'user not found' });
    const enroll = readJSONSafe(ENROLLMENTS_FILE, []);
    if (enroll.find(e => String(e.userId) === String(userId) && String(e.courseId) === String(courseId))) return res.status(409).json({ error: 'already enrolled' });
    const entry = { id: uuidv4(), userId, courseId, createdAt: new Date().toISOString() };
    enroll.push(entry);
    writeJSONSafe(ENROLLMENTS_FILE, enroll);
    res.status(201).json({ ok: true, enrollment: entry });
  } catch (e) {
    console.error('/api/admin/enroll error', e && e.message);
    res.status(500).json({ error: 'Failed to enroll' });
  }
});
app.get("/api/admin/users", (req, res) => {
  const users = readJSONSafe(USERS_FILE, []);
  const safe = users.map(u => ({ id: u.id, email: u.email, createdAt: u.createdAt, role: u.role || 'student' }));
  res.json({ count: users.length, users: safe });
});

// admin: get curated links (public read)
app.get('/api/admin/links', (req, res) => {
  try {
    const data = readJSONSafe(LINKS_FILE, {});
    res.json({ ok: true, links: data });
  } catch (e) {
    console.error('/api/admin/links get error', e && e.message);
    res.status(500).json({ error: 'Failed to read links' });
  }
});

// admin: save curated links (requires admin user)
app.post('/api/admin/links', (req, res) => {
  try {
    const { userId, links } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const users = readJSONSafe(USERS_FILE, []);
    const u = users.find(x => String(x.id) === String(userId) || String(x.email) === String(userId));
    if (!u || u.role !== 'admin') return res.status(403).json({ error: 'admin privileges required' });
    if (typeof links !== 'object' || Array.isArray(links)) return res.status(400).json({ error: 'links must be an object mapping topic->links' });
    writeJSONSafe(LINKS_FILE, links);
    // reload immediately
    LINKS_MAP = readJSONSafe(LINKS_FILE, {});
    res.json({ ok: true, links: LINKS_MAP });
  } catch (e) {
    console.error('/api/admin/links post error', e && e.message);
    res.status(500).json({ error: 'Failed to save links' });
  }
});

// admin: create a new course
app.post('/api/admin/create-course', (req, res) => {
  try {
    const { userId, title, topicList, description, level, locked } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const users = readJSONSafe(USERS_FILE, []);
    const u = users.find(x => String(x.id) === String(userId) || String(x.email) === String(userId));
    if (!u || u.role !== 'admin') return res.status(403).json({ error: 'admin privileges required' });
    if (!title) return res.status(400).json({ error: 'title required' });
    const courses = readCourses() || [];
    const id = uuidv4();
    const newCourse = {
      id,
      title: String(title),
      topic: Array.isArray(topicList) ? (topicList.join(', ') || '') : (String(topicList || '') || ''),
      topicList: Array.isArray(topicList) ? topicList : (String(topicList || '').split(',').map(s=>s.trim()).filter(Boolean)),
      description: String(description || ''),
      level: level || 1,
      locked: !!locked,
      createdAt: new Date().toISOString()
    };
    courses.push(newCourse);
    writeCourses(courses);
    res.status(201).json({ ok: true, course: newCourse });
  } catch (e) {
    console.error('/api/admin/create-course error', e && e.message);
    res.status(500).json({ error: 'Failed to create course' });
  }
});

// admin: delete a course (and its enrollments)
app.delete('/api/admin/course/:id', (req, res) => {
  try {
    const courseId = req.params.id;
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const users = readJSONSafe(USERS_FILE, []);
    const u = users.find(x => String(x.id) === String(userId) || String(x.email) === String(userId));
    if (!u || u.role !== 'admin') return res.status(403).json({ error: 'admin privileges required' });
    let courses = readCourses() || [];
    const idx = courses.findIndex(c => String(c.id) === String(courseId));
    if (idx === -1) return res.status(404).json({ error: 'course not found' });
    const removed = courses.splice(idx, 1)[0];
    writeCourses(courses);
    // remove enrollments for the course
    try {
      const enrolls = readJSONSafe(ENROLLMENTS_FILE, []);
      const filtered = (enrolls||[]).filter(e => String(e.courseId) !== String(courseId));
      writeJSONSafe(ENROLLMENTS_FILE, filtered);
    } catch (e) { /* ignore enrollment cleanup errors */ }
    res.json({ ok: true, course: removed });
  } catch (e) {
    console.error('/api/admin/course delete error', e && e.message);
    res.status(500).json({ error: 'Failed to delete course' });
  }
});

// admin: update a course (partial update)
app.put('/api/admin/course/:id', (req, res) => {
  try {
    const courseId = req.params.id;
    const { userId, ...updates } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const users = readJSONSafe(USERS_FILE, []);
    const u = users.find(x => String(x.id) === String(userId) || String(x.email) === String(userId));
    if (!u || u.role !== 'admin') return res.status(403).json({ error: 'admin privileges required' });
    let courses = readCourses() || [];
    const idx = courses.findIndex(c => String(c.id) === String(courseId));
    if (idx === -1) return res.status(404).json({ error: 'course not found' });
    const course = courses[idx];
    // Only allow certain fields to be updated
    const allowed = ['title','description','level','locked','topicList','topic'];
    for (const k of Object.keys(updates)) {
      if (!allowed.includes(k)) continue;
      if (k === 'topicList' && Array.isArray(updates[k])) {
        course.topicList = updates[k];
        course.topic = updates[k].join(', ');
      } else {
        course[k] = updates[k];
      }
    }
    courses[idx] = course;
    writeCourses(courses);
    res.json({ ok: true, course });
  } catch (e) {
    console.error('/api/admin/course update error', e && e.message);
    res.status(500).json({ error: 'Failed to update course' });
  }
});

// Public/user endpoints: fetch attempts for a specific user (by query param userId)
app.get('/api/attempts', (req, res) => {
  try {
    const userId = req.query.userId;
    const attempts = readJSONSafe(ATTEMPTS_FILE, []);
    if (!userId) return res.json({ count: attempts.length, attempts: attempts.slice(-50).reverse() });
    const mine = attempts.filter(a => String(a.userId) === String(userId)).slice(-50).reverse();
    return res.json({ count: mine.length, attempts: mine });
  } catch (e) {
    console.error('/api/attempts error', e && e.message);
    res.status(500).json({ error: 'Failed fetching attempts' });
  }
});

// fetch a single attempt by id
app.get('/api/attempt/:id', (req, res) => {
  try {
    const id = req.params.id;
    const attempts = readJSONSafe(ATTEMPTS_FILE, []);
    const found = attempts.find(a => String(a.id) === String(id));
    if (!found) return res.status(404).json({ error: 'Attempt not found' });
    return res.json({ attempt: found });
  } catch (e) {
    console.error('/api/attempt/:id error', e && e.message);
    res.status(500).json({ error: 'Failed fetching attempt' });
  }
});

// ----- cache fetch -----
app.get("/api/cache/:cacheKey", (req, res) => {
  try {
    const ck = req.params.cacheKey;
    const file = path.join(CACHE_DIR, `${ck}.json`);
    if (!fs.existsSync(file)) return res.status(404).json({ error: "cache not found" });
    const content = readJSONSafe(file, {});
    res.json({ ok: true, cacheKey: ck, data: content });
  } catch (e) {
    console.error("/api/cache error", e && e.message);
    res.status(500).json({ error: "Cache error" });
  }
});

// ----- Groq helper: list models -----
async function listGroqModels(apiKey) {
  try {
    const resp = await axios.get("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      timeout: 10000,
    });
    if (!resp || !resp.data) return [];
    const raw = Array.isArray(resp.data) ? resp.data : Array.isArray(resp.data.data) ? resp.data.data : [];
    return raw.map((m) => (m.id || m.model || m.name || "").toString()).filter(Boolean);
  } catch (err) {
    console.warn("listGroqModels failed:", err?.response?.data || err?.message);
    return [];
  }
}

// ----- AI tutor (Groq preferred, fallback safe) -----
app.post("/api/ai-tutor", async (req, res) => {
  try {
    const { concept = "tutoring", tutoringText: clientTutoringText, userAnswer = "" } = req.body || {};
    const apiKey = process.env.GROQ_API_KEY || null;
    let tutoringText = clientTutoringText || null;
    let fallbackUsed = false;
    // Preferences and fallback vars
    const preferred = ["llama3-70b", "llama3-8b", "mixtral-8x7b", "gemma-7b"];
    let chosenModel = null;

    // If api key present, try to discover models & call
    if (apiKey) {
      const available = await listGroqModels(apiKey);
      console.log("Available Groq models:", available.slice(0, 30));
      for (const pref of preferred) {
        const found = available.find((m) => m.toLowerCase().includes(pref.toLowerCase()));
        if (found) {
          chosenModel = found;
          break;
        }
      }
      if (!chosenModel && available.length > 0) chosenModel = available[0];

      if (chosenModel) {
        try {
          console.log("Calling Groq with model:", chosenModel);
          const prompt = `Please produce a tutoring guide for the concept: ${concept}\nStudent answer: "${userAnswer || "(empty)"}"\n
SIMPLE EXPLANATION\nDETAILED EXPLANATION\nWHY THE STUDENT'S ANSWER IS INCORRECT\nCORRECT UNDERSTANDING\nREAL-LIFE ANALOGY\nFULL WORKED EXAMPLE\nPRACTICE QUESTIONS (5) WITH BRIEF ANSWERS\n10-MINUTE STUDY PLAN\nUSEFUL LINKS (3)\nENCOURAGING MESSAGE`;

          const resp = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            { model: chosenModel, messages: [{ role: "user", content: prompt }], temperature: 0.2, max_tokens: 2000 },
            { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, timeout: 30000 }
          );
          tutoringText = resp?.data?.choices?.[0]?.message?.content || null;
          if (!tutoringText || tutoringText.trim().length < 120) {
            console.warn("Groq returned too-short content; using local fallback");
            tutoringText = null;
          } else {
            console.log("Groq tutoring length:", tutoringText.length);
          }
        } catch (err) {
          console.warn("Groq completion error for model", chosenModel, err?.response?.data || err?.message);
          tutoringText = null;
        }
      } else {
        console.warn("No available Groq models for this key; using fallback.");
      }
    } else {
      console.warn("GROQ_API_KEY not set; using fallback.");
    }

    // Local fallback (rich template)
    if (!tutoringText) {
      fallbackUsed = true;
      tutoringText = `===========================\nSIMPLE EXPLANATION\n${concept} is a core CS topic. (Beginner-friendly explanation.)\n\n===========================\nDETAILED EXPLANATION\nDetailed explanation and examples covering beginner→intermediate.\n\n===========================\nWHY THE STUDENT'S ANSWER IS INCORRECT\nStudent's answer: "${userAnswer || "(empty)"}". Explain missing parts.\n\n===========================\nCORRECT UNDERSTANDING\nClear correct explanation, examples and small code/pseudocode.\n\n===========================\nREAL-LIFE ANALOGY\nA simple analogy mapping the concept to everyday life.\n\n===========================\nFULL WORKED EXAMPLE\nStep-by-step example with explanation.\n\n===========================\nPRACTICE QUESTIONS (5) WITH BRIEF ANSWERS\n1) ...\n2) ...\n3) ...\n4) ...\n5) ...\n\n===========================\n10-MINUTE STUDY PLAN\nMinute 0–2: ...\nMinute 3–6: ...\nMinute 7–9: ...\nMinute 9–10: ...\n\n===========================\nUSEFUL LINKS\n- https://www.geeksforgeeks.org/\n- https://www.tutorialspoint.com/\n- https://www.youtube.com/\n\n===========================\nENCOURAGING MESSAGE\nKeep practicing — small focused sessions win!`;
    }

    // Return tutoring text and metadata
    return res.json({ ok: true, concept, tutoring: tutoringText, modelUsed: chosenModel || null, fallback: fallbackUsed });
  } catch (err) {
    console.error("AI tutor error:", err && err.message);
    return res.status(500).json({ error: "AI tutor failed", details: err?.response?.data || err?.message || String(err) });
  }
});

// ---------------- PDF endpoint ----------------
app.post("/api/ai-tutor/pdf", (req, res) => {
  try {
    const { concept = "tutoring", tutoringText } = req.body || {};
    if (!tutoringText) return res.status(400).json({ error: "Missing tutoringText" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${concept}_tutoring.pdf"`);

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    doc.pipe(res);

    // Title
    doc.fontSize(20).text(`AI Tutoring — ${concept}`, { underline: true });
    doc.moveDown();

    // Render tutoring text as plain paragraphs (we will append curated study links below)
    doc.fontSize(12).text(tutoringText, {
      align: "left",
      lineGap: 4
    });

    doc.moveDown(1);
    // Curated study links (only these three) — clickable
    const q = encodeURIComponent(String(concept || 'topic'));
    const studyLinks = [
      { label: 'W3Schools (search)', url: `https://www.google.com/search?q=${q}+site:w3schools.com` },
      { label: 'YouTube (search)', url: `https://www.youtube.com/results?search_query=${q}` },
      { label: 'GeeksforGeeks (search)', url: `https://www.google.com/search?q=${q}+site:geeksforgeeks.org` }
    ];

    doc.fontSize(14).text('Study Links', { underline: true });
    doc.moveDown(0.3);
    for (const item of studyLinks) {
      doc.fillColor('blue');
      doc.text(item.label + ': ' + item.url, { link: item.url, underline: true });
      doc.moveDown(0.2);
      doc.fillColor('black');
    }

    doc.end();
  } catch (e) {
    console.error("PDF generation error:", e);
    res.status(500).json({ error: "PDF generation failed" });
  }
});

// ---------------- Results PDF endpoint ----------------
app.post('/api/results/pdf', async (req, res) => {
  try {
    const { result, goldData, answersMap, userId, courseId } = req.body || {};
    if (!result || !goldData) return res.status(400).json({ error: 'result and goldData required' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="results_${result.id || Date.now()}.pdf"`);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.pipe(res);
    try { doc.font('Helvetica'); } catch (e) { /* ignore if font not available */ }

    // Title
    doc.fontSize(20).text(`Quiz Results — ${courseId || 'Assessment'}`, { underline: true });
    doc.moveDown();

    // Score summary
    doc.fontSize(12).text(`Student: ${userId || 'unknown'}`);
    doc.text(`Attempt ID: ${result.attemptId || result.id || ''}`);
    doc.text(`Score: ${result.score} / ${result.total}`);
    doc.moveDown();

    // Weak and strong concepts
    const per = result.perConcept || {};
    const weak = [];
    const strong = [];
    for (const [k,v] of Object.entries(per)) {
      const avg = Number(v.averageScore || 0);
      if (avg < 0.6) weak.push({ concept: k, avg });
      else if (avg >= 0.8) strong.push({ concept: k, avg });
    }

    doc.fontSize(14).text('Weak Concepts', { underline: true });
    doc.moveDown(0.2);
    if (weak.length === 0) doc.fontSize(12).text('None — great job!');
    else {
      weak.forEach(w => doc.fontSize(12).text(`- ${w.concept}: average ${Math.round(w.avg*100)}%`));
    }
    doc.moveDown();

    doc.fontSize(14).text('Strong Concepts', { underline: true });
    doc.moveDown(0.2);
    if (strong.length === 0) doc.fontSize(12).text('None identified.');
    else {
      strong.forEach(s => doc.fontSize(12).text(`- ${s.concept}: average ${Math.round(s.avg*100)}%`));
    }
    doc.moveDown();

    // Question by question: enriched explanations
    const goldQs = (goldData && goldData.questions) ? goldData.questions : [];
    doc.fontSize(14).text('Question Explanations', { underline: true });
    doc.moveDown(0.2);

    // Self URL for internal AI tutor calls
    const selfUrl = (process.env.SELF_URL) ? process.env.SELF_URL : `http://localhost:${process.env.PORT || 4000}`;

    for (let i=0;i<goldQs.length;i++) {
      const q = goldQs[i];
      const userAns = (answersMap && answersMap[q.id]) ? String(answersMap[q.id]) : '';
      const correct = q.answer || '';
      doc.fontSize(12).text(`${i+1}. ${q.question}`);
      doc.fontSize(11).text(`Correct answer: ${correct}`);
      doc.fontSize(11).text(`Student answer: ${userAns || '— no answer —'}`);

      // Try to get rich tutoring content from /api/ai-tutor for this question's concept
      let tutoringText = null;
      try {
        const aiResp = await axios.post(`${selfUrl}/api/ai-tutor`, { concept: q.concept || q.topic || q.category || 'Concept', userAnswer: userAns });
        if (aiResp && aiResp.data && aiResp.data.tutoring) tutoringText = String(aiResp.data.tutoring || '');
      } catch (e) {
        tutoringText = null;
      }

      // If AI returned structured tutoring, include it; otherwise build fallback sections
      if (tutoringText && tutoringText.length > 80) {
        if (doc.y > 700) doc.addPage();
        doc.moveDown(0.2);
        doc.fontSize(12).fillColor('black').text('SIMPLE EXPLANATION', { underline: true });
        // try to extract SIMPLE EXPLANATION block if present
        const simpleMatch = tutoringText.match(/SIMPLE EXPLANATION\s*\n([\s\S]*?)(?:\n={2,}|\nDETAILED EXPLANATION|$)/i);
        const simple = simpleMatch ? simpleMatch[1].trim() : tutoringText.split('\n').slice(0,3).join(' ');
        doc.fontSize(11).text(simple, { width: 480, lineGap: 3 });

        const detailedMatch = tutoringText.match(/DETAILED EXPLANATION\s*\n([\s\S]*?)(?:\n={2,}|\nWHY THE STUDENT|$)/i);
        const detailed = detailedMatch ? detailedMatch[1].trim() : (tutoringText.length > 300 ? tutoringText : tutoringText);
        if (doc.y > 700) doc.addPage();
        doc.moveDown(0.2);
        doc.fontSize(12).text('DETAILED EXPLANATION', { underline: true });
        doc.fontSize(11).text(detailed, { width: 480, lineGap: 3 });

        // WHY student's answer is incorrect
        if (doc.y > 700) doc.addPage();
        doc.moveDown(0.2);
        doc.fontSize(12).text("WHY THE STUDENT'S ANSWER IS INCORRECT", { underline: true });
        const whyMatch = tutoringText.match(/WHY THE STUDENT'S ANSWER IS INCORRECT\s*\n([\s\S]*?)(?:\n={2,}|\nCORRECT UNDERSTANDING|$)/i);
        const why = whyMatch ? whyMatch[1].trim() : `The student's answer differs from the model answer; review key terms and examples in the detailed explanation above.`;
        doc.fontSize(11).text(why, { width: 480, lineGap: 3 });

        // CORRECT UNDERSTANDING
        if (doc.y > 700) doc.addPage();
        doc.moveDown(0.2);
        doc.fontSize(12).text('CORRECT UNDERSTANDING', { underline: true });
        const correctMatch = tutoringText.match(/CORRECT UNDERSTANDING\s*\n([\s\S]*?)(?:\n={2,}|\nPRACTICE QUESTIONS|$)/i);
        const correctUnderstanding = correctMatch ? correctMatch[1].trim() : `Correct concept: ${q.concept || q.topic || 'Review the definition and examples.'}`;
        doc.fontSize(11).text(correctUnderstanding, { width: 480, lineGap: 3 });

        // PRACTICE QUESTIONS (try to parse)
        if (doc.y > 700) doc.addPage();
        doc.moveDown(0.2);
        doc.fontSize(12).text('PRACTICE QUESTIONS (5) — brief answers', { underline: true });
        const practiceMatch = tutoringText.match(/PRACTICE QUESTIONS\s*\(?5\)?[\s\S]*?\n([\s\S]*?)$/i);
        if (practiceMatch) {
          const practiceText = practiceMatch[1].trim().split('\n').filter(Boolean).slice(0,5);
          practiceText.forEach(pt => doc.fontSize(11).text('- ' + pt, { width: 480 }));
        } else {
          // fallback generated practice questions
          const pqs = [];
          const baseTopic = q.concept || q.topic || 'the topic';
          pqs.push({ q: `Explain briefly what ${baseTopic} means.`, a: `See the detailed explanation; ${correct}.` });
          pqs.push({ q: `Give one example where ${baseTopic} is used.`, a: `Example: ${baseTopic} applied in practice.` });
          pqs.push({ q: `List 2 common pitfalls in ${baseTopic}.`, a: `Pitfalls: missing edge-cases, incorrect assumptions.` });
          pqs.push({ q: `How would you test understanding of ${baseTopic}?`, a: `Solve small examples and explain output.` });
          pqs.push({ q: `Write one short exercise on ${baseTopic}.`, a: `Exercise: ... Answer: ${correct}.` });
          pqs.forEach(p => doc.fontSize(11).text(`- Q: ${p.q}  A: ${p.a}`, { width: 480 }));
        }

        // Study links tailored to the concept and question keywords
        if (doc.y > 700) doc.addPage();
        doc.moveDown(0.2);
        doc.fontSize(12).text('Study Links (targeted)', { underline: true });
        const queryParts = [q.concept || q.topic || '', q.answer || '', (q.keywords || []).join(' ')].filter(Boolean).join(' ');
        const qEnc = encodeURIComponent(queryParts || (q.concept || 'topic'));
        const targeted = [];
        targeted.push({ title: 'GeeksforGeeks (topic search)', url: `https://www.geeksforgeeks.org/search/?q=${qEnc}` });
        targeted.push({ title: 'YouTube (topic search)', url: `https://www.youtube.com/results?search_query=${qEnc}` });
        if ((String(q.concept || '').toLowerCase()).includes('sql') || (String(q.topic || '').toLowerCase()).includes('db') || (String(q.answer || '').toLowerCase()).includes('select')) {
          targeted.push({ title: 'SQLBolt (guided SQL lessons)', url: `https://sqlbolt.com/` });
          targeted.push({ title: 'MySQL Docs (search)', url: `https://dev.mysql.com/search/?q=${qEnc}` });
        }
        targeted.forEach(t => {
          doc.fillColor('blue').fontSize(11).text(t.title + ':', { continued: true });
          doc.text(' ' + t.url, { link: t.url, underline: true });
          doc.fillColor('black');
          doc.moveDown(0.1);
        });

      } else {
        // fallback templated content when AI tutor not available
        doc.moveDown(0.2);
        doc.fontSize(12).text('SIMPLE EXPLANATION', { underline: true });
        doc.fontSize(11).text(q.explanation || (`${q.concept || 'This concept'}: core idea — ${q.answer || 'see correct answer'}.`));

        doc.moveDown(0.2);
        doc.fontSize(12).text('DETAILED EXPLANATION', { underline: true });
        doc.fontSize(11).text((q.explanationLong || q.explanation || `Detailed explanation for ${q.concept || 'the topic'} goes here.`));

        doc.moveDown(0.2);
        doc.fontSize(12).text("WHY THE STUDENT'S ANSWER IS INCORRECT", { underline: true });
        doc.fontSize(11).text(userAns ? `The student's answer '${userAns}' misses key points compared with the model answer '${correct}'.` : 'No answer provided; student should attempt full worked examples.');

        doc.moveDown(0.2);
        doc.fontSize(12).text('CORRECT UNDERSTANDING', { underline: true });
        doc.fontSize(11).text(`Correct understanding: ${correct}`);

        doc.moveDown(0.2);
        doc.fontSize(12).text('PRACTICE QUESTIONS (5) — brief answers', { underline: true });
        const baseTopic = q.concept || q.topic || 'the topic';
        const pqs = [
          { q: `What is ${baseTopic}?`, a: `${correct}` },
          { q: `Give one example of ${baseTopic}.`, a: `Example: see detailed explanation.` },
          { q: `List one common mistake with ${baseTopic}.`, a: `Missing edge cases.` },
          { q: `How to verify ${baseTopic}?`, a: `Write small tests or queries.` },
          { q: `Short practice: apply ${baseTopic} to a sample input.`, a: `Answer: ${correct}` }
        ];
        pqs.forEach(p => doc.fontSize(11).text(`- Q: ${p.q}  A: ${p.a}`));

        doc.moveDown(0.2);
        doc.fontSize(12).text('Study Links (targeted)', { underline: true });
        const qEnc = encodeURIComponent([q.concept, q.question].filter(Boolean).join(' '));
        const tlinks = [
          { title: 'GeeksforGeeks (search)', url: `https://www.geeksforgeeks.org/search/?q=${qEnc}` },
          { title: 'YouTube (search)', url: `https://www.youtube.com/results?search_query=${qEnc}` }
        ];
        tlinks.forEach(t => { doc.fillColor('blue').fontSize(11).text(`${t.title}: ${t.url}`, { link: t.url, underline: true }); doc.fillColor('black'); doc.moveDown(0.1); });
      }

      doc.moveDown(0.6);
      if (doc.y > 720) doc.addPage();
    }

    // Consolidated Study Materials (topic-focused)
    doc.addPage();
    doc.fontSize(14).text('Consolidated Study Materials (targeted)', { underline: true });
    doc.moveDown(0.3);
    // Build a set of targeted links from weak concepts and question topics
    const seen = new Set();
    const targLinks = [];
    for (const q of goldQs) {
      const base = (q.concept || q.topic || '').trim();
      const qEnc = encodeURIComponent([base, q.question].filter(Boolean).join(' '));
      if (!base) continue;
      if (!seen.has(base)) {
        seen.add(base);
        targLinks.push({ title: `GeeksforGeeks - ${base}`, url: `https://www.geeksforgeeks.org/search/?q=${qEnc}` });
        targLinks.push({ title: `YouTube - ${base}`, url: `https://www.youtube.com/results?search_query=${qEnc}` });
        if ((String(base).toLowerCase()).includes('sql') || (String(base).toLowerCase()).includes('db')) {
          targLinks.push({ title: `SQLBolt - ${base}`, url: `https://sqlbolt.com/` });
          targLinks.push({ title: `TutorialsPoint SQL - ${base}`, url: `https://www.tutorialspoint.com/sql/index.htm` });
        }
      }
    }
    if (targLinks.length === 0) {
      targLinks.push({ title: 'GeeksforGeeks', url: 'https://www.geeksforgeeks.org/' });
      targLinks.push({ title: 'W3Schools', url: 'https://www.w3schools.com/' });
    }
    for (const l of targLinks) {
      doc.fillColor('blue').fontSize(11).text(`${l.title}: ${l.url}`, { link: l.url, underline: true });
      doc.fillColor('black');
      doc.moveDown(0.2);
      if (doc.y > 720) doc.addPage();
    }

    // Detailed study planning before Level 2 (more actionable steps)
    if (result.weak && result.weak.length > 0) {
      doc.addPage();
      doc.fontSize(14).text('Study Plan Before Next Assessment', { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(12).text('2-week plan (daily goals) focused on your weak topics:');
      doc.moveDown(0.2);
      const topWeak = (result.weak || []).slice(0,3).map(w => w.concept);
      for (let d=1; d<=14; d++) {
        const topic = topWeak[(d-1) % Math.max(1, topWeak.length)] || 'Mixed practice';
        doc.fontSize(11).text(`Day ${d}: (60–90 min) — 30 min theory on ${topic} (read one targeted link), 30–60 min practice problems (2–4 problems) focused on ${topic}.`);
        doc.moveDown(0.1);
        if (doc.y > 720) doc.addPage();
      }
      doc.moveDown(0.3);
      doc.fontSize(12).text('Before the next assessment: take 1 full timed mock, review all incorrect answers and re-run the practice questions for those topics.');
    }

    doc.end();
  } catch (e) {
    console.error('Results PDF error:', e && e.message);
    res.status(500).json({ error: 'Results PDF generation failed' });
  }
});
// ----- start server -----
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend RUNNING at http://localhost:${PORT}`);
  console.log("Curated pool:", curatedPool.length);
});