import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCourses } from "./api";

export default function MyLearning() {
  const [attempts, setAttempts] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || 'null');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        if (!user) return setAttempts([]);
        const resp = await fetch(`http://localhost:4000/api/attempts?userId=${encodeURIComponent(user.id)}`);
        if (!resp.ok) throw new Error('Failed');
        const j = await resp.json();
        setAttempts(j.attempts || []);
      } catch (err) {
        console.error(err);
        setAttempts([]);
      } finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    let mounted = true;
    async function fetchCourses() {
      try {
        const j = await getCourses();
        const list = Array.isArray(j) ? j : (j.courses || []);
        if (user && user.id) {
          const enriched = await Promise.all(list.map(async (c) => {
            try {
              const resp = await fetch(`http://localhost:4000/api/course-access?courseId=${encodeURIComponent(c.id)}&userId=${encodeURIComponent(user.id)}`);
              if (!resp.ok) return { ...c, accessible: !(c.locked) };
              const body = await resp.json();
              return { ...c, accessible: !!body.accessible, locked: !!c.locked };
            } catch (e) { return { ...c, accessible: !(c.locked) }; }
          }));
          if (mounted) setCourses(enriched);
        } else {
          if (mounted) setCourses(list.map(c => ({ ...c, accessible: !(c.locked) })));
        }
      } catch (e) {
        console.error('Failed to load courses', e);
        if (mounted) setCourses([]);
      }
    }
    fetchCourses();

    // refresh when other parts of the app signal updates (e.g., after submitting a quiz)
    function onCoursesUpdated() { fetchCourses(); }
    window.addEventListener('coursesUpdated', onCoursesUpdated);
    return () => { mounted = false; window.removeEventListener('coursesUpdated', onCoursesUpdated); };
  }, []);

  return (
    <div>
      <h2>My courses</h2>
      <div style={{ marginTop: 8, marginBottom: 18, color: '#6b7280', fontWeight: 600 }}>Course overview</div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <button className="btn">All</button>
        <input placeholder="Search" style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb', width: 320 }} />
        <select style={{ padding: 8, borderRadius: 8 }} defaultValue="last">
          <option value="last">Sort by last accessed</option>
        </select>
        <button className="btn">Card</button>
      </div>

      <div style={{ marginTop: 12 }}>
        <h3>Your courses</h3>
        <div className="courses-grid" style={{ marginTop: 10 }}>
          {courses.map(c => {
            const isAdmin = user && user.role === 'admin';
            const isLocked = (typeof c.accessible === 'boolean') ? (!c.accessible && !!c.locked) : !!c.locked;
            return (
              <div key={c.id} className="course-card" onClick={() => {
                if (isLocked && !isAdmin) return alert('This course is locked for you. Complete the prerequisite first.');
                navigate(`/course/${c.id}`);
              }} style={{ cursor: isLocked && !isAdmin ? 'not-allowed' : 'pointer', position: 'relative' }}>
                {isLocked && !isAdmin && (
                  <div aria-hidden style={{ position: 'absolute', right: 10, top: 10, background: '#f8d7da', color: '#842029', padding: '6px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="locked">
                      <path d="M17 9V7a5 5 0 0 0-10 0v2" stroke="#842029" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                      <rect x="3.5" y="9" width="17" height="11" rx="2" stroke="#842029" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                      <circle cx="12" cy="14.5" r="1.4" fill="#842029"/>
                    </svg>
                  </div>
                )}
                <div className="course-image" style={{ backgroundImage: `url(${c.image || ''})`, backgroundSize: 'cover' }} />
                <div className="course-body">
                  <div style={{ fontWeight: 700 }}>{c.title}</div>
                  <div style={{ color: '#6b7280', fontSize: 13 }}>{(c.topicList || []).join(', ')}</div>
                </div>
              </div>
            );
          })}
        </div>

        <h3 style={{ marginTop: 18 }}>Recent Attempts</h3>
        {loading && <div>Loading attempts...</div>}
        {!loading && attempts.length === 0 && <div style={{ color: '#6b7280' }}>No attempts yet — take a quiz to appear here.</div>}
        <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          {attempts.map(a => (
            <div key={a.id} style={{ background: '#fff', padding: 12, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700 }}>Attempt {a.id.slice(0,8)}</div>
                <div style={{ color: '#6b7280' }}>{new Date(a.createdAt).toLocaleString()}</div>
                <div style={{ marginTop: 6 }}>Score: <strong>{a.score}</strong> / {a.total}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={() => navigate(`/results?attemptId=${a.id}`)}>Review</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}