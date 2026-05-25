import React, { useEffect, useState } from "react";
import { createStudent, listEnrollments, enrollStudent, getLinks, saveLinks } from "./api";
import { addNotification } from './notifications';
import './AdminPage.css';

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [enrollCourse, setEnrollCourse] = useState('');
  const [loading, setLoading] = useState(true);
  const [linksMap, setLinksMap] = useState({});
  const [linksLoading, setLinksLoading] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const currentUser = JSON.parse(localStorage.getItem('user') || 'null');
  const [newCourseTitle, setNewCourseTitle] = useState('');
  const [newCourseTopics, setNewCourseTopics] = useState('');
  const [newCourseDescription, setNewCourseDescription] = useState('');
  const [newCourseLevel, setNewCourseLevel] = useState(1);
  const [newCourseLocked, setNewCourseLocked] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const us = await fetch('/api/admin/users').then(r=>r.json()).then(d=>d.users||[]);
        setUsers(us);
        const cs = await fetch('/api/courses').then(r=>r.json()).then(d=>Array.isArray(d)?d:(d.courses||[]));
        // detect newly added courses compared to last snapshot and notify users
        try {
          const prev = JSON.parse(localStorage.getItem('courses_snapshot') || '[]');
          const prevIds = new Set((prev||[]).map(p=>String(p.id)));
          const newCourses = (cs||[]).filter(c => !prevIds.has(String(c.id)));
          if (newCourses.length && Array.isArray(us)) {
            newCourses.forEach(c => {
              us.forEach(u => {
                addNotification({ title: 'New course: ' + (c.title||'Untitled'), body: c.topic || '', userId: u.id, date: Date.now() });
              });
            });
          }
        } catch(e) { }
        try { localStorage.setItem('courses_snapshot', JSON.stringify(cs||[])); } catch(e){}
        setCourses(cs);
        const en = await listEnrollments().catch(()=>({enrollments:[]}));
        setEnrollments(en.enrollments || en || []);
        // load curated links
        try {
          const lresp = await getLinks().catch(()=>({links:{}}));
          setLinksMap(lresp.links || {});
        } catch(e) {}
      } catch (e) {
        console.error('admin load failed', e);
      } finally { setLoading(false); }
    })();
  }, []);

  function reload() {
    setLoading(true);
    Promise.all([
      fetch('/api/admin/users').then(r=>r.json()).then(d=>d.users||[]),
      fetch('/api/courses').then(r=>r.json()).then(d=>Array.isArray(d)?d:(d.courses||[])),
      listEnrollments().then(d=>d.enrollments||[]).catch(()=>[])
    ]).then(([us,cs,en]) => { setUsers(us); setCourses(cs); setEnrollments(en); }).catch(()=>{}).finally(()=>setLoading(false));
  }

  async function handleCreateStudent(e) {
    e.preventDefault();
    if (!newEmail || !newPassword) return alert('enter email and password');
    try {
      const s = await createStudent(newEmail, newPassword);
      if (enrollCourse) {
        await enrollStudent(s.id, enrollCourse).catch(()=>{});
      }
      setNewEmail(''); setNewPassword(''); setEnrollCourse('');
      reload();
      alert('student created');
    } catch (err) {
      console.error(err);
      alert('failed to create student: ' + (err && err.body && err.body.error ? err.body.error : (err.message||err)));
    }
  }

  async function handleDeleteUser(id) {
    if (!confirm('Delete this user? This will remove enrollments and attempts.')) return;
    try {
      await import('./api').then(m => m.deleteUser(id));
      reload();
      alert('user deleted');
    } catch (e) {
      console.error(e);
      alert('delete failed');
    }
  }

  async function handleDeleteEnrollment(id) {
    if (!confirm('Delete this enrollment?')) return;
    try {
      await import('./api').then(m => m.deleteEnrollment(id));
      reload();
      alert('enrollment deleted');
    } catch (e) { console.error(e); alert('delete failed'); }
  }

  function studentsForCourse(courseId) {
    const uids = new Set(enrollments.filter(en => String(en.courseId) === String(courseId)).map(en => String(en.userId)));
    return users.filter(u => uids.has(String(u.id)));
  }

  function userEmailById(id) {
    const u = users.find(x => String(x.id) === String(id));
    return u ? u.email : id;
  }

  return (
    <div>
      <h2>Admin</h2>
      <p>Simple admin panel — manage users and course enrollments.</p>
      {/* Edit mode removed — admin actions available directly */}

      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '360px 1fr', gap: 18 }}>
        <div>
          <h3>Create Student</h3>
          <form onSubmit={handleCreateStudent} style={{ background:'#fff', padding:12, borderRadius:8 }}>
            <label style={{ display:'block', fontSize:13, fontWeight:600 }}>Email</label>
            <input value={newEmail} onChange={e=>setNewEmail(e.target.value)} />
            <label style={{ display:'block', fontSize:13, fontWeight:600, marginTop:8 }}>Password</label>
            <input value={newPassword} onChange={e=>setNewPassword(e.target.value)} />
            <label style={{ display:'block', fontSize:13, fontWeight:600, marginTop:8 }}>Enroll in course (optional)</label>
            <select value={enrollCourse} onChange={e=>setEnrollCourse(e.target.value)}>
              <option value="">-- none --</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary" type="submit">Create student</button>
              <button type="button" className="btn" style={{ marginLeft: 8 }} onClick={reload}>Refresh</button>
            </div>
          </form>

          <h3 style={{ marginTop: 18 }}>Curated Links (per topic)</h3>
          <div style={{ background:'#fff', padding:12, borderRadius:8 }}>
            <div style={{ fontSize:13, color:'#444', marginBottom:8 }}>Manage topics and their suggested resources.</div>
            <div style={{ marginBottom: 8, display:'flex', gap:8 }}>
              <input placeholder="New topic name" value={newTopicName} onChange={e=>setNewTopicName(e.target.value)} />
              <button className="btn" onClick={() => {
                const t = (newTopicName || '').trim(); if (!t) return alert('Enter topic name');
                if (linksMap[t]) return alert('Topic exists');
                setLinksMap(m => ({ ...m, [t]: [] })); setNewTopicName('');
              }}>Add topic</button>
              <button className="btn" onClick={async()=>{ try { const r = await getLinks(); setLinksMap(r.links||{}); alert('Reloaded'); } catch(e){ alert('Reload failed'); } }}>Reload</button>
            </div>

            {Object.keys(linksMap).length === 0 && <div style={{ color:'#6b7280', marginBottom:8 }}>No topics yet.</div>}
            {Object.entries(linksMap).map(([topic, links]) => (
              <div key={topic} style={{ border: '1px solid #eef2f7', padding:10, borderRadius:6, marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ fontWeight:700 }}>{topic}</div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button className="btn" onClick={() => {
                      if (!confirm('Delete topic and its links?')) return; setLinksMap(m => { const c = { ...m }; delete c[topic]; return c; });
                    }}>Delete topic</button>
                  </div>
                </div>
                <div style={{ marginTop:8 }}>
                  {Array.isArray(links) && links.length === 0 && <div className="muted">No links for this topic.</div>}
                  {Array.isArray(links) && links.map((ln, idx) => (
                    <div key={idx} style={{ display:'grid', gridTemplateColumns:'1fr 320px 80px', gap:8, alignItems:'center', marginBottom:8 }}>
                      <input value={ln.title || ''} onChange={e => setLinksMap(m => { const c = JSON.parse(JSON.stringify(m)); c[topic][idx].title = e.target.value; return c; })} />
                      <input value={ln.url || ''} onChange={e => setLinksMap(m => { const c = JSON.parse(JSON.stringify(m)); c[topic][idx].url = e.target.value; return c; })} />
                      <div style={{ display:'flex', gap:8 }}>
                        <button className="btn" onClick={() => setLinksMap(m => { const c = JSON.parse(JSON.stringify(m)); c[topic].splice(idx,1); return c; })}>Remove</button>
                      </div>
                    </div>
                  ))}
                  <div style={{ marginTop: 6 }}>
                    <button className="btn" onClick={() => setLinksMap(m => { const c = JSON.parse(JSON.stringify(m)); c[topic] = c[topic] || []; c[topic].push({ title: 'New resource', url: 'https://' }); return c; })}>Add link</button>
                  </div>
                </div>
              </div>
            ))}

            <div style={{ marginTop:8, display:'flex', gap:8 }}>
              <button className="btn btn-primary" onClick={async()=>{
                if (!currentUser || currentUser.role !== 'admin') return alert('Admin only');
                setLinksLoading(true);
                try {
                  await saveLinks(currentUser.id || currentUser.email, linksMap);
                  alert('Links saved');
                } catch (err) { console.error(err); alert('Save failed: ' + (err && err.body && err.body.error ? err.body.error : (err.message||err)) ); }
                setLinksLoading(false);
              }} disabled={linksLoading}>{linksLoading ? 'Saving...' : 'Save links'}</button>
            </div>
          </div>

          <h3 style={{ marginTop: 18 }}>All users</h3>
          <div style={{ background:'#fff', padding: 12, borderRadius: 8 }}>
               <table style={{ width: '100%' }}>
                 <thead>
                   <tr><th style={{ textAlign:'left' }}>Email</th><th>Role</th><th>Actions</th></tr>
                 </thead>
                 <tbody>
                   {users.map(u => (
                     <tr key={u.id}>
                       <td>{u.email}</td>
                       <td>{u.role||'student'}</td>
                       <td style={{ textAlign:'center' }}>
                         <button className="btn" onClick={()=>handleDeleteUser(u.id)}>Delete</button>
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
          </div>
        </div>

        <div>
          <h3>Courses & Enrollments</h3>
          <div style={{ background: '#fff', padding: 12, borderRadius: 8, marginBottom: 12 }}>
            <div style={{ fontWeight:700, marginBottom:8 }}>Create Course</div>
            <div style={{ display:'grid', gap:8 }}>
              <input placeholder="Course title" value={newCourseTitle} onChange={e=>setNewCourseTitle(e.target.value)} />
              <input placeholder="Topics (comma separated)" value={newCourseTopics} onChange={e=>setNewCourseTopics(e.target.value)} />
              <input placeholder="Short description" value={newCourseDescription} onChange={e=>setNewCourseDescription(e.target.value)} />
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <label style={{ display:'flex', alignItems:'center', gap:6 }}><input type="checkbox" checked={newCourseLocked} onChange={e=>setNewCourseLocked(e.target.checked)} /> Locked</label>
                <label style={{ display:'flex', alignItems:'center', gap:6 }}>Level <input type="number" value={newCourseLevel} onChange={e=>setNewCourseLevel(Number(e.target.value||1))} style={{ width:80 }} /></label>
                <button className="btn btn-primary" onClick={async()=>{
                  if (!currentUser || currentUser.role !== 'admin') return alert('Admin only');
                  if (!newCourseTitle) return alert('Enter course title');
                  try {
                    const body = { userId: currentUser.id || currentUser.email, title: newCourseTitle, topicList: (newCourseTopics||'').split(',').map(s=>s.trim()).filter(Boolean), description: newCourseDescription, level: newCourseLevel, locked: newCourseLocked };
                    const resp = await fetch('/api/admin/create-course', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                    const j = await resp.json().catch(()=>null);
                    if (!resp.ok) return alert('Create failed: ' + (j && (j.error || j.message) ? (j.error || j.message) : resp.statusText));
                    alert('Course created'); setNewCourseTitle(''); setNewCourseTopics(''); setNewCourseDescription(''); setNewCourseLevel(1); setNewCourseLocked(false); reload();
                  } catch (e) { console.error(e); alert('Create failed: ' + (e && e.message)); }
                }}>Create course</button>
              </div>
            </div>
          </div>
          {loading && <div>Loading...</div>}
          {!loading && courses.map(c => (
            <div key={c.id} style={{ background: '#fff', padding: 12, borderRadius: 8, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight:700 }}>{c.title}</div>
                  <div style={{ color:'#6b7280' }}>{c.topic}</div>
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <div style={{ fontSize: 13 }}>{studentsForCourse(c.id).length} students</div>
                  <button className="btn" onClick={async()=>{
                    if (!currentUser || currentUser.role !== 'admin') return alert('Admin only');
                    try {
                      const resp = await fetch(`/api/admin/course/${encodeURIComponent(c.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser.id || currentUser.email, locked: !c.locked }) });
                      const j = await resp.json().catch(()=>null);
                      if (!resp.ok) return alert('Update failed: ' + (j && (j.error||j.message) ? (j.error||j.message) : resp.statusText));
                      alert((!c.locked ? 'Locked' : 'Unlocked') + ' successfully'); reload();
                    } catch (e) { console.error(e); alert('Update failed: ' + (e && e.message)); }
                  }}>{c.locked ? 'Unlock' : 'Lock'}</button>
                  <button className="btn btn-danger" onClick={async()=>{
                    if (!confirm('Delete this course? This will remove enrollments.')) return;
                    if (!currentUser || currentUser.role !== 'admin') return alert('Admin only');
                    try {
                      const resp = await fetch(`/api/admin/course/${encodeURIComponent(c.id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser.id || currentUser.email }) });
                      const j = await (resp.ok ? resp.json() : resp.json().catch(()=>({ error: 'delete failed' })));
                      if (!resp.ok) return alert('Delete failed: ' + (j && j.error ? j.error : 'unknown'));
                      alert('Course deleted'); reload();
                    } catch (e) { console.error(e); alert('Delete failed: ' + (e && e.message)); }
                  }}>Delete course</button>
                </div>
              </div>
                <div style={{ marginTop: 10 }}>
                {studentsForCourse(c.id).length === 0 && <div style={{ color:'#6b7280' }}>No students enrolled.</div>}
                {studentsForCourse(c.id).map(s => (
                  <div key={s.id} className="admin-card course-card" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ fontWeight:600 }}>{s.email}</div>
                      <div className="muted" style={{ fontSize:12 }}>{s.createdAt}</div>
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button className="btn btn-danger" onClick={()=>handleDeleteUser(s.id)}>Delete user</button>
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize:13, color:'#444', marginBottom:6 }}>Enrollments (raw)</div>
                  {(enrollments.filter(en=>en.courseId===c.id)||[]).map(en => (
                    <div key={en.id} className="enroll-row">
                      <div className="muted">{userEmailById(en.userId)}</div>
                      <div><button className="btn" onClick={()=>handleDeleteEnrollment(en.id)}>Remove</button></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
