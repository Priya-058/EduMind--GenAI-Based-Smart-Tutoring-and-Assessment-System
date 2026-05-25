import React, { useState, useEffect } from "react";
import { Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";

import LoginPage from "./LoginPage";
import DashboardPage from "./DashboardPage";
import QuizPage from "./QuizPage";
import ResultsPage from "./ResultsPage";
import MyLearning from "./MyLearning";
import TutorPage from "./TutorPage";
import MainLayout from "./MainLayout";
import HomePage from "./HomePage";
import AdminPage from "./AdminPage";
import ProfilePage from "./ProfilePage";
import CourseDetail from "./CourseDetail";
import { addNotification, getNotificationsForUser, unreadCountForUser, markAllReadForUser } from './notifications';

export default function App() {
  // editMode removed globally
  const location = useLocation();
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || 'null');

  useEffect(() => {
    if (!user) return;
    try {
      const key = 'lastActive_' + (user.id || user.email);
      const prev = parseInt(localStorage.getItem(key) || '0', 10) || 0;
      const now = Date.now();
      const threeDays = 3 * 24 * 60 * 60 * 1000;
      if (prev && (now - prev) > threeDays) {
        addNotification({ title: 'We missed you!', body: 'You have not used EDUMIND for over 3 days. Come back!', userId: user.id || user.email, date: now });
      }
      localStorage.setItem(key, String(now));
    } catch (e) {}
  }, [user]);

  function logout() { localStorage.removeItem('user'); navigate('/'); }

  const showHeader = location.pathname !== '/';

  return (
    <div className="app">
      {showHeader && (
        <header className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div className="logo">EDUMIND</div>
            <nav style={{ display: 'flex', gap: 12 }}>
              <Link to="/dashboard" className={location.pathname === '/dashboard' ? 'active' : ''}>Dashboard</Link>
              <Link to="/home" className={location.pathname === '/home' ? 'active' : ''}>Home</Link>
              <Link to="/mylearning" className={location.pathname === '/mylearning' ? 'active' : ''}>My courses</Link>
              <Link to="/tutor" className={location.pathname === '/tutor' ? 'active' : ''}>Tutor</Link>
              {user && user.role === 'admin' && <Link to="/admin" className={location.pathname === '/admin' ? 'active' : ''}>Admin</Link>}
            </nav>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <NotificationBell user={user} />
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <ProfileMenu user={user} onLogout={logout} />
            </div>
            {/* Edit mode removed */}
          </div>
        </header>
      )}

      <Routes>
        <Route path="/" element={<div className="content"><LoginPage /></div>} />
        <Route path="/home" element={<MainLayout><HomePage /></MainLayout>} />
        <Route path="/dashboard" element={<MainLayout><DashboardPage /></MainLayout>} />
        <Route path="/quiz" element={<MainLayout><QuizPage /></MainLayout>} />
        <Route path="/results" element={<MainLayout><ResultsPage /></MainLayout>} />
        <Route path="/mylearning" element={<MainLayout><MyLearning /></MainLayout>} />
        <Route path="/course/:id" element={<MainLayout><CourseDetail /></MainLayout>} />
        <Route path="/tutor" element={<MainLayout><TutorPage /></MainLayout>} />
        <Route path="/admin" element={<MainLayout><AdminPage /></MainLayout>} />
        <Route path="/profile" element={<MainLayout><ProfilePage /></MainLayout>} />
      </Routes>
      <Footer />
    </div>
  );
}

function Footer() {
  return <footer className="footer">EDUMIND © {new Date().getFullYear()}</footer>;
}

function NotificationBell({ user }) {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    setUnread(unreadCountForUser(user));
    setNotifs(getNotificationsForUser(user));
  }, [user, open]);

  function toggle() {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen) {
      // mark all as read for this user when opening
      markAllReadForUser(user);
      setTimeout(() => { setNotifs(getNotificationsForUser(user)); setUnread(unreadCountForUser(user)); }, 50);
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button className="btn" title="Notifications" onClick={toggle} style={{ position: 'relative' }}>🔔
        {unread > 0 && <span className="badge" style={{ position: 'absolute', top: -6, right: -6 }}>{unread}</span>}
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 36, width: 320, background: '#fff', border: '1px solid #e5e7eb', boxShadow: '0 6px 18px rgba(15,23,42,0.08)', borderRadius: 8, zIndex: 40 }}>
          <div style={{ padding: 12, borderBottom: '1px solid #f3f4f6', fontWeight:700 }}>Notifications</div>
          <div style={{ maxHeight: 300, overflow: 'auto' }}>
            {notifs.length === 0 && <div style={{ padding: 12, color: '#6b7280' }}>No notifications</div>}
            {notifs.map(n => (
              <div key={n.id} style={{ padding: 10, borderBottom: '1px solid #f8fafc' }}>
                <div style={{ fontWeight: 600 }}>{n.title}</div>
                {n.body && <div style={{ fontSize: 13, color: '#6b7280' }}>{n.body}</div>}
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>{new Date(n.date).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    function onDoc(e) {
      if (!e.target.closest) return;
      const el = document.querySelector('.profile-menu-root');
      if (!el) return;
      if (!el.contains(e.target)) setOpen(false);
    }
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  const initials = user && user.email ? String(user.email).split('@')[0].slice(0,2).toUpperCase() : 'U';

  function goProfile() {
    setOpen(false);
    navigate('/profile');
  }

  function doLogout() {
    setOpen(false);
    onLogout && onLogout();
  }

  return (
    <div className="profile-menu-root" style={{ position: 'relative' }}>
      <button className="profile" title="Account" onClick={() => setOpen(o => !o)} style={{ border: 'none' }}>
        {initials}
      </button>
      {open && (
        <div className="profile-menu">
          <div className="profile-menu-item" onClick={goProfile} role="button">
            <div className="icon">P</div>
            <div>Profile</div>
          </div>
          <div className="profile-menu-item" onClick={doLogout} role="button">
            <div className="icon">⎋</div>
            <div>Logout</div>
          </div>
        </div>
      )}
    </div>
  );
}