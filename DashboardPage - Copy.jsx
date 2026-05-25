import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";

function monthName(m) {
  return ["January","February","March","April","May","June","July","August","September","October","November","December"][m];
}

function buildMonth(year, month) {
  // returns array of weeks, each week is array of day objects { date: Date | null }
  const first = new Date(year, month, 1);
  const startDay = first.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const weeks = [];
  let current = 1 - startDay; // may be negative or zero
  while (current <= daysInMonth) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      if (current > 0 && current <= daysInMonth) {
        week.push(new Date(year, month, current));
      } else {
        week.push(null);
      }
      current++;
    }
    weeks.push(week);
  }
  return weeks;
}

export default function DashboardPage() {
  const today = new Date();
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem("dashboardEvents") || "{}";
      const parsed = JSON.parse(raw);
      // ensure we have a login event for the current user if backend provided lastLogin
      if (user && user.lastLogin) {
        const key = user.lastLogin.slice(0,10);
        const arr = parsed[key] || [];
        const hasLogin = arr.some(a => a && a.type === 'login' && a.userId === (user.id || user.email));
        if (!hasLogin) {
          const loginEvent = { id: `login_${Date.now()}`, title: `Logged in (${user.email || user.id})`, type: 'login', userId: user.id || user.email };
          parsed[key] = (parsed[key] || []).concat(loginEvent);
        }
      }
      setEvents(parsed);
    } catch (e) { setEvents({}); }
  }, []);

  useEffect(() => {
    try { localStorage.setItem("dashboardEvents", JSON.stringify(events)); } catch (e) {}
  }, [events]);

  function gotoPrev() { if (month === 0) { setMonth(11); setYear(y => y-1);} else setMonth(m => m-1); }
  function gotoNext() { if (month === 11) { setMonth(0); setYear(y => y+1);} else setMonth(m => m+1); }

  function addEvent(date) {
    const key = date.toISOString().slice(0,10);
    const title = prompt("Add event for " + key + " (short text):");
    if (!title) return;
    setEvents(prev => {
      const newEvent = { id: Date.now(), title, userId: user ? (user.id || user.email) : undefined };
      const arr = (prev[key] || []).concat(newEvent);
      return { ...prev, [key]: arr };
    });
  }

  function removeEvent(date, id) {
    const key = date.toISOString().slice(0,10);
    setEvents(prev => {
      const allowedUserId = user ? (user.id || user.email) : undefined;
      const filtered = (prev[key] || []).filter(e => {
        if (e.id !== id) return true;
        // allow deletion if current user owns the event or if the current user is an admin
        if (!user) return false;
        if (user.role === 'admin') return false; // admin: remove the matching event
        return e.userId === allowedUserId;
      });
      const copy = { ...prev };
      if (filtered.length) copy[key] = filtered; else delete copy[key];
      return copy;
    });
  }

  const weeks = buildMonth(year, month);

  return (
    <div>
      <h2>Dashboard</h2>
      <h3>Hi, {user ? (user.email || user.id || 'student').toString().split('@')[0] : 'student'}! 👋</h3>
      {user && user.lastLogin && (
        <div style={{ color: '#6b7280', marginBottom: 12 }}>Last login: {new Date(user.lastLogin).toLocaleString()}</div>
      )}

      <div className="card">
        <h3>Calendar</h3>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn" onClick={gotoPrev}>&larr;</button>
            <div style={{ fontWeight: 700 }}>{monthName(month)} {year}</div>
            <button className="btn" onClick={gotoNext}>&rarr;</button>
          </div>
          <div>
            <button className="btn" onClick={() => { const d = new Date(); addEvent(new Date(year, month, d.getDate())) }} style={{ width: 40, height: 40, borderRadius: 8, fontSize: 20, paddingTop: 2 }}>+</button>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, textAlign: 'center', color: '#374151', fontWeight: 600 }}>
            <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginTop: 8 }}>
            {weeks.map((week, wi) => (
              week.map((d, di) => {
                if (!d) return <div key={`${wi}-${di}`} style={{ minHeight: 80, background: '#fbfbfb', borderRadius: 6 }} />;
                const key = d.toISOString().slice(0,10);
                // only show events for the current user, unless the logged-in user is an admin
                const allEvs = events[key] || [];
                const evs = allEvs.filter(e => {
                  if (!e) return false;
                  if (!user) return false;
                  if (user.role === 'admin') return true;
                  return e.userId === (user.id || user.email);
                });
                const hasLogin = evs.some(e => e && e.type === 'login');
                return (
                  <div key={`${wi}-${di}`} style={{ minHeight: 80, background: hasLogin ? '#eef6ff' : '#fff', border: hasLogin ? '2px solid #cfe3ff' : '1px solid #eee', borderRadius: 6, padding: 6, textAlign: 'left', position: 'relative' }}>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>{d.getDate()}</div>
                    <div style={{ fontSize: 13 }}>
                      {evs.slice(0,2).map(ev => (
                        <div key={ev.id} style={{ background: ev.type === 'login' ? '#dbeafe' : '#eef2ff', padding: '4px 6px', borderRadius: 4, marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12 }}>{ev.title}</span>
                          <button className="btn" style={{ padding: '2px 6px' }} onClick={() => removeEvent(d, ev.id)}>x</button>
                        </div>
                      ))}
                    </div>
                    <button className="btn" style={{ position: 'absolute', right: 6, bottom: 6, padding: '4px 8px' }} onClick={() => addEvent(d)}>Add</button>
                  </div>
                );
              })
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}