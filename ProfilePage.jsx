import React from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from './MainLayout';

export default function ProfilePage() {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const navigate = useNavigate();
  function doLogout() { localStorage.removeItem('user'); navigate('/'); }

  if (!user) return (
    <MainLayout>
      <div style={{ padding: 24 }}>
        <h2>Profile</h2>
        <div style={{ marginTop: 12 }}>You are not logged in.</div>
      </div>
    </MainLayout>
  );

  const initials = (user.email || user.id || 'U').toString().split('@')[0].slice(0,2).toUpperCase();
  const created = user.createdAt ? new Date(user.createdAt).toLocaleString() : '—';
  const lastLogin = user.lastLogin ? new Date(user.lastLogin).toLocaleString() : '—';

  return (
    <MainLayout>
      <div style={{ padding: 28 }}>
        <h2>Profile</h2>

        <div style={{ marginTop: 18, background: '#fff', padding: 20, borderRadius: 12, boxShadow: '0 8px 24px rgba(15,23,42,0.04)', maxWidth: 920 }}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            <div style={{ width: 96, height: 96, borderRadius: 16, background: 'linear-gradient(135deg,#7c4dff,#ff80bf)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 28 }}>
              {initials}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{user.email || user.id}</div>
                  <div style={{ color: '#6b7280', marginTop: 6 }}>Role: <strong style={{ color: '#111' }}>{user.role || 'student'}</strong></div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" onClick={() => navigate('/mylearning')}>My courses</button>
                  <button className="btn btn-primary" onClick={doLogout}>Logout</button>
                </div>
              </div>

              <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ background: '#fafafa', padding: 12, borderRadius: 8 }}>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>User id</div>
                  <div style={{ fontWeight: 700, wordBreak: 'break-all' }}>{user.id}</div>
                </div>
                <div style={{ background: '#fafafa', padding: 12, borderRadius: 8 }}>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Created</div>
                  <div style={{ fontWeight: 700 }}>{created}</div>
                </div>
                <div style={{ background: '#fafafa', padding: 12, borderRadius: 8 }}>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Last login</div>
                  <div style={{ fontWeight: 700 }}>{lastLogin}</div>
                </div>
                <div style={{ background: '#fafafa', padding: 12, borderRadius: 8 }}>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Role</div>
                  <div style={{ fontWeight: 700 }}>{user.role || 'student'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
