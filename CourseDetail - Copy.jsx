import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getCourses } from "./api";

export default function CourseDetail() {
  const { id } = useParams();
  const [course, setCourse] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || 'null');

  useEffect(() => {
    (async () => {
      try {
        const j = await getCourses();
        const list = Array.isArray(j) ? j : (j.courses || []);
        const found = list.find(c => String(c.id) === String(id));
        setCourse(found || null);
      } catch (e) {
        console.error('Failed to load course', e);
      }
    })();
  }, [id]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        if (!user) return setAttempts([]);
        const resp = await fetch(`http://localhost:4000/api/attempts?userId=${encodeURIComponent(user.id)}`);
        if (!resp.ok) throw new Error('Failed');
        const j = await resp.json();
        const mine = (j.attempts || []).filter(a => String(a.courseId || '') === String(id));
        setAttempts(mine);
      } catch (e) {
        console.error('Failed to load attempts', e);
        setAttempts([]);
      } finally { setLoading(false); }
    })();
  }, [id]);

  if (!course) return <div className="card">Course not found.</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>{course.title}</h2>
          <div style={{ color: '#6b7280' }}>{course.description || course.topic || ''}</div>
        </div>
        <div>
          <button className="btn" onClick={() => navigate('/mylearning')}>Back</button>
        </div>
      </div>

      <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div style={{ background: '#fff', padding: 12, borderRadius: 8 }}>
          <div style={{ fontWeight: 700 }}>Assessment</div>
          <div style={{ color: '#6b7280', marginTop: 8 }}>{course.topic || course.category || ''}</div>
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={() => {
              const isAdmin = user && user.role === 'admin';
              if (course.locked && !isAdmin) return alert('This course is locked for you. Complete prerequisites first.');
              navigate(`/quiz?topic=${encodeURIComponent(course.topic || '')}&courseId=${encodeURIComponent(course.id)}&userId=${encodeURIComponent(user ? user.id : '')}`);
            }}>Start Assessment</button>
          </div>
        </div>

        <div style={{ gridColumn: '1/-1' }}>
          <h3>Recent Attempts (this course)</h3>
          {loading && <div>Loading attempts...</div>}
          {!loading && attempts.length === 0 && <div style={{ color: '#6b7280' }}>No attempts for this course yet.</div>}
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
    </div>
  );
}
