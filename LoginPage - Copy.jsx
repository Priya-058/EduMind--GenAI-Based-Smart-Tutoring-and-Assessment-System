import React, { useState, useEffect } from "react";
import { login } from "./api";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    if (user) {
      // if admin, go to admin page
      if (user.role === 'admin') navigate('/admin'); else navigate('/dashboard');
    }
  }, [navigate]);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (!username || !password) { setErr("Enter username and password"); return; }
    try {
      // normal login flow
      const user = await login(username, password);
      localStorage.setItem("user", JSON.stringify(user));
      // record login day in dashboardEvents localStorage for tracking working days
      try {
        const key = new Date().toISOString().slice(0,10);
        const raw = localStorage.getItem('dashboardEvents') || '{}';
        const parsed = JSON.parse(raw);
        const arr = parsed[key] || [];
        const userId = user.id || user.email;
        const has = arr.some(ev => ev && ev.type === 'login' && ev.userId === userId);
        if (!has) {
          const loginEvent = { id: `login_${Date.now()}`, title: `Logged in (${user.email || userId})`, type: 'login', userId };
          parsed[key] = (parsed[key] || []).concat(loginEvent);
          try { localStorage.setItem('dashboardEvents', JSON.stringify(parsed)); } catch(e) {}
        }
      } catch (e) {}
      // redirect based on role
      if (user.role === 'admin') navigate('/admin'); else navigate('/dashboard');
    } catch (e) {
      const msg = e && e.body && e.body.error ? e.body.error : (e && e.message ? e.message : "Login failed — check backend");
      setErr(msg || 'Invalid login, please try again');
    }
  }

  return (
    <div className="center-card">
      <form className="card" onSubmit={submit} style={{ maxWidth: 520 }}>
        <h2>Log in to EDUMIND - Gen AI Based Smart Tutoring And Assessment System</h2>
        <div className="login-sub">EDUMIND provides personalized AI-driven tutoring, assessments and learning recommendations.</div>
        {err && <div className="alert">{err}</div>}
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Username</label>
        <input autoFocus placeholder="e.g. student_4 or admin@example.com" value={username} onChange={(e)=>setUsername(e.target.value)} />
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Password</label>
        <input type="password" placeholder="Password" value={password} onChange={(e)=>setPassword(e.target.value)} />
        {/* admin registration removed */}
        <button className="btn btn-primary" type="submit">Log in</button>
        <div style={{ marginTop: 10 }}>
          <a href="#" style={{ color: '#4f46e5', textDecoration: 'none', display:'block', marginBottom:8 }}>Lost password?</a>
          {/* guest access and cookies notice removed */}
        </div>
      </form>
    </div>
  );
}